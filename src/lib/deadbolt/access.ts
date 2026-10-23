/** Single-operator sandbox access. Never give the operator key to an agent. */
import { timingSafeEqual } from "crypto";
import { jsonError } from "./http";

export function requireAccess(request: Request, agent = false) {
  const secret = agent ? process.env.DEADBOLT_AGENT_API_KEY : process.env.DEADBOLT_OPERATOR_API_KEY;
  if (!secret || secret.length < 32 || (agent && !process.env.DEADBOLT_AGENT_ID) || process.env.DEADBOLT_OPERATOR_API_KEY === process.env.DEADBOLT_AGENT_API_KEY) return jsonError(503, "API access is not configured");
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (Buffer.byteLength(provided) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return jsonError(401, "Unauthorized");
  }
  return null;
}

export function requireAgentIdentity(agentId: string) {
  return agentId === process.env.DEADBOLT_AGENT_ID ? null : jsonError(403, "Agent identity does not match its credential");
}
