import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const origin = new URL(process.env.DEADBOLT_MCP_ORIGIN ?? "http://127.0.0.1:3100");
if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) || !["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
  throw new Error("DEADBOLT_MCP_ORIGIN must be a localhost origin");
}
const executable = process.env.PLAYWRIGHT_MCP_EXECUTABLE_PATH ?? chromium.executablePath();
if (!existsSync(executable)) throw new Error("Install the project browser first: npx playwright install chromium");
const cli = resolve(dirname(require.resolve("@playwright/mcp")), "cli.js");
const child = spawn(process.execPath, [cli,
  "--headless", "--isolated", "--executable-path", executable,
  ...(process.env.DEADBOLT_MCP_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
  "--allowed-origins", origin.origin, "--output-dir", resolve(root, "test-results/mcp"),
], { cwd: root, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", () => { console.error("Could not start Playwright MCP"); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
