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
  task_id: string;
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

/** Completed is terminal; duplicate creation/capture responses cannot undo it. */
export async function updatePayment(paymentId: string, fields: Pick<PaymentRecord, "status" | "raw"> & Partial<Pick<PaymentRecord, "paypal_order_id" | "approve_url">>) {
  const row = unwrap<PaymentRecord | null>(
    await db().from("payments").update({ ...fields, updated_at: new Date().toISOString() })
      .eq("payment_id", paymentId)
      .in("status", fields.paypal_order_id ? ["CREATED"] : ["APPROVAL_PENDING"])
      .select().maybeSingle()
  );
  if (row) return row;
  const existing = await getPayment(paymentId);
  if (!existing) throw new Error("Payment not found");
  return existing;
}

export async function getPayment(paymentId: string) {
  return unwrap<PaymentRecord | null>(await db().from("payments").select().eq("payment_id", paymentId).maybeSingle());
}

export async function listPaymentsForAuthorization(authorizationId: string) {
  return unwrap<PaymentRecord[]>(
    await db().from("payments").select().eq("authorization_id", authorizationId).order("created_at")
  );
}

/** All authority-changing operations share one root-task lock in PostgreSQL. */
export async function transition<T>(operation: "revise" | "authorize" | "approve" | "reserve" | "capture", data: Record<string, unknown>): Promise<T> {
  const result = await db().rpc("deadbolt_transition", { operation, data });
  if (result.error && ["P0001", "23505"].includes(result.error.code)) throw new TransitionConflict(result.error.message);
  return unwrap<T>(result);

}

/** Used only by the operator to recover the same token after a lost response. */
export async function getCapabilityForAuthorization(authorizationId: string) {
  const row = unwrap<{ payload: CapabilityPayload } | null>(await db().from("capabilities").select("payload").eq("authorization_id", authorizationId).maybeSingle());
  return row?.payload ?? null;
}

export class TransitionConflict extends Error {}
