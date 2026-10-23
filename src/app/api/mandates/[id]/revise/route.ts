import { TransitionConflict } from "@/lib/deadbolt/store";
import { requireAccess } from "@/lib/deadbolt/access";
/**
 * POST /api/mandates/:id/revise
 * { change: "don't let it go over $150", ttl_minutes? }
 *
 * Mandates are immutable: this creates a new version and marks the old one
 * superseded, so authorizations against the old version stop working.
 */
import { NextRequest, NextResponse } from "next/server";
import { jsonError, parseBody } from "@/lib/deadbolt/http";
import { newId } from "@/lib/deadbolt/ids";
import { compileRevision, toMandateParts } from "@/lib/deadbolt/intentCompiler";
import { ReviseMandateSchema } from "@/lib/deadbolt/schemas";
import { getMandate, transition } from "@/lib/deadbolt/store";
import type { Mandate } from "@/lib/deadbolt/types";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAccess(request, false);
  if (denied) return denied;
  const { id } = await params;
  const parsed = await parseBody(request, ReviseMandateSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  try {
    const current = await getMandate(id);
    if (!current) return jsonError(404, "Mandate not found");
    if (current.superseded_by) {
      return jsonError(409, "Mandate was already revised", { superseded_by: current.superseded_by });
    }

    let compiled;
    try {
      compiled = await compileRevision(current, body.change);
    } catch (error) {
    if (error instanceof TransitionConflict) return jsonError(409, "Task state changed; refresh before retrying");
      console.error(error);
      return jsonError(502, "Could not compile the revision");
    }

    const parts = toMandateParts(compiled);
    if ("error" in parts) return jsonError(422, parts.error, { compiled });

    const now = new Date();
    const revised: Mandate = {
      ...current,
      ...parts,
      mandate_id: newId("mnd"),
      version: current.version + 1,
      parent_mandate_id: current.mandate_id,
      superseded_by: null,
      instruction: `${current.instruction}\n[revision v${current.version + 1}] ${body.change}`,
      created_at: now.toISOString(),
      expires_at: body.ttl_minutes
        ? new Date(now.getTime() + body.ttl_minutes * 60_000).toISOString()
        : current.expires_at,
    };

    const saved = await transition<Mandate>("revise", { mandate_id: current.mandate_id, mandate: revised });

    return NextResponse.json({ mandate: saved, previous_mandate_id: current.mandate_id, ambiguities: compiled.ambiguities }, { status: 201 });
  } catch (error) {
    if (error instanceof TransitionConflict) return jsonError(409, "Task state changed; refresh before retrying");
    return jsonError(500, (error as Error).message);
  }
}
