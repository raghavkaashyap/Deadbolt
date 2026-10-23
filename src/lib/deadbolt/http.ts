import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";

export function jsonError(status: number, error: string, details?: unknown) {
  return NextResponse.json(details === undefined ? { error } : { error, details }, { status });
}

/** Parse and validate a JSON body. Returns either the data or a ready 400 response. */
export async function parseBody<S extends z.ZodType>(
  request: NextRequest,
  schema: S
): Promise<{ data: z.infer<S> } | { response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: jsonError(400, "Body must be valid JSON") };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { response: jsonError(400, "Invalid request body", result.error.issues) };
  }
  return { data: result.data };
}
