import assert from "node:assert/strict";
import { loadLocalEnvironment, applicationOrigin } from "./environment.mjs";

try {
  loadLocalEnvironment();
  const base = applicationOrigin(process.env);
  const get = async (path, data) => {
    const response = await fetch(base + path, { method: data ? "POST" : "GET", headers: { "Content-Type": "application/json" }, ...(data ? { body: JSON.stringify(data) } : {}), redirect: "error", signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`);
    return response.json();
  };
  assert.equal((await get("/api/health")).status, "ok");
  const scenarios = await get("/api/simulate");
  assert.equal(scenarios.length, 7, "Expected all seven demo scenarios");
  for (const scenario of scenarios) {
    const run = await get("/api/simulate", { scenario: scenario.id });
    assert.equal(run.outcome, scenario.id === "price_inflation" ? "awaiting_approval" : "authorized", scenario.id);
    assert.ok(run.attempts.length > 0);
    if (scenario.id === "prompt_injection") assert.equal(run.attempts[0].result.decision, "BLOCKED");
    console.log(`PASS ${scenario.id}: ${run.outcome} (${run.attempts.length} attempts)`);
  }
  const strict = await get("/api/simulate", { scenario: "price_inflation", block_on_untrusted_influence: true });
  assert.equal(strict.outcome, "gave_up");
  console.log("PASS strict price-inflation policy. No credentials or external services used.");
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message : "Smoke test failed. Start the app and check DEADBOLT_BASE_URL; no credentials were printed.");
  process.exitCode = 1;
}
