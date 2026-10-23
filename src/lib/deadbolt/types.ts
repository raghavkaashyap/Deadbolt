/**
 * Shared Deadbolt domain types.
 *
 * This file is shared by the API layer (routes, intent compiler, capabilities)
 * and the functional layer (policy engine, decision logic, simulated agent).
 * Keep it identical across branches so they merge cleanly.
 */

export type Decision = "AUTHORIZED" | "REQUIRES_APPROVAL" | "BLOCKED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type TrustLevel = "trusted" | "semi_trusted" | "untrusted";

// ── Mandate ────────────────────────────────────────────────────────────────

/** A single attribute requirement, e.g. screen_size_in gte "27". */
export interface Requirement {
  attribute: string;
  operator: "gte" | "lte" | "eq";
  value: string;
}

export interface MandateIntent {
  action: "purchase";
  /** Normalized product category, e.g. "monitor", "ssd". */
  category: string;
  /** One-line restatement of what the user asked for. */
  description: string;
  /** Allowed brands. Empty means any brand. */
  brands: string[];
  condition: "new" | "used" | "refurbished" | "any";
  quantity: number;
  requirements: Requirement[];
}

export interface MandateConstraints {
  max_amount: number;
  currency: string;
  recurring: boolean;
  /** If non-empty, only these merchants are allowed. */
  allowed_merchants: string[];
  blocked_merchants: string[];
}

/** The authority a user delegates to an agent for one task. Immutable; revisions create a new version. */
export interface Mandate {
  mandate_id: string;
  version: number;
  parent_mandate_id: string | null;
  superseded_by: string | null;
  principal: string;
  agent_id: string;
  instruction: string;
  intent: MandateIntent;
  constraints: MandateConstraints;
  created_at: string;
  expires_at: string;
}

// ── Transaction & provenance ───────────────────────────────────────────────

export interface ProposedTransaction {
  merchant: string;
  product: string;
  product_category?: string;
  brand?: string;
  condition?: "new" | "used" | "refurbished";
  amount: number;
  currency: string;
  quantity?: number;
  recurring?: boolean;
  /** Payee account, if different from the merchant. */
  recipient?: string;
  attributes?: Record<string, string | number | boolean>;
}

/** Transaction fields that untrusted content must never be able to change. */
export const PROTECTED_FIELDS = [
  "merchant",
  "product",
  "amount",
  "quantity",
  "currency",
  "recurring",
  "recipient",
] as const;
export type ProtectedField = (typeof PROTECTED_FIELDS)[number];

/** One step in the agent's execution chain, reported by the agent. */
export interface ProvenanceEvent {
  step: number;
  timestamp: string;
  /** e.g. "user", "search", "browser", "merchant_page", "cart", "checkout". */
  tool: string;
  /** URL or identifier of where the content came from. */
  source: string;
  trust: TrustLevel;
  input?: string;
  output?: string;
  /** Protected fields this step set or changed, with their new values. */
  changed_fields?: Partial<Record<ProtectedField, unknown>>;
}

export interface ProvenanceFinding {
  severity: "medium" | "high";
  step: number;
  field?: ProtectedField;
  detail: string;
}

// ── Evaluation ─────────────────────────────────────────────────────────────

export interface Check {
  name: string;
  passed: boolean;
  detail: string;
  /** What a failure of this check means. */
  severity: "block" | "review";
}

export interface SemanticEvaluation {
  /** 0..1, how well the transaction matches the mandate's intent. */
  intent_match: number;
  violations: string[];
  reason: string;
}

export interface AuthorizationResult {
  decision: Decision;
  risk_level: RiskLevel;
  risk_score: number;
  reasons: string[];
  checks: Check[];
  provenance_findings: ProvenanceFinding[];
  semantic: SemanticEvaluation | null;
}
