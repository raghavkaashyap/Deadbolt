/**
 * POST /api/approvals/:authorization_id
 * { decision: "approve" | "deny", channel?: "web" | "sms" | "voice", note? }
 *
 * Resolves a REQUIRES_APPROVAL authorization. Approval issues a capability
 * scoped to exactly that transaction; it never grants general spending power.
 */
import { NextRequest, NextResponse } from "next/server";
import { issueCapability } from "@/lib/deadbolt/capability";
import { jsonError, parseBody } from "@/lib/deadbolt/http";
import { ApprovalSchema } from "@/lib/deadbolt/schemas";
import {
  getAuthorization,
  getMandate,
  insertCapability,
  resolvePendingAuthorization,
} from "@/lib/deadbolt/store";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseBody(request, ApprovalSchema);
  if ("response" in parsed) return parsed.response;
  const { decision, channel, note } = parsed.data;

  try {
    const authorization = await getAuthorization(id);
    if (!authorization) return jsonError(404, "Authorization not found");
    if (authorization.status !== "PENDING_APPROVAL") {
      return jsonError(409, `Authorization is ${authorization.status}, not pending approval`);
    }

    const mandate = await getMandate(authorization.mandate_id);
    const approval = { decision, channel, note: note ?? null, at: new Date().toISOString() };

    // The mandate may have expired or been revised while we waited for the human.
    const stale =
      !mandate || mandate.superseded_by || Date.parse(mandate.expires_at) <= Date.now()
        ? "Mandate expired or was revised before approval"
        : null;

    if (decision === "deny" || stale) {
      const resolved = await resolvePendingAuthorization(id, decision === "deny" ? "DENIED" : "BLOCKED", approval);
      if (!resolved) return jsonError(409, "Authorization was resolved concurrently");
      return NextResponse.json({ authorization_id: id, status: resolved.status, reason: stale, capability: null });
    }

    const resolved = await resolvePendingAuthorization(id, "APPROVED", approval);
    if (!resolved) return jsonError(409, "Authorization was resolved concurrently");

    const issued = issueCapability(id, mandate!, authorization.transaction);
    await insertCapability(issued.payload);

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
    console.error(error);
    return jsonError(500, "Approval failed");
  }
}
