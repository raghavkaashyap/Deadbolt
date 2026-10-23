/**
 * /api/mandates
 *
 * POST → compile a natural-language instruction into a mandate and store it
 *        { agent_id, instruction, principal?, max_amount?, ttl_minutes? }
 * GET  → list recent mandates
 */
import { NextRequest, NextResponse } from "next/server";
import { jsonError, parseBody } from "@/lib/deadbolt/http";
import { newId } from "@/lib/deadbolt/ids";
import { compileIntent, toMandateParts } from "@/lib/deadbolt/intentCompiler";
import { CreateMandateSchema } from "@/lib/deadbolt/schemas";
import { insertMandate, listMandates } from "@/lib/deadbolt/store";
import type { Mandate } from "@/lib/deadbolt/types";

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, CreateMandateSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  let compiled;
  try {
    compiled = await compileIntent(body.instruction);
  } catch (error) {
    console.error(error);
    return jsonError(502, "Could not compile instruction into a mandate");
  }

  const parts = toMandateParts(compiled, body.max_amount);
  if ("error" in parts) return jsonError(422, parts.error, { compiled });

  const now = new Date();
  const mandate: Mandate = {
    mandate_id: newId("mnd"),
    version: 1,
    parent_mandate_id: null,
    superseded_by: null,
    principal: body.principal,
    agent_id: body.agent_id,
    instruction: body.instruction,
    ...parts,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + body.ttl_minutes * 60_000).toISOString(),
  };

  try {
    const saved = await insertMandate(mandate);
    return NextResponse.json({ mandate: saved, ambiguities: compiled.ambiguities }, { status: 201 });
  } catch (error) {
    return jsonError(500, (error as Error).message);
  }
}

export async function GET() {
  try {
    return NextResponse.json(await listMandates());
  } catch (error) {
    return jsonError(500, (error as Error).message);
  }
}
