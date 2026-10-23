/**
 * Intent Compiler — turns a natural-language instruction into a structured
 * mandate (PRD §9.1). Uses Claude structured outputs so the result always
 * matches the schema; anything that fails validation is rejected.
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { DEADBOLT_MODEL, getAnthropic } from "./llm";
import type { Mandate, MandateConstraints, MandateIntent } from "./types";

const CompiledMandateSchema = z.object({
  category: z.string().describe("Normalized singular product category, lowercase, e.g. 'monitor', 'ssd'"),
  description: z.string().describe("One-sentence restatement of exactly what the user asked for"),
  brands: z.array(z.string()).describe("Allowed brands; empty if the user did not restrict brand"),
  condition: z.enum(["new", "used", "refurbished", "any"]),
  quantity: z.number().int(),
  requirements: z.array(
    z.object({
      attribute: z.string().describe("snake_case attribute name, e.g. screen_size_in, capacity_gb"),
      operator: z.enum(["gte", "lte", "eq"]),
      value: z.string(),
    })
  ),
  max_amount: z.number().nullable().describe("Maximum total spend; null if the user gave no limit"),
  currency: z.string().describe("ISO 4217 code; USD if unspecified"),
  recurring: z.boolean().describe("true only if the user explicitly asked for a subscription"),
  allowed_merchants: z.array(z.string()),
  blocked_merchants: z.array(z.string()),
  ambiguities: z.array(z.string()).describe("Anything unclear that a human should confirm"),
});

export type CompiledMandate = z.infer<typeof CompiledMandateSchema>;

const SYSTEM_PROMPT = `You are Deadbolt's intent compiler. You convert a user's instruction to a shopping agent into a structured purchase mandate that will be enforced against the agent's transactions.

Rules:
- Capture only what the user actually said or clearly implied. Do not invent constraints, brands or merchants.
- "Under $X" / "for less than $X" / "no more than $X" all mean max_amount = X.
- If no condition is stated, use "new" (users expect new goods unless they say otherwise).
- If no quantity is stated, use 1.
- Put measurable product requirements in requirements (e.g. "27-inch" → screen_size_in gte 27, "2TB" → capacity_gb gte 2000).
- recurring is false unless the user explicitly asked for a subscription or recurring purchase.
- List anything ambiguous in ambiguities rather than guessing.`;

async function runCompiler(userContent: string): Promise<CompiledMandate> {
  const response = await getAnthropic().messages.parse({
    model: DEADBOLT_MODEL,
    max_tokens: 8000,
    output_config: { effort: "medium", format: zodOutputFormat(CompiledMandateSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`Intent compiler produced no valid mandate (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

/** Compile a fresh instruction into a mandate draft. */
export function compileIntent(instruction: string) {
  return runCompiler(`<instruction>\n${instruction}\n</instruction>`);
}

/**
 * Compile a revision ("that's fine, but don't let it go over $150") against an
 * existing mandate. Returns the full revised mandate, not a diff.
 */
export function compileRevision(existing: Mandate, change: string) {
  return runCompiler(
    `Here is the user's current mandate:\n<current_mandate>\n${JSON.stringify(
      { instruction: existing.instruction, intent: existing.intent, constraints: existing.constraints },
      null,
      2
    )}\n</current_mandate>\n\nThe user now says:\n<change>\n${change}\n</change>\n\nReturn the complete revised mandate. Keep everything the change does not affect.`
  );
}

/** Split a compiled draft into the mandate's intent and constraints. */
export function toMandateParts(
  compiled: CompiledMandate,
  maxAmountOverride?: number
): { intent: MandateIntent; constraints: MandateConstraints } | { error: string } {
  const maxAmount = maxAmountOverride ?? compiled.max_amount;
  // Fail closed: an agent never gets open-ended spending authority.
  if (maxAmount == null || !Number.isFinite(maxAmount) || !(maxAmount > 0)) {
    return { error: "The instruction has no spending limit. Add one (e.g. 'under $300') or pass max_amount." };
  }
  if (!Number.isInteger(compiled.quantity) || !(compiled.quantity >= 1)) {
    return { error: "Compiled quantity must be at least 1." };
  }

  if (compiled.ambiguities.length > 0 || !compiled.category.trim() || !/^[A-Za-z]{3}$/.test(compiled.currency)) {
    return { error: "Mandate is ambiguous or invalid; clarify the instruction before granting authority." };
  }
  if (compiled.currency.toUpperCase() !== "USD" || maxAmount > 9999999999.99) {
    return { error: "The sandbox supports USD purchases only, within its storage limit." };
  }
  return {
    intent: {
      action: "purchase",
      category: compiled.category.trim().toLowerCase(),
      description: compiled.description,
      brands: compiled.brands,
      condition: compiled.condition,
      quantity: compiled.quantity,
      requirements: compiled.requirements,
    },
    constraints: {
      max_amount: maxAmount,
      currency: compiled.currency.toUpperCase(),
      recurring: compiled.recurring,
      allowed_merchants: compiled.allowed_merchants,
      blocked_merchants: compiled.blocked_merchants,
    },
  };
}
