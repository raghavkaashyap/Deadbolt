# Deadbolt integration review and fixes

## Result

Both original PR heads merge without textual conflicts and share identical domain types. This integration branch contains both changes plus the fixes below. GitHub write access was restored after the initial review. Both original heads were rechecked before publishing the combined integration.

## Fixed

- Connected `/api/authorize` to deterministic policy, provenance analysis, semantic evaluation, and the risk engine.
- Added separate operator and agent bearer credentials, bound the agent credential to one configured identity, and protected mandate management, approval, audit and payment routes. Missing/weak configuration fails closed. Operator credentials must never be supplied to the agent or a browser bundle.
- Client-reported provenance cannot authenticate its own trust labels. The production API therefore requires operator verification even for an otherwise clean proposal. Offline simulation retains automatic authorization so the seven scenarios remain demonstrable. Hard policy failures remain blocked and cannot be approved.
- Bound capabilities to amount, category, brand, condition, attributes, recipient and all other purchase fields; capped expiry at mandate expiry; rejected malformed token suffixes. Canonical token encoding supports deterministic recovery after a lost approval response.
- Added `supabase/transactions.sql`: invoker-rights RPC with a common root-task row lock for authorization persistence, revision, approval, payment reservation, and capture validation. Authorization/capability and approval/capability writes commit atomically; failed payment reservation never consumes a capability. RPC execution is explicitly denied to public, anon and authenticated roles.
- Defined each mandate lineage as one purchase. A unique reservation per root task prevents repeated capabilities, authorizations or revisions from multiplying spending authority. Revisions are prohibited after payment reservation. Reservations stay closed after errors or cancellation until manually reconciled; an uncertain payment is never silently replaced by a new purchase.
- Payment retries reuse the existing reservation and stable PayPal request ID. Capture rechecks the current mandate. Completed payments cannot regress when late responses arrive.
- Removed payment capture and payment disclosure from the public GET return page. Capture now requires the authenticated POST route.
- Tightened category equality, quantity validation, compiler ambiguity handling, sandbox USD/cent validation and simulation scenario lookup. Repaired the lockfile and pinned a compatible Anthropic SDK.
- The PayPal adapter is constrained to the Sandbox host. It still pays the configured sandbox account; it does not verify arbitrary merchants' PayPal identities. No production payment claim is supported.

## Validation

`npm test`: 15 tests passed, including all seven offline agent scenarios, direct API handler flows, separate credentials, forged agent identities, human approval/token recovery, transaction mutation rejection, idempotent payment/capture, transaction rollback, single-purchase enforcement, revision safety, expiry and RPC role permissions.

Database tests execute the actual schema and PL/pgSQL in disposable embedded PostgreSQL (PGlite). API tests use those real database transitions and stub external semantic/PayPal calls. PGlite serializes calls; these tests do not simulate independent PostgreSQL sessions contending for locks. The shared root-task lock and unique indexes provide the intended multi-session serialization, which should also be exercised in a staging Supabase deployment.

`npm run typecheck`, `npm run build`, and `git diff --check` passed. No real database, Anthropic API, or PayPal account was accessed. A live sandbox smoke test remains a deployment check.

## Concrete integration sequence

1. Publish this integration branch and open one combined PR. Review the combined tree before merging; do not separately merge the unpatched API.
2. For a fresh sandbox, apply `supabase/schema.sql`, then `supabase/transactions.sql`. For an existing database, back up first: the transaction script backfills task lineage and deliberately refuses existing duplicate payments/capabilities rather than silently reopening authority. It runs in one transaction.
3. Configure distinct 32+ character operator/agent credentials, `DEADBOLT_AGENT_ID`, a 32+ character capability secret, Supabase service-role credentials and sandbox external-service credentials. Apply database changes before deploying the API. Follow `docs/API.md`.
4. Run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build`. In a disposable staging instance, exercise one operator-approved USD purchase, replay, revision/capture rejection, interrupted-request retry, and concurrent root-task operations.
5. Merge the combined PR and close #1 and #2 as incorporated. Alternatively, port the API fixes into #1, merge #1, then rebase #2 with the evaluator/risk fixes and retest the exact combined tree before merging #2. The combined branch avoids publishing an intermediate placeholder evaluator.

## Scope

This is a single-operator/single-agent, manually reviewed sandbox integration. Multi-tenant ownership, independently recorded provenance, merchant identity/checkout verification, and production payment reconciliation require separate implementation. Those boundaries are enforced conservatively rather than represented as solved by a client-reported trace.
