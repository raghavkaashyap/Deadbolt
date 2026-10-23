# Deadbolt API

All endpoints take and return JSON. Server-side state lives in Supabase (`supabase/schema.sql`).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in Supabase, Anthropic, PayPal Sandbox and `DEADBOLT_CAPABILITY_SECRET`.
3. Run `supabase/schema.sql` in the Supabase SQL Editor.

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
| POST | `/api/payments/:id/capture` | | Captures an approved PayPal order. `/payments/:id/return` does this automatically after the PayPal redirect. |

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

## Guarantees

- **Fail closed.** Errors, LLM refusals and missing data never authorize a payment.
- **Capabilities are single-use** and expire after 5 minutes. They are HMAC-signed and bound to agent, mandate, merchant, product, quantity, currency and a maximum amount. Any change to the transaction invalidates them.
- **PayPal is never called** without a verified, freshly consumed capability.
- **The policy engine is not wired in yet.** Until `rogelio-functional-logic` is merged, `src/lib/deadbolt/evaluate.ts` sends everything to human approval, except clear semantic mismatches, which it blocks.
