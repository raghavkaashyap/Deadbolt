# Playwright MCP

The project includes Microsoft's official `@playwright/mcp` server, pinned as a development dependency, plus a local launcher and an MCP protocol test client. This is separate from the existing `@playwright/test` regression suite.

## Connect a local MCP client

```bash
npm ci
npx playwright install chromium
npm run build
npm run start -- --hostname 127.0.0.1 --port 3100
```

Start your MCP client from the repository root. `.mcp.json` contains the common `mcpServers` configuration:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": ["scripts/playwright-mcp.mjs"]
    }
  }
}
```

If your client does not read `.mcp.json` automatically, import that server entry into its settings. Use an absolute path to the script when the client starts outside the repository. The launcher sets the server workspace to the repository directory.

The launcher starts an isolated, headless browser and allows requests to `http://127.0.0.1:3100` by default. To inspect your separately running dev server, set `DEADBOLT_MCP_ORIGIN=http://localhost:3000` in the MCP server's environment. The wrapper accepts loopback origins only. Origin filtering is a test convenience, not a security sandbox. No user browser profile, payment credentials or private API keys are loaded by the launcher.

An MCP config file is a connection recipe for a supporting client; it does not register a new built-in tool inside an already running chat. In this task, the test client connects to the server over stdio and invokes actual MCP `tools/list` and `tools/call` requests.

## Repeat the MCP tests

```bash
npm run build
npm run test:mcp
```

This command starts its own production app on port 3100 and connects a fresh MCP client/browser. Stop any other server using that port first. It closes the browser, client and app afterwards. It does not use `playwright test` to perform these interactions.

The test calls MCP navigation, accessibility snapshots, element-reference clicks, dropdown selection, resizing, evaluation, console/network inspection and screenshots. It verifies:

- MCP handshake and the home-page accessibility snapshot.
- The expected decision sequence for all seven shopping scenarios.
- Strict blocking of the untrusted checkout price change.
- Mobile layout without horizontal overflow at 390 × 844.
- No console errors during normal scenario runs.
- A simulated fetch failure produces a visible error and recovers on retry.
- The demo makes no private mandate/authorization/approval/payment API calls.

The fake catalog and browser fetch failure are test fixtures. No real Anthropic, Supabase or PayPal operation is performed. The existing manual Sandbox test in `TESTING.md` remains a separate integration check.

Artifacts are written to ignored `test-results/mcp/`: `desktop.png`, `mobile.png`, and `report.json`. The report includes named checks and the MCP text transcript. It should only contain the synthetic demo, never a signed-in profile or private payment flow.

## Containers and browser compatibility

The server is pinned to `@playwright/mcp@0.0.45`, using the installed project browser rather than its separately versioned browser download. The direct `playwright` dependency stays aligned with `@playwright/test@1.56.1` so the browser-install command remains deterministic.

On normal user machines, keep browser sandboxing enabled. An ephemeral root container may require `DEADBOLT_MCP_NO_SANDBOX=1`; this flag is explicit and is used only for the local/CI test environment. A container without Unix-socket support may also need the installed Chromium **headless shell** rather than the full Chrome binary. Supply that binary's absolute path in `PLAYWRIGHT_MCP_EXECUTABLE_PATH`. The launcher honors `PLAYWRIGHT_BROWSERS_PATH` as well. These are environment-specific test settings, not changes to the application.

For this workspace the successful run used the installed headless shell and the explicit container override. All 12 named MCP checks passed. The normal Playwright browser suite remains available with `npm run test:browser`.

Official server documentation: https://github.com/microsoft/playwright-mcp
