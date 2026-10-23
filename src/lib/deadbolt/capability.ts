/**
 * Authorization capabilities (PRD §17).
 *
 * A capability is a short-lived, HMAC-signed token bound to one agent,
 * mandate version, merchant, product and amount. The payment endpoint
 * re-verifies it against the transaction immediately before execution, and
 * the database marks it consumed so it cannot be replayed.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { newId } from "./ids";
import type { Mandate, ProposedTransaction } from "./types";

const CAPABILITY_TTL_MS = 5 * 60 * 1000;

export interface CapabilityPayload {
  capability_id: string;
  authorization_id: string;
  mandate_id: string;
  agent_id: string;
  merchant: string;
  product_hash: string;
  max_amount: number;
  currency: string;
  expires_at: string;
  nonce: string;
}

function getSecret() {
  const secret = process.env.DEADBOLT_CAPABILITY_SECRET;
  if (!secret) throw new Error("DEADBOLT_CAPABILITY_SECRET is not set");
  return secret;
}

function sign(encodedPayload: string) {
  return createHmac("sha256", getSecret()).update(encodedPayload).digest("base64url");
}

/** Hash of the fields that identify what is being bought. Any change invalidates the capability. */
export function productHash(tx: ProposedTransaction) {
  const canonical = JSON.stringify([
    tx.merchant.trim().toLowerCase(),
    tx.product.trim().toLowerCase(),
    tx.quantity ?? 1,
    tx.currency.toUpperCase(),
    tx.recurring ?? false,
    tx.recipient ?? null,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

export function issueCapability(
  authorizationId: string,
  mandate: Mandate,
  tx: ProposedTransaction
): { token: string; payload: CapabilityPayload } {
  const payload: CapabilityPayload = {
    capability_id: newId("cap"),
    authorization_id: authorizationId,
    mandate_id: mandate.mandate_id,
    agent_id: mandate.agent_id,
    merchant: tx.merchant,
    product_hash: productHash(tx),
    max_amount: tx.amount,
    currency: tx.currency.toUpperCase(),
    expires_at: new Date(Date.now() + CAPABILITY_TTL_MS).toISOString(),
    nonce: randomBytes(16).toString("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${encoded}.${sign(encoded)}`, payload };
}

/** Verify signature, expiry and that the transaction is exactly what was authorized. */
export function verifyCapability(
  token: string,
  agentId: string,
  tx: ProposedTransaction
): { ok: true; payload: CapabilityPayload } | { ok: false; reason: string } {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return { ok: false, reason: "Malformed capability token" };

  const expected = Buffer.from(sign(encoded));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "Invalid capability signature" };
  }

  let payload: CapabilityPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "Malformed capability payload" };
  }

  if (Date.parse(payload.expires_at) <= Date.now()) return { ok: false, reason: "Capability expired" };
  if (payload.agent_id !== agentId) return { ok: false, reason: "Capability was issued to a different agent" };
  if (payload.merchant !== tx.merchant) return { ok: false, reason: "Merchant differs from the authorized merchant" };
  if (payload.product_hash !== productHash(tx)) {
    return { ok: false, reason: "Transaction changed after authorization" };
  }
  if (tx.currency.toUpperCase() !== payload.currency) return { ok: false, reason: "Currency differs from authorization" };
  if (tx.amount > payload.max_amount) return { ok: false, reason: "Amount exceeds the authorized amount" };

  return { ok: true, payload };
}
