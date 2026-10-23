# Deadbolt follow-up plan

This review compares the merged implementation with `PRD.md`. Current guarantees are the single-operator/single-agent USD Sandbox boundaries in `API.md`, not the full future product vision. No other PR was open when this work began.

## Current PR: three independently usable commits

| Change | Result | Validation | Dependencies |
|---|---|---|---|
| Scenario dashboard | Replaces the starter homepage with seven selectable scenarios, attempt outcomes, policy reasons/checks and an inspectable provenance timeline; supports strict influence policy | Desktop/mobile browser checks, error recovery, input validation, existing backend suite and build | Existing offline simulation only; no credentials |
| PayPal client reliability | Ten-second HTTP deadlines, validated responses/approval links, safe errors, shared OAuth token refresh, stable request IDs, and correct completed-order retry state | Mocked provider timeout/401/5xx/malformed-response tests, interrupted API retry test, typecheck | Existing Sandbox adapter; no schema change |
| Setup and verification workflow | Configuration checks, credential-free HTTP smoke tests, explicit staged Sandbox helper, CI and credential runbook | CLI fixture tests, full check command and local HTTP smoke run | Node.js 22+; real credentials only for manual provider tests |

Each commit includes its tests and leaves the existing API usable. No database migration or secret is required to review the dashboard/client changes. This PR should be reviewed and proposed for merge; it does not authorize a deployment or live service test.

## Next self-contained PRs

| Priority | Feature / gap | Smallest useful implementation | Acceptance tests / merge gate |
|---|---|---|---|
| P0 | Reconciliation after uncertain capture/order creation | Operator-only read/reconcile endpoint querying the already-bound PayPal order, monotonic local completion updates, and a durable audit event. Never create another order or release a reservation automatically | Timeout after remote capture, duplicate reconcile, expired mandate, wrong order/payee/amount, non-completed capture. Needs Sandbox credentials; verified webhook processing can follow separately |
| P0 | Actual multi-session concurrency coverage | Disposable PostgreSQL service in a separate CI job with two independent connections exercising the root-task RPC | Revision/reservation race, double approval, duplicate capability reservation, rollback on failure and migration reapply |
| P0 | Authenticated operator review UI | Establish server-side operator session/ownership, then add pending approvals, mandate review/revision and audit detail. Keep service role and operator API key out of client bundles | Agent cannot assume operator role; cross-owner/expired-session requests rejected; approve/deny races and task state conflicts rendered correctly. The public demo must continue working without login |
| P1 | Quantitative adversarial evaluation | Expand from seven scenarios to a labeled corpus covering currency/quantity/category/condition/attribute omission, corrupted traces, replay and changed checkout. Report per-attempt blocks, approvals and false positives separately | Deterministic fixture outputs, distinct expected labels and machine-readable evaluation report; do not equate final agent recovery with an attack never being attempted |
| P1 | Authenticated provenance | Record tool events on the server, derive trust from the tool/source rather than caller labels, and include category/brand/attributes in protected-field tracking | A caller cannot manufacture a trusted trace or alter a prior event; injection across event boundaries is tracked. Keep human review until evidence is verified |
| P1 | SMS approvals | Add one communication provider, signed callback verification, verified operator phone binding and a one-use challenge tied to authorization + transaction | Invalid/replayed signature, wrong sender, concurrent YES/NO, expired challenge and revised mandate. Delivery credentials/provider setup are separate from PayPal |
| P2 | Pause/revoke and stale authorization handling | Add an explicit operator action and an audit event, transactionally checked before reservation/capture. Display expired and stale pending requests | Revocation races, token use after pause, already-completed payment remains terminal; no silent deletion of audit history |
| P2 | Real catalog / merchant identity | Use a trusted catalog and a verified merchant-to-payee mapping before claiming a real merchant checkout | Forged merchant label, different PayPal payee, altered amount/product, and unsupported merchant rejected. Current Sandbox account is the actual payee |
| P2 | Voice input / approval | Add transcription or voice callback only after the web/SMS ownership model is complete | Recorded/replayed responses, mistaken transcription, explicit confirmation and transaction binding |

## Suggested sequence

Merge this PR after its automated checks. Complete the documented manual Sandbox test. Then prioritize reconciliation plus independent PostgreSQL concurrency tests, followed by the authenticated operator UI. Add SMS and real-agent/catalog integrations after that flow is demonstrably stable. Multi-tenant policies, aggregate rolling budgets, an SDK and production payment support remain later scope.
