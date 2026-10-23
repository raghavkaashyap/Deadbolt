import { requireAccess } from "@/lib/deadbolt/access";
/**
 * GET /api/authorizations/:id → full authorization trace (PRD §19):
 * mandate, proposed transaction, provenance, checks, decision and payments.
 */
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/deadbolt/http";
import { getAuthorization, getMandate, listPaymentsForAuthorization } from "@/lib/deadbolt/store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAccess(_request, false);
  if (denied) return denied;
  const { id } = await params;
  try {
    const authorization = await getAuthorization(id);
    if (!authorization) return jsonError(404, "Authorization not found");

    const [mandate, payments] = await Promise.all([
      getMandate(authorization.mandate_id),
      listPaymentsForAuthorization(id),
    ]);
    return NextResponse.json({ ...authorization, mandate, payments });
  } catch (error) {
    return jsonError(500, (error as Error).message);
  }
}
