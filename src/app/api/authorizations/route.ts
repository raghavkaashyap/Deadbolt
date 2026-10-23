import { requireAccess } from "@/lib/deadbolt/access";
/** GET /api/authorizations → recent authorization decisions (dashboard feed) */
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/deadbolt/http";
import { listAuthorizations } from "@/lib/deadbolt/store";

export async function GET(request: Request) {
  const denied = requireAccess(request, false);
  if (denied) return denied;
  try {
    return NextResponse.json(await listAuthorizations());
  } catch (error) {
    return jsonError(500, (error as Error).message);
  }
}
