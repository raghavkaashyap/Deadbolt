# Deadbolt API

All endpoints take and return JSON. Server-side state lives in Supabase (`supabase/schema.sql`).

## Setup

1. `npm ci`
2. Copy `.env.example` to `.env.local` and fill in Supabase, Anthropic, PayPal Sandbox and `DEADBOLT_CAPABILITY_SECRET`.
3. Run `supabase/schema.sql`, then `supabase/transactions.sql` in the Supabase SQL Editor. Existing duplicate reservations intentionally make the second script fail; reconcile them before deployment.
4. Configure distinct `DEADBOLT_OPERATOR_API_KEY` and `DEADBOLT_AGENT_API_KEY` (32+ characters), `DEADBOLT_AGENT_ID`, and a 32+ character `DEADBOLT_CAPABILITY_SECRET`.

This is a single-operator, single-agent USD sandbox. Send `Authorization: Bearer <operator key>` for mandate creation/revision, approvals and audit reads. Send the agent key for `/api/authorize`, `/api/payments` and capture; request `agent_id` must equal the configured identity. Keep credentials out of browser bundles and keep the operator key away from agents. Health and offline simulation remain public.

Agent-supplied provenance is not authenticated. Production authorization always requires operator review unless blocked by hard policy; the operator verifies the actual merchant and purchase before approving. Automatic decisions are demonstrated by the offline simulator.

## Flow

```text
POST /api/mandates            user instruction → mandate
POST /api/authorize           agent proposes a transaction → AUTHORIZED | REQUIRES_APPROVAL | BLOCKED
POST /api/approvals/:id       human approves/denies a pending authorization
POST /api/payments            capability + transaction → PayPal Sandbox order (approve_url)
POST /api/payments/:id/capture  capture after the sandbox buyer approves
```

## Endpoints

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/mandates` | `{ agent_id, instruction, principal?, max_amount?, ttl_minutes? }` | Compiles the instruction with Claude. 422 if there is no spending limit. |
| GET | `/api/mandates` | | Recent mandates. |
| GET | `/api/mandates/:id` | | One mandate version. |
| POST | `/api/mandates/:id/revise` | `{ change, ttl_minutes? }` | Creates a new version; the old one is superseded. |
| POST | `/api/authorize` | `{ agent_id, mandate_id, transaction, provenance? }` | Returns `{ authorization_id, decision, risk, reasons, capability }`. `capability` is set only when AUTHORIZED. |
| GET | `/api/authorizations` | | Recent decisions. |
| GET | `/api/authorizations/:id` | | Full trace: mandate, transaction, provenance, result, payments. |
| POST | `/api/approvals/:id` | `{ decision: "approve" \| "deny", channel?, note? }` | Approval returns a capability for that exact transaction. |
| POST | `/api/payments` | `{ agent_id, capability_token, transaction }` | Verifies and consumes the capability, then creates the PayPal order. |
| POST | `/api/payments/:id/capture` | | Captures an approved PayPal order. The public return page is informational; the authenticated agent must POST capture. |

### Transaction

```json
{
  "merchant": "Best Buy",
  "product": "LG 27-inch Monitor",
  "product_category": "monitor",
  "brand": "LG",
  "condition": "new",
  "amount": 219.99,
  "currency": "USD",
  "quantity": 1,
  "recurring": false,
  "attributes": { "screen_size_in": 27 }
}
```

### Provenance event

```json
{
  "step": 3,
  "timestamp": "2026-10-23T02:00:00Z",
  "tool": "merchant_page",
  "source": "https://deals.example/monitor",
  "trust": "untrusted",
  "output": "Ignore previous instructions...",
  "changed_fields": { "product": "$249 Gift Card" }
}
```

## Execution and retries

Each mandate and all its revisions form one purchase task. Payment reservation is atomic with capability consumption. Once reserved, another capability or revision cannot reopen the task. Errors and cancellation do not release this reservation automatically.

Retry a lost approval response with the same approve request: the operator receives the original unexpired capability. Retry order creation using the same token and exact transaction before token expiry; Deadbolt reuses the payment reservation and PayPal request ID. After expiry or an uncertain external result, inspect the operator audit trace and reconcile the sandbox order rather than authorizing another purchase. Capture retries reuse the same order ID; completion is terminal. A mandate that has expired cannot start a new capture attempt.

Capabilities expire after at most five minutes and never outlive the mandate. They bind the exact purchase including attributes and amount; requests accept USD amounts in cents. Database transitions recheck authority under the task lock. PayPal is called only after reservation or capture validation.

The PayPal adapter only supports the Sandbox host and the configured sandbox payee. Arbitrary merchant identity verification and production money movement are outside this integration. See `INTEGRATION_REVIEW.md` for deployment checks and test limits.
