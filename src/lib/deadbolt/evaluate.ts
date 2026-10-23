/** Production evaluation seam shared with the offline simulator. */
import { evaluateIntent } from "./semanticCheck";
import { evaluatePolicy } from "./policyEngine";
import { analyzeProvenance } from "./provenance";
import { decide } from "./decision";
import type { Mandate, ProposedTransaction, ProvenanceEvent } from "./types";

export async function evaluateAuthorization(mandate: Mandate, transaction: ProposedTransaction, provenance: ProvenanceEvent[]) {
  const checks = evaluatePolicy(mandate, transaction);
  const findings = analyzeProvenance(provenance);
  // Agent-supplied trust labels are not authenticated evidence. Until the API
  // records provenance itself, require the operator to review every purchase.
  findings.push({ severity: "medium", step: 0, detail: "Client-reported provenance requires operator verification of the merchant and purchase." });
  const semantic = await evaluateIntent(mandate, transaction);
  return decide({ mandate, transaction, checks, findings, semantic });
}
