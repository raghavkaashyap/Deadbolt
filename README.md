# Deadbolt

Runtime authorization for agent purchases. A mandate preserves the user's intent; deterministic checks, provenance analysis and a semantic check decide whether a proposed checkout should proceed, wait for review or be blocked.

The current integration is a **single-operator, single-agent USD sandbox**. Agent-reported provenance requires operator review. The configured PayPal Sandbox business receives test payments; arbitrary merchant payees are not independently verified.

## Try the demo — no credentials

Use Node.js 22+ and npm:

```bash
npm ci
npm run dev
```

Open http://localhost:3000. Choose a scenario and run it. Inspect blocked attempts, agent recovery, policy checks and the synthetic execution trace. The demo never accesses Supabase, Anthropic or PayPal.

In a second terminal:

```bash
npm run check:config -- demo
npm run smoke
```

`smoke` checks health, all seven scenarios and the stricter untrusted-influence policy over HTTP.

## Verify a change

```bash
npm ci
npx playwright install --with-deps chromium
npm run check
```

`check` runs unit/API/database tests, TypeScript, the production build and browser tests. Browser tests launch a production server on port 3100; no secrets are required. See [Testing](docs/TESTING.md) for individual commands, failure checks and staging concurrency tests.

## Connect the authenticated API and PayPal Sandbox

1. Copy `.env.example` to `.env.local`; use the configuration table in [Testing](docs/TESTING.md).
2. Apply `supabase/schema.sql`, then `supabase/transactions.sql` to a disposable Supabase project.
3. Configure distinct operator, agent and capability secrets, the agent identity, Supabase server credentials and Anthropic credentials. Add PayPal **Sandbox app** client ID and secret for payment testing.
4. Run `npm run check:config`, restart the app, and follow [the staged Sandbox test](docs/TESTING.md#paypal-sandbox-smoke-test).

The setup check validates configuration shape only. It never contacts providers or prints secret values.

## What is implemented

- Immutable, versioned purchase mandates with deterministic policy enforcement.
- Semantic intent verification and provenance/risk evaluation.
- Separate operator/agent API credentials and scoped, short-lived capabilities.
- Atomic authority transitions and one purchase reservation per mandate lineage.
- Sandbox order creation/capture with stable request IDs and caller-controlled retries.
- Offline scenario dashboard and synthetic provenance explorer.
- Unit, PostgreSQL, API, browser and CLI smoke tests, plus CI.

## Documentation

- [API and execution/retry rules](docs/API.md)
- [Setup, credentials and test runbook](docs/TESTING.md)
- [Playwright MCP setup and protocol-driven browser tests](docs/PLAYWRIGHT_MCP.md)
- [Prioritized follow-up features and acceptance tests](docs/ROADMAP.md)
- [Decision logic and scenarios](docs/LOGIC.md)
- [Integration review and sandbox boundaries](docs/INTEGRATION_REVIEW.md)
- [Original product requirements](docs/PRD.md)
