# Setup and test runbook

## 1. Credential-free checks

Prerequisites: Node.js 22+ and npm. The lockfile pins test dependencies. No `.env.local` is needed for this level.

```bash
npm ci
npx playwright install --with-deps chromium
npm run check
```

| Command | What it verifies | External access |
|---|---|---|
| `npm test` | Policy/scenarios, actual PL/pgSQL in disposable PGlite, API handlers, PayPal client failures, configuration and CLI helpers | None; LLM/PayPal responses are stubbed |
| `npm run typecheck` | TypeScript consistency | None |
| `npm run build` | Production compilation and static generation | None |
| `npm run test:browser` | Dashboard behavior, injection/recovery, strict policy, mobile overflow and error recovery | Local production server only |
| `npm run check` | Unit/API/database/tooling tests, typecheck, build and Playwright browser tests | Local only after dependencies/browser install |
| `npm run test:mcp` | Real MCP handshake and browser-tool testing of all scenarios, mobile, console and error recovery | Local production server only |
| `npm run check:config -- demo` | Confirms demo mode needs no provider credentials | None |
| `npm run smoke` | Health, seven scenarios and strict price-inflation policy over HTTP | Running Deadbolt server only |

`test:browser` requires a completed build. Playwright starts `next start` on `127.0.0.1:3100` and shuts it down afterwards. It may reuse that port locally; stop unrelated servers first. CI always starts its own server. Failure traces and screenshots are written to ignored `test-results/`. If browser downloads fail, retry the official install command from a network that can reach Playwright's browser mirrors; do not skip browser validation and claim it passed.

For the HTTP smoke test, start `npm run dev` separately, then run `npm run smoke`. Set `DEADBOLT_BASE_URL=http://localhost:3000` to choose a target. Scripts load `.env.local` when present, preserve shell-provided environment values, and reject authenticated requests to non-local HTTP origins.

The GitHub workflow `.github/workflows/ci.yml` runs the credential-free checks on pull requests and pushes to main. It uses no repository secrets and runs `test:mcp` after the regular checks. CI does not approve or capture Sandbox payments.

## 2. Configuration

Copy `.env.example` to `.env.local`. Restart the server after changes. Do not commit this file or put server keys in variables beginning `NEXT_PUBLIC_`.

| Variable / item | Needed for | Where it comes from |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Authenticated API | Disposable Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server database operations | Same project's service-role credentials; server only |
| `ANTHROPIC_API_KEY` | Mandate compilation and semantic intent check | An Anthropic account with model access and available API credit |
| `DEADBOLT_MODEL` | Optional model override | Defaults to the model in `src/lib/deadbolt/llm.ts` |
| `DEADBOLT_OPERATOR_API_KEY` | Mandates, approvals and audit reads | A random 32+ character server-side secret |
| `DEADBOLT_AGENT_API_KEY` | Authorize, create order and capture | A separate random 32+ character server-side secret |
| `DEADBOLT_CAPABILITY_SECRET` | Capability signatures | A third independent random 32+ character secret |
| `DEADBOLT_AGENT_ID` | Credential-bound identity | Defaults in the example to `shopping_agent`; use the same value in mandate requests |
| `PAYPAL_CLIENT_ID` | Sandbox REST app identity | PayPal Developer Dashboard → Apps & Credentials → **Sandbox** → your REST app |
| `PAYPAL_CLIENT_SECRET` | Sandbox OAuth token exchange | The secret for that same Sandbox REST app; server only |
| `PAYPAL_API_BASE` | Sandbox API origin | Keep `https://api-m.sandbox.paypal.com`; live/custom hosts are rejected |
| `NEXT_PUBLIC_APP_URL` | PayPal buyer return URL | App origin, e.g. `http://localhost:3000`; HTTPS for deployed instances |
| `DEADBOLT_BASE_URL` | Optional smoke-test target | Defaults to `NEXT_PUBLIC_APP_URL`, then `http://localhost:3000` |
| Personal Sandbox buyer email/password | Buyer approval in PayPal's browser checkout | Sandbox testing accounts; **not an application environment variable** |

Generate each internal secret separately on your own machine, for example:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

```bash
npm run check:config -- api   # API setup; PayPal credentials not required
npm run check:config          # Full Sandbox setup, including PayPal
```

The checker prints missing/invalid field names, not values. Passing does not prove that credentials work, the schema is applied, funds exist in the test buyer, or the selected model is accessible.

Apply `supabase/schema.sql` followed by `supabase/transactions.sql` in the Supabase SQL Editor. The second script is atomic, backfills task lineage, grants RPC execution only to the service role, and intentionally fails if existing data has duplicate task/capability reservations. Use a fresh test project or reconcile existing duplicates before applying it. No public policies are needed for Deadbolt tables. The starter `items` table and browser anon key are not needed for this test flow.

## 3. PayPal Sandbox credentials and accounts

Create or select a **Business Sandbox** account for the seller and a separate **Personal Sandbox** account for the buyer. Create a Sandbox REST app linked to the Business account, then copy its app client ID and secret into the two `PAYPAL_*` variables. Do not use live credentials or the buyer's login as REST credentials.

When checkout opens, sign in using the Personal Sandbox account, not your real PayPal login or the Business seller. Give the test buyer enough test funds for USD 219.99. The current adapter sends that synthetic purchase to the configured Business account; the `Best Buy` fixture label is not a real Best Buy checkout.

