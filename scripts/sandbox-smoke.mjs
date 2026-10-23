import { isDeepStrictEqual } from "node:util";
import { loadLocalEnvironment, configurationProblems, applicationOrigin } from "./environment.mjs";

class SmokeError extends Error {}

const fixture = {
  merchant: "Best Buy", product: "LG 27-inch QHD Monitor", product_category: "monitor", brand: "LG", condition: "new",
  amount: 219.99, currency: "USD", quantity: 1, recurring: false, attributes: { screen_size_in: 27 },
};
const instruction = "Buy one new LG 27-inch monitor for no more than 300 USD as a one-time purchase.";

try {
  loadLocalEnvironment();
  const [command, id, confirmation] = process.argv.slice(2);
  if (!["prepare", "checkout", "capture"].includes(command) || (command !== "prepare" && !/^[A-Za-z0-9_-]{1,100}$/.test(id ?? "")) || (command === "checkout" && confirmation !== "--approve")) {
    throw new SmokeError("Usage: smoke:sandbox -- prepare | checkout AUTHORIZATION_ID --approve | capture PAYMENT_ID");
  }
  if (configurationProblems(process.env, "sandbox").length) throw new SmokeError("Run npm run check:config first and resolve the listed fields");
  const base = applicationOrigin(process.env);
  const request = async (path, role, body) => {
    const key = role === "operator" ? process.env.DEADBOLT_OPERATOR_API_KEY : process.env.DEADBOLT_AGENT_API_KEY;
    const response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error", signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) throw new SmokeError(`Deadbolt returned HTTP ${response.status}; inspect its server logs and operator audit before retrying`);
    return response.json();
  };
  if (command === "prepare") {
    const { mandate } = await request("/api/mandates", "operator", { agent_id: process.env.DEADBOLT_AGENT_ID, instruction, principal: "smoke_test" });
    console.log(`Created mandate ${mandate.mandate_id}`);
    const result = await request("/api/authorize", "agent", { agent_id: process.env.DEADBOLT_AGENT_ID, mandate_id: mandate.mandate_id, transaction: fixture, provenance: [] });
    console.log(`Authorization ${result.authorization_id}: ${result.decision}`);
    if (result.decision !== "REQUIRES_APPROVAL") throw new SmokeError("Expected human review; inspect the authorization instead of bypassing policy");
    console.log(`Review: ${fixture.product} at ${fixture.merchant}, USD ${fixture.amount.toFixed(2)}. Synthetic purchase; the configured sandbox business is the actual payee.`);
    console.log(`To explicitly approve this test and create a sandbox order: npm run smoke:sandbox -- checkout ${result.authorization_id} --approve`);
  } else if (command === "checkout") {
    const authorization = await request(`/api/authorizations/${id}`, "operator");
    if (authorization.mandate?.principal !== "smoke_test" || authorization.mandate?.agent_id !== process.env.DEADBOLT_AGENT_ID || authorization.mandate?.instruction !== instruction || !isDeepStrictEqual(authorization.transaction, fixture)) throw new SmokeError("This authorization is not the fixed smoke-test purchase");
    const approved = await request(`/api/approvals/${id}`, "operator", { decision: "approve", channel: "web", note: "Explicit CLI sandbox smoke-test approval" });
    const payment = await request("/api/payments", "agent", { agent_id: process.env.DEADBOLT_AGENT_ID, capability_token: approved.capability.token, transaction: fixture });
    console.log(`Payment ${payment.payment_id}: ${payment.status}`);
    if (payment.approve_url) console.log(`Open this PayPal Sandbox link and sign in with the PERSONAL sandbox buyer:\n${payment.approve_url}`);
    console.log(`After buyer approval: npm run smoke:sandbox -- capture ${payment.payment_id}`);
  } else {
    const payment = await request(`/api/payments/${id}/capture`, "agent", {});
    console.log(`Payment ${payment.payment_id}: ${payment.status}`);
    if (payment.status !== "COMPLETED") throw new SmokeError("Payment is not complete; inspect the sandbox order and retry the same payment only after reconciliation");
    console.log("PASS sandbox capture. Repeat the same capture command to verify idempotent completion.");
  }
} catch (error) {
  console.error(error instanceof SmokeError ? error.message : "Request failed, timed out or returned invalid data; inspect the audit before retrying the same purchase");
  process.exitCode = 1;
}
