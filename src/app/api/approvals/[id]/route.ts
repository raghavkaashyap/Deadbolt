import { TransitionConflict } from "@/lib/deadbolt/store";
import { requireAccess } from "@/lib/deadbolt/access";
/**
 * POST /api/approvals/:authorization_id
 * { decision: "approve" | "deny", channel?: "web" | "sms" | "voice", note? }
 *
 * Resolves a REQUIRES_APPROVAL authorization. Approval issues a capability
 * scoped to exactly that transaction; it never grants general spending power.
 */
import { NextRequest, NextResponse } from "next/server";
import { issueCapability, encodeCapability } from "@/lib/deadbolt/capability";
import { jsonError, parseBody } from "@/lib/deadbolt/http";
import { ApprovalSchema } from "@/lib/deadbolt/schemas";
import {
  getAuthorization,
  getCapabilityForAuthorization,
  getMandate,
  transition,
  type AuthorizationRecord,
} from "@/lib/deadbolt/store";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAccess(request, false);
  if (denied) return denied;
  const { id } = await params;
  const parsed = await parseBody(request, ApprovalSchema);
  if ("response" in parsed) return parsed.response;
  const { decision, channel, note } = parsed.data;

  try {
    const authorization = await getAuthorization(id);
    if (!authorization) return jsonError(404, "Authorization not found");
    if (authorization.status === "APPROVED" && decision === "approve") {
      const mandate = await getMandate(authorization.mandate_id);
      const payload = await getCapabilityForAuthorization(id);
      if (!mandate || mandate.superseded_by || !(Date.parse(mandate.expires_at) > Date.now()) || !payload || !(Date.parse(payload.expires_at) > Date.now())) {
        return jsonError(409, "Original approval capability is no longer valid");
      }
      return NextResponse.json({ authorization_id: id, status: "APPROVED", capability: {
        token: encodeCapability(payload), capability_id: payload.capability_id, expires_at: payload.expires_at,
      } });
    }
    if (authorization.status !== "PENDING_APPROVAL") {
      return jsonError(409, `Authorization is ${authorization.status}, not pending approval`);
    }

    const mandate = await getMandate(authorization.mandate_id);
    const approval = { decision, channel, note: note ?? null, at: new Date().toISOString() };

    if (!mandate || mandate.superseded_by || !(Date.parse(mandate.expires_at) > Date.now())) {
      return jsonError(409, "Mandate expired or was revised before approval");
    }
    const issued = decision === "approve" ? issueCapability(id, mandate, authorization.transaction) : null;
    await transition<AuthorizationRecord>("approve", {
      authorization_id: id, status: decision === "approve" ? "APPROVED" : "DENIED", approval,
      ...(issued ? { capability: issued.payload } : {}),
    });
    if (!issued) return NextResponse.json({ authorization_id: id, status: "DENIED", capability: null });

    return NextResponse.json({
      authorization_id: id,
      status: "APPROVED",
      capability: {
        token: issued.token,
        capability_id: issued.payload.capability_id,
        expires_at: issued.payload.expires_at,
      },
    });
  } catch (error) {
    if (error instanceof TransitionConflict) return jsonError(409, "Task state changed; refresh before retrying");
    console.error(error);
    return jsonError(500, "Approval failed");
  }
}
