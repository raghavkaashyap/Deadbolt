/**
 * /api/simulate — run the simulated shopping agent against the local
 * (offline) authorizer. For demos and testing the decision logic; it does
 * not touch the database, the LLM or PayPal.
 *
 * GET  → list scenarios
 * POST → { scenario: ScenarioId, block_on_untrusted_influence?: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { createLocalAuthorizer } from "@/lib/deadbolt/agent/localAuthorizer";
import { makeDemoMandate, runShoppingAgent, SCENARIOS, type ScenarioId } from "@/lib/deadbolt/agent/simulator";

export async function GET() {
  return NextResponse.json(
    Object.entries(SCENARIOS).map(([id, s]) => ({ id, title: s.title, description: s.description, mandate: s.mandate }))
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    scenario?: string;
    block_on_untrusted_influence?: boolean;
  } | null;

  const scenario = body?.scenario;
  if (!scenario || !(scenario in SCENARIOS)) {
    return NextResponse.json({ error: `scenario must be one of: ${Object.keys(SCENARIOS).join(", ")}` }, { status: 400 });
  }

  const id = scenario as ScenarioId;
  const mandate = makeDemoMandate(SCENARIOS[id].mandate);
  const authorize = createLocalAuthorizer(mandate, {
    decision: { blockOnUntrustedInfluence: body?.block_on_untrusted_influence ?? false },
  });

  const run = await runShoppingAgent({ scenario: id, mandate, authorize });
  return NextResponse.json({ mandate, ...run });
}
