import { NextResponse } from "next/server";

/**
 * GET /api/health
 * Simple health-check endpoint.
 * Returns { status: "ok", timestamp: "..." }
 */
export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
