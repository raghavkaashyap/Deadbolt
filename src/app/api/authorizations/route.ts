/** GET /api/authorizations → recent authorization decisions (dashboard feed) */
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/deadbolt/http";
import { listAuthorizations } from "@/lib/deadbolt/store";

export async function GET() {
  try {
    return NextResponse.json(await listAuthorizations());
  } catch (error) {
    return jsonError(500, (error as Error).message);
  }
}
