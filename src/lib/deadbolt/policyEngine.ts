/**
 * Hard Policy Engine (PRD §11).
 *
 * Deterministic checks of a proposed transaction against its mandate.
 * No LLM is involved. Each check reports whether a failure should block
 * outright or send the transaction to a human.
 */
import type { Check, Mandate, ProposedTransaction, Requirement } from "./types";

export interface PolicyContext {
  now?: Date;
  /** Amount already spent by this agent in the current window (e.g. this week). */
  spend_in_window?: number;
  /** Rolling spend limit for the window, if one applies. */
  window_limit?: number;
}

/** Lowercase, strip punctuation and a plural "s" so "Monitors" matches "monitor". */
export function normalizeCategory(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word))
    .join(" ");
}

function sameText(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function check(name: string, passed: boolean, detail: string, severity: Check["severity"] = "block"): Check {
  return { name, passed, detail, severity };
}

function checkRequirement(req: Requirement, tx: ProposedTransaction): Check {
  const name = `requirement:${req.attribute}`;
  const actual = tx.attributes?.[req.attribute];
  const wanted = `${req.attribute} ${req.operator} ${req.value}`;

  if (actual === undefined) {
    return check(name, false, `Cannot verify ${wanted}: agent did not report ${req.attribute}`, "review");
  }

  if (req.operator === "eq") {
    return check(name, sameText(String(actual), req.value), `Requires ${wanted}; got ${actual}`);
  }

  const actualNum = Number(actual);
  const wantedNum = Number(req.value);
  if (!Number.isFinite(actualNum) || !Number.isFinite(wantedNum)) {
    return check(name, false, `Cannot compare ${wanted} with non-numeric value ${actual}`, "review");
  }
  const passed = req.operator === "gte" ? actualNum >= wantedNum : actualNum <= wantedNum;
  return check(name, passed, `Requires ${wanted}; got ${actual}`);
}

export function evaluatePolicy(mandate: Mandate, tx: ProposedTransaction, ctx: PolicyContext = {}): Check[] {
  const { intent, constraints } = mandate;
  const now = ctx.now ?? new Date();
  const checks: Check[] = [];

  // Mandate validity
  checks.push(
    check(
      "mandate_active",
      !mandate.superseded_by && Date.parse(mandate.expires_at) > now.getTime(),
      mandate.superseded_by ? `Mandate was revised (${mandate.superseded_by})` : `Mandate expires at ${mandate.expires_at}`
    )
  );

  // Amount & currency
  checks.push(check("amount_positive", Number.isFinite(tx.amount) && tx.amount > 0, `Amount ${tx.amount}`));
  checks.push(
    check(
      "amount_within_limit",
      tx.amount <= constraints.max_amount,
      `${tx.amount.toFixed(2)} ${tx.currency} vs limit ${constraints.max_amount.toFixed(2)} ${constraints.currency}`
    )
  );
  checks.push(
    check(
      "currency_matches",
      tx.currency.toUpperCase() === constraints.currency.toUpperCase(),
      `Transaction in ${tx.currency}, mandate allows ${constraints.currency}`
    )
  );
  if (ctx.window_limit !== undefined) {
    const projected = (ctx.spend_in_window ?? 0) + tx.amount;
    checks.push(
      check("window_spend_within_limit", projected <= ctx.window_limit, `Projected spend ${projected} vs limit ${ctx.window_limit}`)
    );
  }

  // Merchant / recipient
  const blocked = constraints.blocked_merchants.some((m) => sameText(m, tx.merchant));
  checks.push(check("merchant_not_blocked", !blocked, `Merchant ${tx.merchant}`));
  if (constraints.allowed_merchants.length > 0) {
    const allowed = constraints.allowed_merchants.some((m) => sameText(m, tx.merchant));
    checks.push(
      check("merchant_allowed", allowed, `${tx.merchant} is not in ${constraints.allowed_merchants.join(", ")}`, "review")
    );
  }
  if (tx.recipient !== undefined) {
    checks.push(
      check("recipient_is_merchant", sameText(tx.recipient, tx.merchant), `Payee ${tx.recipient} differs from merchant ${tx.merchant}`, "review")
    );
  }

  // Shape of the purchase
  checks.push(
    check(
      "recurring_allowed",
      !tx.recurring || constraints.recurring,
      tx.recurring ? "Transaction is recurring; mandate is one-time" : "One-time purchase"
    )
  );
  const quantity = tx.quantity ?? 1;
  checks.push(check("quantity_within_request", Number.isInteger(quantity) && quantity > 0 && quantity <= intent.quantity, `Quantity ${quantity} vs requested ${intent.quantity}`));

  // What is being bought
  if (tx.product_category) {
    const wanted = normalizeCategory(intent.category);
    const got = normalizeCategory(tx.product_category);
    checks.push(
      check("category_matches", wanted.length > 0 && got === wanted, `Requested ${intent.category}, proposed ${tx.product_category}`)
    );
  } else {
    checks.push(check("category_matches", false, "Agent did not report a product category", "review"));
  }

  if (intent.brands.length > 0) {
    if (!tx.brand) {
      checks.push(check("brand_allowed", false, `Brand not reported; allowed: ${intent.brands.join(", ")}`, "review"));
    } else {
      checks.push(
        check(
          "brand_allowed",
          intent.brands.some((b) => sameText(b, tx.brand!)),
          `Brand ${tx.brand}; allowed: ${intent.brands.join(", ")}`
        )
      );
    }
  }

  if (intent.condition !== "any") {
    if (!tx.condition) {
      checks.push(check("condition_allowed", false, `Condition not reported; requires ${intent.condition}`, "review"));
    } else {
      checks.push(check("condition_allowed", tx.condition === intent.condition, `Requires ${intent.condition}; got ${tx.condition}`));
    }
  }

  for (const req of intent.requirements) checks.push(checkRequirement(req, tx));

  return checks;
}
