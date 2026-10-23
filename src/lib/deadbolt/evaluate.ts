/**
 * Authorization evaluation — the single seam /api/authorize calls.
 *
 * The deterministic pieces (hard policy engine, provenance analysis, decision
 * logic) live on the `rogelio-functional-logic` branch. Until that is merged,
 * this evaluator fails closed: a clear semantic mismatch is blocked and
 * everything else goes to human approval. Nothing is auto-authorized.
 *
 * After merging, replace the body with:
 *   const checks = evaluatePolicy(mandate, transaction);
 *   const findings = analyzeProvenance(provenance);
 *   const semantic = await evaluateIntent(mandate, transaction);
 *   return decide({ mandate, transaction, checks, findings, semantic });
 */
import { evaluateIntent } from "./semanticCheck";
import type { AuthorizationResult, Mandate, ProposedTransaction, ProvenanceEvent } from "./types";

export async function evaluateAuthorization(
  mandate: Mandate,
  transaction: ProposedTransaction,
  // Used once provenance analysis is wired in (see note above).
  _provenance: ProvenanceEvent[]
): Promise<AuthorizationResult> {
  const semantic = await evaluateIntent(mandate, transaction);

  if (semantic && semantic.intent_match < 0.5) {
    return {
      decision: "BLOCKED",
      risk_level: "HIGH",
      risk_score: 1 - semantic.intent_match,
      reasons: [semantic.reason, ...semantic.violations],
      checks: [],
      provenance_findings: [],
      semantic,
    };
  }

  return {
    decision: "REQUIRES_APPROVAL",
    risk_level: "MEDIUM",
    risk_score: 0.5,
    reasons: [
      "Hard policy engine is not connected yet; failing closed to human approval.",
      ...(semantic ? [semantic.reason] : ["Semantic intent check unavailable."]),
    ],
    checks: [],
    provenance_findings: [],
    semantic,
  };
}
