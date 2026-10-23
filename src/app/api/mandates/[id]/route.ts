/** GET /api/mandates/:id → one mandate version */
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/deadbolt/http";
import { getMandate } from "@/lib/deadbolt/store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const mandate = await getMandate(id);
    if (!mandate) return jsonError(404, "Mandate not found");
    return NextResponse.json(mandate);
  } catch (error) {
    return jsonError(500, (error as Error).message);
  }
}
