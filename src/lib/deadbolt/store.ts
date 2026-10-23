/**
 * Persistence for mandates, authorizations, capabilities and payments.
 * Schema: supabase/schema.sql. Server-side only — uses the service role key,
 * and the tables have RLS enabled with no public policies.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CapabilityPayload } from "./capability";
import type { AuthorizationResult, Mandate, ProposedTransaction, ProvenanceEvent } from "./types";

export type AuthorizationStatus =
  | "AUTHORIZED" // auto-authorized, capability issued
  | "PENDING_APPROVAL" // waiting on a human
  | "APPROVED" // human approved, capability issued
  | "DENIED" // human declined
  | "BLOCKED"; // blocked by Deadbolt

export interface AuthorizationRecord {
  authorization_id: string;
  mandate_id: string;
  agent_id: string;
  transaction: ProposedTransaction;
  provenance: ProvenanceEvent[];
  result: AuthorizationResult;
  status: AuthorizationStatus;
  approval: { decision: "approve" | "deny"; channel: string; note: string | null; at: string } | null;
  created_at: string;
  resolved_at: string | null;
}

export interface PaymentRecord {
  payment_id: string;
  capability_id: string;
  authorization_id: string;
  paypal_order_id: string | null;
  status: "CREATED" | "APPROVAL_PENDING" | "COMPLETED" | "FAILED";
  amount: number;
  currency: string;
  approve_url: string | null;
  raw: unknown;
  created_at: string;
  updated_at: string;
}

// Untyped client: the hand-written Database type in src/lib/supabase.ts only
// covers the example table. Rows are cast to the records above.
let _db: SupabaseClient | null = null;

function db() {
  if (!_db) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
    _db = createClient(url, key, { auth: { persistSession: false } });
  }
  return _db;
}

function unwrap<T>({ data, error }: { data: unknown; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// ── Mandates ───────────────────────────────────────────────────────────────

export async function insertMandate(mandate: Mandate) {
  return unwrap<Mandate>(await db().from("mandates").insert(mandate).select().single());
}

export async function getMandate(mandateId: string) {
  return unwrap<Mandate | null>(await db().from("mandates").select().eq("mandate_id", mandateId).maybeSingle());
}

export async function listMandates(limit = 50) {
  return unwrap<Mandate[]>(
    await db().from("mandates").select().order("created_at", { ascending: false }).limit(limit)
  );
}

/** Marks the old version superseded. Fails if it was already superseded (concurrent revision). */
export async function supersedeMandate(mandateId: string, newMandateId: string) {
  const rows = unwrap<Mandate[]>(
    await db()
      .from("mandates")
      .update({ superseded_by: newMandateId })
      .eq("mandate_id", mandateId)
      .is("superseded_by", null)
      .select()
  );
  return rows.length === 1;
}

export async function deleteMandate(mandateId: string) {
  unwrap(await db().from("mandates").delete().eq("mandate_id", mandateId));
}

// ── Authorizations ─────────────────────────────────────────────────────────

export async function insertAuthorization(record: AuthorizationRecord) {
  return unwrap<AuthorizationRecord>(await db().from("authorizations").insert(record).select().single());
}

export async function getAuthorization(authorizationId: string) {
  return unwrap<AuthorizationRecord | null>(
    await db().from("authorizations").select().eq("authorization_id", authorizationId).maybeSingle()
  );
}

export async function listAuthorizations(limit = 50) {
  return unwrap<AuthorizationRecord[]>(
    await db().from("authorizations").select().order("created_at", { ascending: false }).limit(limit)
  );
}

/** Resolve a pending authorization. Returns null if it was no longer pending. */
export async function resolvePendingAuthorization(
  authorizationId: string,
  status: "APPROVED" | "DENIED" | "BLOCKED",
  approval: AuthorizationRecord["approval"]
) {
  const rows = unwrap<AuthorizationRecord[]>(
    await db()
      .from("authorizations")
      .update({ status, approval, resolved_at: new Date().toISOString() })
      .eq("authorization_id", authorizationId)
      .eq("status", "PENDING_APPROVAL")
      .select()
  );
  return rows[0] ?? null;
}

// ── Capabilities ───────────────────────────────────────────────────────────

export async function insertCapability(payload: CapabilityPayload) {
  unwrap(
    await db().from("capabilities").insert({
      capability_id: payload.capability_id,
      authorization_id: payload.authorization_id,
      payload,
      expires_at: payload.expires_at,
    })
  );
}

/** Atomically mark a capability used. Returns false if it was already consumed (replay). */
export async function consumeCapability(capabilityId: string) {
  const rows = unwrap<unknown[]>(
    await db()
      .from("capabilities")
      .update({ consumed_at: new Date().toISOString() })
      .eq("capability_id", capabilityId)
      .is("consumed_at", null)
      .select()
  );
  return rows.length === 1;
}

// ── Payments ───────────────────────────────────────────────────────────────

export async function insertPayment(record: PaymentRecord) {
  return unwrap<PaymentRecord>(await db().from("payments").insert(record).select().single());
}

export async function updatePayment(paymentId: string, fields: Partial<PaymentRecord>) {
  return unwrap<PaymentRecord>(
    await db()
      .from("payments")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("payment_id", paymentId)
      .select()
      .single()
  );
}

export async function getPayment(paymentId: string) {
  return unwrap<PaymentRecord | null>(await db().from("payments").select().eq("payment_id", paymentId).maybeSingle());
}

export async function listPaymentsForAuthorization(authorizationId: string) {
  return unwrap<PaymentRecord[]>(
    await db().from("payments").select().eq("authorization_id", authorizationId).order("created_at")
  );
}
