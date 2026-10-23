/** Request-body schemas for the Deadbolt API routes. */
import { z } from "zod";
import { PROTECTED_FIELDS } from "./types";

export const TransactionSchema = z.object({
  merchant: z.string().min(1),
  product: z.string().min(1),
  product_category: z.string().optional(),
  brand: z.string().optional(),
  condition: z.enum(["new", "used", "refurbished"]).optional(),
  amount: z.number().positive().max(9999999999.99).multipleOf(0.01),
  currency: z.literal("USD"),
  quantity: z.number().int().positive().optional(),
  recurring: z.boolean().optional(),
  recipient: z.string().optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const ProvenanceEventSchema = z.object({
  step: z.number().int(),
  timestamp: z.string(),
  tool: z.string(),
  source: z.string(),
  trust: z.enum(["trusted", "semi_trusted", "untrusted"]),
  input: z.string().optional(),
  output: z.string().optional(),
  changed_fields: z.partialRecord(z.enum(PROTECTED_FIELDS), z.unknown()).optional(),
});

export const CreateMandateSchema = z.object({
  agent_id: z.string().min(1),
  instruction: z.string().min(1).max(2000),
  principal: z.string().min(1).default("demo_user"),
  /** Overrides or supplies the spending limit if the instruction has none. */
  max_amount: z.number().positive().optional(),
  ttl_minutes: z.number().int().min(1).max(24 * 60).default(60),
});

export const ReviseMandateSchema = z.object({
  /** Natural-language change, e.g. "don't let it go over $150". */
  change: z.string().min(1).max(2000),
  ttl_minutes: z.number().int().min(1).max(24 * 60).optional(),
});

export const AuthorizeSchema = z.object({
  agent_id: z.string().min(1),
  mandate_id: z.string().min(1),
  transaction: TransactionSchema,
  provenance: z.array(ProvenanceEventSchema).default([]),
});

export const ApprovalSchema = z.object({
  decision: z.enum(["approve", "deny"]),
  channel: z.enum(["web", "sms", "voice"]).default("web"),
  note: z.string().max(500).optional(),
});

export const PaymentSchema = z.object({
  agent_id: z.string().min(1),
  capability_token: z.string().min(1),
  transaction: TransactionSchema,
});
