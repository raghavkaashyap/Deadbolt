/**
 * /api/simulate — run the simulated shopping agent against the local
 * (offline) authorizer. For demos and testing the decision logic; it does
 * not touch the database, the LLM or PayPal.
 *
 * GET  → list scenarios
 * POST → { scenario: ScenarioId, block_on_untrusted_influence?: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/deadbolt/http";
import { createLocalAuthorizer } from "@/lib/deadbolt/agent/localAuthorizer";
import { makeDemoMandate, runShoppingAgent, SCENARIOS, type ScenarioId } from "@/lib/deadbolt/agent/simulator";

export async function GET() {
  return NextResponse.json(
    Object.entries(SCENARIOS).map(([id, s]) => ({ id, title: s.title, description: s.description, mandate: s.mandate }))
  );
}

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, z.object({
    scenario: z.enum(Object.keys(SCENARIOS) as [ScenarioId, ...ScenarioId[]]),
    block_on_untrusted_influence: z.boolean().default(false),
  }));
  if ("response" in parsed) return parsed.response;
  const id = parsed.data.scenario;
  const mandate = makeDemoMandate(SCENARIOS[id].mandate);
  const authorize = createLocalAuthorizer(mandate, {
    decision: { blockOnUntrustedInfluence: parsed.data.block_on_untrusted_influence },
  });

  const run = await runShoppingAgent({ scenario: id, mandate, authorize });
  return NextResponse.json({ mandate, ...run });
}
