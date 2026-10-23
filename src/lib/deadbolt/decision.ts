/**
 * Decision logic / risk engine (PRD §15).
 *
 * Combines hard-policy checks, provenance findings and the semantic intent
 * score into one decision:
 *   LOW    → AUTHORIZED
 *   MEDIUM → REQUIRES_APPROVAL
 *   HIGH   → BLOCKED
 * Any failed blocking check is BLOCKED regardless of score. Missing signals
 * raise risk rather than being ignored (fail closed).
 */
import type {
  AuthorizationResult,
  Check,
  Decision,
  Mandate,
  ProposedTransaction,
  ProvenanceFinding,
  RiskLevel,
  SemanticEvaluation,
} from "./types";

export const RISK_THRESHOLDS = { medium: 0.3, high: 0.7 } as const;

const WEIGHTS = {
  reviewCheck: 0.35,
  highFinding: 0.6,
  mediumFinding: 0.25,
  semanticUnavailable: 0.35,
  /** Multiplied by (1 - intent_match). */
  semanticMismatch: 0.5,
  semanticViolations: 0.15,
  /** intent_match below this is treated as a clear mismatch. */
  semanticBlockBelow: 0.4,
  semanticBlock: 0.7,
} as const;

export interface DecisionInput {
  mandate: Mandate;
  transaction: ProposedTransaction;
  checks: Check[];
  findings: ProvenanceFinding[];
  semantic: SemanticEvaluation | null;
}

export interface DecisionOptions {
  /** Block (instead of escalating) when untrusted content influenced a protected field. */
  blockOnUntrustedInfluence?: boolean;
}

export function riskLevel(score: number): RiskLevel {
  if (score >= RISK_THRESHOLDS.high) return "HIGH";
  if (score >= RISK_THRESHOLDS.medium) return "MEDIUM";
  return "LOW";
}

const DECISION_BY_LEVEL: Record<RiskLevel, Decision> = {
  LOW: "AUTHORIZED",
  MEDIUM: "REQUIRES_APPROVAL",
  HIGH: "BLOCKED",
};

export function decide(input: DecisionInput, options: DecisionOptions = {}): AuthorizationResult {
  const { checks, findings, semantic } = input;
  const reasons: string[] = [];
  let score = 0;

  // 1. Hard policy: any blocking failure is final.
  const blockingFailures = checks.filter((c) => !c.passed && c.severity === "block");
  const reviewFailures = checks.filter((c) => !c.passed && c.severity === "review");
  reasons.push(...blockingFailures.map((c) => `Policy violation (${c.name}): ${c.detail}`));
  reasons.push(...reviewFailures.map((c) => `Needs review (${c.name}): ${c.detail}`));
  score += reviewFailures.length * WEIGHTS.reviewCheck;

  // 2. Provenance
  const highFindings = findings.filter((f) => f.severity === "high");
  for (const finding of findings) {
    reasons.push(`Provenance: ${finding.detail}`);
    score += finding.severity === "high" ? WEIGHTS.highFinding : WEIGHTS.mediumFinding;
  }

  // 3. Semantic intent
  if (!semantic) {
    reasons.push("Semantic intent verification unavailable.");
    score += WEIGHTS.semanticUnavailable;
  } else {
    score += (1 - semantic.intent_match) * WEIGHTS.semanticMismatch;
    if (semantic.violations.length > 0) {
      score += WEIGHTS.semanticViolations;
      reasons.push(...semantic.violations.map((v) => `Intent: ${v}`));
    }
    if (semantic.intent_match < WEIGHTS.semanticBlockBelow) {
      score += WEIGHTS.semanticBlock;
      reasons.push(`Intent mismatch (${Math.round(semantic.intent_match * 100)}% match): ${semantic.reason}`);
    }
  }

  score = Math.min(1, Math.max(0, score));
  let decision = DECISION_BY_LEVEL[riskLevel(score)];

  if (blockingFailures.length > 0) {
    score = 1;
    decision = "BLOCKED";
  } else if (options.blockOnUntrustedInfluence && highFindings.some((f) => f.field)) {
    score = Math.max(score, RISK_THRESHOLDS.high);
    decision = "BLOCKED";
    reasons.push("Policy: transactions influenced by untrusted content are blocked.");
  }

  if (reasons.length === 0) {
    reasons.push("All policy checks passed, intent matches and no provenance anomalies were found.");
  }

  return {
    decision,
    risk_level: riskLevel(score),
    risk_score: Math.round(score * 100) / 100,
    reasons,
    checks,
    provenance_findings: findings,
    semantic,
  };
}