No webhook ID, webhook secret, Partner ID, browser PayPal SDK key or buyer password is required by the present REST create/approve/capture flow. Webhook verification will need separate setup if the reconciliation feature is added later.

Official references:

- [Get client ID/secret and OAuth token](https://developer.paypal.com/api/rest/)
- [Create/manage Personal and Business Sandbox accounts](https://developer.paypal.com/sandbox-testing/accounts)
- [Orders v2 create and capture](https://developer.paypal.com/docs/api/orders/v2/)
- [Request IDs and retry semantics](https://developer.paypal.com/api/rest/reference/idempotency/)

## PayPal Sandbox smoke test

This is a **manual, opt-in integration test**. It writes to the configured database and uses Anthropic API calls and Sandbox orders. It is not part of CI. Run only against a disposable test deployment with Sandbox credentials.

Start the app, then:

```bash
npm run check:config
npm run smoke:sandbox -- prepare
```

`prepare` creates a fixed monitor mandate and authorization. Expect `REQUIRES_APPROVAL`, because client-reported provenance needs human verification. It prints the authorization ID, product, amount and next command. Inspect that purchase before continuing. A policy block must be investigated; do not bypass it.

```bash
npm run smoke:sandbox -- checkout AUTHORIZATION_ID --approve
```

Replace the ID with the one printed by `prepare`. This command only approves authorizations matching the fixed smoke-test fixture and `smoke_test` principal. The explicit `--approve` is required. It issues the scoped token in memory, creates a Sandbox order and prints the buyer approval URL and payment ID; it never prints API credentials or the capability token. Complete this step within the mandate lifetime. After approval, capabilities expire within five minutes.

Open the printed `https://www.sandbox.paypal.com/...` URL, sign in as the Personal Sandbox buyer, and approve. The return page is informational; returning to Deadbolt does **not** capture money.

```bash
npm run smoke:sandbox -- capture PAYMENT_ID
```

Expect `COMPLETED`. Repeat the **same capture command** and expect the same payment, with no second charge. Check the Business Sandbox account's activity and the operator audit record for that authorization. A cancelled buyer checkout must not be captured; the reservation remains closed pending reconciliation.

### Failure checks

| Case | Expected result / next action |
|---|---|
| Missing operator/agent credentials | API returns 401 or 503; no payment request |
| Agent tries to approve | 401; only operator credential can approve |
| Wrong `agent_id` | 403 |
| Amount or product attributes changed after approval | 403; no replacement capability |
| Expired capability before order creation | Refused; inspect the task before any new purchase |
| Revised mandate before payment reservation | Stale capability refused |
| Revision after payment reservation | 409; task cannot be reopened |
| Second authorization/payment for the same task | 409 or the same existing payment for an exact retry |
| Buyer has not approved yet | Capture fails; approve in PayPal first, then retry the same payment |
| Request times out or PayPal returns 5xx | Outcome may be uncertain. Keep the original reservation/request ID and inspect both systems. Never prepare a replacement task just to retry a payment |
| Capture succeeded remotely but the app lost the response | Retry capture on the same payment. If expired/rejected, inspect PayPal and reconcile manually; automatic reconciliation remains a follow-up |
| Client ID/secret rejected | Check that both belong to the same **Sandbox** app; a safe PayPal HTTP status/debug ID is logged |
| Compile returns 422 | Instruction is ambiguous or unsupported; review the compiled draft. Do not skip the compiler in the live test |

The adapter bounds each provider HTTP request to ten seconds and does not silently retry financial POSTs. The database reservation and stable request IDs make caller-controlled retries safe within the provider's idempotency support; they do not replace reconciliation after a prolonged outage.

## 4. Staging concurrency and migration checks

PGlite runs real PostgreSQL/PL/pgSQL but serializes its calls. It cannot establish behavior under two independent database sessions. Before presenting a live demo or promoting a schema change, test these in a disposable Supabase/PostgreSQL instance:

1. Race two revisions of one active mandate: exactly one succeeds, the other leaves no orphan mandate.
2. Race operator approve/deny: exactly one resolves the pending authorization; at most one capability exists.
3. Reserve two capabilities for one root task concurrently: exactly one payment row/task reservation exists. A losing capability is not consumed.
4. Race reservation with revision: either the revision wins and the old capability fails, or reservation wins and revision returns a conflict.
5. Interrupt a payment request after reservation; retry with the original token before expiry. Confirm the same payment ID and PayPal order.
6. Run `schema.sql` plus `transactions.sql` on a fresh project and reapply the scripts. Confirm invoker security, empty search path, RLS on all four tables, and denied RPC access for anon/authenticated roles.

Do not load real account data into these tests. Record the PayPal order ID, Deadbolt payment ID and safe debug IDs, not credentials or bearer tokens.

## Verification for this PR

Local verification: a clean `npm ci` followed by `npm run check` passed 27 unit/API/database/tooling tests, TypeScript, production build and four Chromium browser checks. The HTTP smoke command passed all seven scenarios and strict policy against the running production server. Automated tests use fixtures for external providers; no real Anthropic or PayPal request was made. A real Sandbox capture and independent staging concurrency checks remain outstanding until the relevant credentials/test deployment are available.
