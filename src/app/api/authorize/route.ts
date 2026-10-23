/**
 * POST /api/authorize
 * { agent_id, mandate_id, transaction, provenance? }
 *
 * The agent calls this before checkout. Deadbolt evaluates the proposed
 * transaction against the mandate and returns AUTHORIZED (with a capability
 * token for /api/payments), REQUIRES_APPROVAL (pending a human via
 * /api/approvals/:id) or BLOCKED. Fails closed on any error.
 */
import { NextRequest, NextResponse } from "next/server";
import { issueCapability } from "@/lib/deadbolt/capability";
import { evaluateAuthorization } from "@/lib/deadbolt/evaluate";
import { jsonError, parseBody } from "@/lib/deadbolt/http";
import { newId } from "@/lib/deadbolt/ids";
import { AuthorizeSchema } from "@/lib/deadbolt/schemas";
import { getMandate, insertAuthorization, insertCapability, type AuthorizationStatus } from "@/lib/deadbolt/store";
import type { AuthorizationResult } from "@/lib/deadbolt/types";

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, AuthorizeSchema);
  if ("response" in parsed) return parsed.response;
  const { agent_id, mandate_id, transaction, provenance } = parsed.data;

  try {
    const mandate = await getMandate(mandate_id);
    if (!mandate) return jsonError(404, "Mandate not found");

    // Scope checks that make the request ineligible before any evaluation.
    let rejection: string | null = null;
    if (mandate.agent_id !== agent_id) rejection = "Agent is not the grantee of this mandate";
    else if (mandate.superseded_by) rejection = `Mandate was revised; use ${mandate.superseded_by}`;
    else if (Date.parse(mandate.expires_at) <= Date.now()) rejection = "Mandate has expired";

    const authorizationId = newId("dbt");
    const result: AuthorizationResult = rejection
      ? {
          decision: "BLOCKED",
          risk_level: "HIGH",
          risk_score: 1,
          reasons: [rejection],
          checks: [],
          provenance_findings: [],
          semantic: null,
        }
      : await evaluateAuthorization(mandate, transaction, provenance);

    const status: AuthorizationStatus =
      result.decision === "AUTHORIZED"
        ? "AUTHORIZED"
        : result.decision === "REQUIRES_APPROVAL"
          ? "PENDING_APPROVAL"
          : "BLOCKED";

    await insertAuthorization({
      authorization_id: authorizationId,
      mandate_id,
      agent_id,
      transaction,
      provenance,
      result,
      status,
      approval: null,
      created_at: new Date().toISOString(),
      resolved_at: status === "PENDING_APPROVAL" ? null : new Date().toISOString(),
    });

    let capability: { token: string; capability_id: string; expires_at: string } | null = null;
    if (status === "AUTHORIZED") {
      const issued = issueCapability(authorizationId, mandate, transaction);
      await insertCapability(issued.payload);
      capability = {
        token: issued.token,
        capability_id: issued.payload.capability_id,
        expires_at: issued.payload.expires_at,
      };
    }

    return NextResponse.json({
      authorization_id: authorizationId,
      decision: result.decision,
      risk: result.risk_level,
      risk_score: result.risk_score,
      reasons: result.reasons,
      capability,
    });
  } catch (error) {
    console.error(error);
    return jsonError(500, "Authorization failed; transaction not authorized");
  }
}
