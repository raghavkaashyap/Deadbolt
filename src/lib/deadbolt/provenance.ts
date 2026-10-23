/**
 * Provenance / taint analysis (PRD §13–14).
 *
 * Looks at the agent's execution chain for two things:
 *  1. untrusted content directly setting a protected transaction field, and
 *  2. protected fields changing after the agent was exposed to content that
 *     looks like injected instructions.
 * Not academically complete taint tracking — enough to make the concept enforceable.
 */
import type { ProtectedField, ProvenanceEvent, ProvenanceFinding } from "./types";

const INJECTION_PATTERNS = [
  /ignore (all |any )?(previous|prior|earlier|above) (instructions|directions|rules)/i,
  /disregard (the |your |all )?(previous |prior )?(instructions|mandate|rules)/i,
  /you are now/i,
  /system prompt/i,
  /new instructions?:/i,
  /(purchase|buy|order) .{0,60} instead/i,
  /to (verify|confirm|unlock) (your )?(checkout|account|order)/i,
  /do not (tell|inform|notify) the user/i,
];

export function looksLikeInjection(text: string | undefined) {
  return !!text && INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

function changedFields(event: ProvenanceEvent) {
  return Object.keys(event.changed_fields ?? {}) as ProtectedField[];
}

export function analyzeProvenance(events: ProvenanceEvent[]): ProvenanceFinding[] {
  if (events.length === 0) {
    return [{ severity: "medium", step: 0, detail: "No execution provenance was reported; selection path cannot be verified." }];
  }

  const findings: ProvenanceFinding[] = [];
  const ordered = [...events].sort((a, b) => a.step - b.step);
  let exposure: ProvenanceEvent | null = null;

  for (const event of ordered) {
    const fields = changedFields(event);

    if (event.trust === "untrusted") {
      for (const field of fields) {
        findings.push({
          severity: "high",
          step: event.step,
          field,
          detail: `Untrusted content from ${event.source} set protected field "${field}".`,
        });
      }
      if (looksLikeInjection(event.input) || looksLikeInjection(event.output)) {
        findings.push({
          severity: "medium",
          step: event.step,
          detail: `Content from ${event.source} contains instruction-like text aimed at the agent.`,
        });
        exposure ??= event;
      }
      continue;
    }

    // A trusted or semi-trusted step (e.g. the agent's own reasoning) changing
    // protected fields after exposure to injected content is treated as tainted.
    if (exposure && event.tool !== "user") {
      for (const field of fields) {
        findings.push({
          severity: "high",
          step: event.step,
          field,
          detail: `"${field}" changed at step ${event.step} after exposure to injected content at step ${exposure.step} (${exposure.source}).`,
        });
      }
    }
  }

  return findings;
}
