import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "test-results/mcp");
const origin = "http://127.0.0.1:3100";
const client = new Client({ name: "deadbolt-mcp-test", version: "1.0.0" });
const transcript = [];
const checks = [];
let server;
let snapshot = "";

async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 30000 });
  const text = result.content.filter(item => item.type === "text").map(item => item.text).join("\n");
  transcript.push({ name, arguments: args, text, isError: !!result.isError });
  if (result.isError) throw new Error(`${name}: ${text}`);
  return text;
}
async function refresh() { snapshot = await call("browser_snapshot"); return snapshot; }
async function interact(name, label, args = {}) {
  await refresh();
  const line = snapshot.split("\n").find(line => line.includes(label) && line.includes("[ref="));
  const ref = line?.match(/\[ref=([^\]]+)\]/)?.[1];
  assert.ok(ref, `No current snapshot reference for ${label}`);
  return call(name, { element: label, ref, ...args });
}
async function evaluate(code) {
  const text = await call("browser_evaluate", { function: code });
  const result = text.match(/### Result\s*\n([\s\S]*?)(?=\n###|$)/)?.[1];
  assert.ok(result, "MCP evaluation returned no result");
  return JSON.parse(result.trim());
}
function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
async function runScenario(id) {
  await interact("browser_select_option", 'combobox "Scenario"', { values: [id] });
  await interact("browser_click", 'button "Run scenario"');
  await call("browser_wait_for", { text: "02 / Purchase attempts" });
  return evaluate(`() => ({
    scenario: document.querySelector('#scenario').value,
    decisions: [...document.querySelectorAll('button[aria-pressed]')].map(button => button.querySelector(':scope > span:last-child').textContent.trim()),
    overflow: document.documentElement.scrollWidth > window.innerWidth
  })`);
}

try {
  await mkdir(output, { recursive: true });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("App startup timed out; run npm run build first")), 15000);
    server.stdout.on("data", chunk => { if (String(chunk).includes("Ready")) { clearTimeout(timeout); resolve(); } });
    server.on("error", error => { clearTimeout(timeout); reject(error); });
    server.on("exit", code => { clearTimeout(timeout); reject(new Error(`App exited with code ${code}; check port 3100 and the production build`)); });
  });
  const env = { DEADBOLT_MCP_ORIGIN: origin };
  for (const name of ["PLAYWRIGHT_BROWSERS_PATH", "PLAYWRIGHT_MCP_EXECUTABLE_PATH", "DEADBOLT_MCP_NO_SANDBOX"]) if (process.env[name]) env[name] = process.env[name];
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(root, "scripts/playwright-mcp.mjs")], cwd: root, stderr: "inherit", env }));
  const tools = await client.listTools();
  assert.ok(tools.tools.some(tool => tool.name === "browser_snapshot"));
  await call("browser_navigate", { url: origin });
  await call("browser_resize", { width: 1280, height: 900 });
  assert.match(await refresh(), /Intent becomes a boundary/);
  pass("MCP handshake, navigation and accessibility snapshot");

  const expected = {
    happy_path: ["Authorized"], prompt_injection: ["Blocked", "Authorized"], over_budget: ["Blocked", "Blocked", "Authorized"],
    price_inflation: ["Needs review"], hidden_subscription: ["Blocked", "Authorized"], merchant_substitution: ["Blocked", "Authorized"], ssd_purchase: ["Authorized"],
  };
  for (const [id, decisions] of Object.entries(expected)) {
    const result = await runScenario(id);
    assert.equal(result.scenario, id); assert.deepEqual(result.decisions, decisions); assert.equal(result.overflow, false);
    pass(`scenario ${id}`);
    if (id === "prompt_injection") {
      assert.match(await refresh(), /Execution provenance/);
      await call("browser_take_screenshot", { filename: "desktop.png", fullPage: true });
    }
  }
  await call("browser_resize", { width: 390, height: 844 });
  await runScenario("price_inflation");
  await interact("browser_click", 'checkbox "Block untrusted field changes');
  await interact("browser_click", 'button "Run scenario"');
  await call("browser_wait_for", { text: "02 / Purchase attempts" });
  const mobile = await evaluate(`() => ({ blocked: document.querySelector('button[aria-pressed=true]').innerText.includes('Blocked'), overflow: document.documentElement.scrollWidth > innerWidth })`);
  assert.equal(mobile.blocked, true); assert.equal(mobile.overflow, false);
  await call("browser_take_screenshot", { filename: "mobile.png", fullPage: true });
  pass("mobile layout and strict untrusted-influence block");

  const consoleMessages = await call("browser_console_messages", { onlyErrors: true });
  assert.doesNotMatch(consoleMessages, /\[ERROR\]|TypeError|Uncaught/);
  pass("no browser console errors during normal scenario runs");

  // Inject only a local fetch failure; never contact a payment endpoint.
  await evaluate(`() => { window.__deadboltOriginalFetch = window.fetch; window.fetch = async () => new Response('{}', { status: 503 }); return true; }`);
  await interact("browser_click", 'button "Run scenario"');
  await call("browser_wait_for", { text: "Check your connection and try again." });
  await evaluate(`() => { window.fetch = window.__deadboltOriginalFetch; delete window.__deadboltOriginalFetch; return true; }`);
  await interact("browser_click", 'button "Run scenario"');
  await call("browser_wait_for", { text: "02 / Purchase attempts" });
  pass("network error display and retry recovery");
  const network = await call("browser_network_requests");
  assert.doesNotMatch(network, /\/api\/(mandates|authorize|approvals|payments)/);
  pass("demo makes no private authorization or payment API calls");
  await call("browser_close");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await writeFile(resolve(output, "report.json"), JSON.stringify({ passed: checks, success: !process.exitCode, transcript }, null, 2));
  await client.close();
  server?.kill("SIGTERM");
}
