/**
 * In-process authorizer for the simulated agent: policy engine + provenance
 * analysis + decision logic, with no network, database or LLM.
 *
 * Semantic intent uses a keyword heuristic in place of the Claude check so
 * demos and tests run offline. Production authorization goes through
 * /api/authorize, which uses the real semantic check.
 */
import { decide, type DecisionOptions } from "../decision";
import { evaluatePolicy, normalizeCategory, type PolicyContext } from "../policyEngine";
import { analyzeProvenance } from "../provenance";
import type { AuthorizationResult, Mandate, ProposedTransaction, ProvenanceEvent, SemanticEvaluation } from "../types";

export type Authorizer = (request: {
  transaction: ProposedTransaction;
  provenance: ProvenanceEvent[];
}) => Promise<AuthorizationResult>;

export function heuristicIntent(mandate: Mandate, tx: ProposedTransaction): SemanticEvaluation {
  const wanted = normalizeCategory(mandate.intent.category);
  const described = normalizeCategory(`${tx.product} ${tx.product_category ?? ""}`);
  const matches = described.includes(wanted);
  return matches
    ? { intent_match: 0.9, violations: [], reason: `Offline heuristic: product looks like a ${mandate.intent.category}.` }
    : {
        intent_match: 0.15,
        violations: [`"${tx.product}" does not appear to be a ${mandate.intent.category}`],
        reason: `Offline heuristic: requested ${mandate.intent.category}, proposed ${tx.product}.`,
      };
}

export function createLocalAuthorizer(
  mandate: Mandate,
  options: { policy?: PolicyContext; decision?: DecisionOptions } = {}
): Authorizer {
  return async ({ transaction, provenance }) =>
    decide(
      {
        mandate,
        transaction,
        checks: evaluatePolicy(mandate, transaction, options.policy),
        findings: analyzeProvenance(provenance),
        semantic: heuristicIntent(mandate, transaction),
      },
      options.decision
    );
}
