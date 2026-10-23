import { existsSync } from "node:fs";

export function loadLocalEnvironment() {
  if (typeof process.loadEnvFile !== "function") throw new Error("These scripts require Node.js 22 or newer");
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}

function configured(value) {
  return typeof value === "string" && value.trim().length > 0 && !/your-|change-me|placeholder|example\.com|your-project/i.test(value);
}

export function validOrigin(value) {
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return !url.username && !url.password && !url.search && !url.hash && url.pathname === "/" && (url.protocol === "https:" || (local && url.protocol === "http:"));
  } catch { return false; }
}

/** Return field names and remediation only; never return a credential value. */
export function configurationProblems(env, mode = "sandbox") {
  if (!["demo", "api", "sandbox"].includes(mode)) return ["Mode must be demo, api, or sandbox"];
  if (mode === "demo") return [];
  const problems = [];
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "DEADBOLT_AGENT_ID"];
  if (mode === "sandbox") required.push("PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET");
  for (const name of required) if (!configured(env[name])) problems.push(`${name}: required; replace the example value`);
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_APP_URL", "DEADBOLT_BASE_URL"]) {
    if (env[name] && !validOrigin(env[name])) problems.push(`${name}: use an HTTPS origin or localhost HTTP, without credentials, paths or query parameters`);
  }
  const secrets = ["DEADBOLT_OPERATOR_API_KEY", "DEADBOLT_AGENT_API_KEY", "DEADBOLT_CAPABILITY_SECRET"];
  for (const name of secrets) if (!configured(env[name]) || env[name].length < 32) problems.push(`${name}: use at least 32 random characters`);
  if (new Set(secrets.map(name => env[name])).size !== secrets.length) problems.push("Operator, agent and capability secrets must all differ");
  if (env.PAYPAL_API_BASE && env.PAYPAL_API_BASE !== "https://api-m.sandbox.paypal.com") problems.push("PAYPAL_API_BASE: only the PayPal Sandbox origin is supported");
  return problems;
}

export function applicationOrigin(env) {
  const origin = env.DEADBOLT_BASE_URL ?? env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (!validOrigin(origin)) throw new Error("DEADBOLT_BASE_URL must be an HTTPS origin or localhost HTTP");
  return new URL(origin).origin;
}
