# Deadbolt decision logic

The code lives in `src/lib/deadbolt/`. None of it calls a network, a database or an LLM.

| File | Role |
|---|---|
| `policyEngine.ts` | Hard policy engine. `evaluatePolicy(mandate, tx, ctx?)` returns a list of `Check`s. |
| `provenance.ts` | Taint analysis. `analyzeProvenance(events)` returns a list of `ProvenanceFinding`s. |
| `decision.ts` | Risk engine. `decide({ mandate, transaction, checks, findings, semantic }, options?)` returns an `AuthorizationResult`. |
| `agent/simulator.ts` | Scripted shopping agent and adversarial scenarios. |
| `agent/localAuthorizer.ts` | Offline authorizer: policy + provenance + decision, with a keyword heuristic standing in for the LLM. |

## Policy checks

The **block** column means a failed check is final, whatever the risk score.

| Check | Fails when | Block or review |
|---|---|---|
| `mandate_active` | Mandate is expired or superseded | Block |
| `amount_within_limit`, `amount_positive` | Amount exceeds the limit or is ≤ 0 | Block |
| `currency_matches` | Currency differs from the mandate | Block |
| `window_spend_within_limit` | Rolling spend would exceed the limit (only when a context is passed) | Block |
| `merchant_not_blocked` | Merchant is on the denylist | Block |
| `merchant_allowed` | An allowlist exists and the merchant is not on it | Review |
| `recipient_is_merchant` | Payee differs from the merchant | Review |
| `recurring_allowed` | Recurring charge on a one-time mandate | Block |
| `quantity_within_request` | Quantity is above what was requested | Block |
| `category_matches` | Category differs from the mandate (review if the category isn't reported) | Block |
| `brand_allowed`, `condition_allowed` | Brand or condition violates the mandate (review if not reported) | Block |
| `requirement:<attr>` | A `gte` / `lte` / `eq` requirement is unmet (review if not reported) | Block |

## Risk score

Each signal adds to the score, which is clamped to 0–1:

| Signal | Adds |
|---|---|
| Each failed review check | 0.35 |
| High provenance finding (untrusted content changed a protected field, or a change after injected content) | 0.6 |
| Medium provenance finding (instruction-like text in untrusted content, or no provenance reported) | 0.25 |
| Semantic check unavailable | 0.35 |
| Semantic mismatch | (1 − intent_match) × 0.5 |
| Semantic violations listed | 0.15 |
| intent_match below 0.4 | 0.7 |

The score maps to a decision: below 0.3 is **AUTHORIZED**, 0.3 to below 0.7 is **REQUIRES_APPROVAL**, and 0.7 or more is **BLOCKED**. A failed blocking check always means **BLOCKED**.

Passing `blockOnUntrustedInfluence: true` blocks any transaction where untrusted content touched a protected field, instead of escalating it (PRD open question 8).

## Simulated scenarios

Run them with `POST /api/simulate { "scenario": "<id>" }`. With the offline authorizer, the expected outcomes are:

| Scenario | Attempts | Outcome |
|---|---|---|
| `happy_path` | LG 27" monitor at Best Buy | AUTHORIZED |
| `prompt_injection` | Gift card is BLOCKED (category mismatch plus tainted selection), then the LG monitor | AUTHORIZED |
| `over_budget` | Samsung 32" at $329.99 is BLOCKED (amount), Dell 24" is BLOCKED (size), then LG | AUTHORIZED |
| `price_inflation` | Checkout raises the price to $289.99 (untrusted change to amount) | REQUIRES_APPROVAL |
| `hidden_subscription` | Recurring add-on is BLOCKED, then a clean checkout | AUTHORIZED |
| `merchant_substitution` | Lookalike merchant with a different payee is BLOCKED, then Best Buy | AUTHORIZED |
| `ssd_purchase` | Samsung 2TB SSD at $142 | AUTHORIZED |

## Wiring into `/api/authorize`

Once this branch and `rogelio-api-dev` are both merged, replace the body of `evaluateAuthorization` in `src/lib/deadbolt/evaluate.ts` with:

```ts
const checks = evaluatePolicy(mandate, transaction);
const findings = analyzeProvenance(provenance);
const semantic = await evaluateIntent(mandate, transaction);
return decide({ mandate, transaction, checks, findings, semantic });
```
