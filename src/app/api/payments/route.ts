/**
 * POST /api/payments
 * { agent_id, capability_token, transaction }
 *
 * Executes an authorized payment through PayPal Sandbox. The capability is
 * re-verified against the exact transaction and consumed (single use) before
 * PayPal is called. Returns the PayPal approve_url for the sandbox buyer.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyCapability } from "@/lib/deadbolt/capability";
import { jsonError, parseBody } from "@/lib/deadbolt/http";
import { newId } from "@/lib/deadbolt/ids";
import { createOrder } from "@/lib/deadbolt/paypal";
import { PaymentSchema } from "@/lib/deadbolt/schemas";
import { consumeCapability, insertPayment, updatePayment } from "@/lib/deadbolt/store";

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, PaymentSchema);
  if ("response" in parsed) return parsed.response;
  const { agent_id, capability_token, transaction } = parsed.data;

  const verified = verifyCapability(capability_token, agent_id, transaction);
  if (!verified.ok) return jsonError(403, `Payment refused: ${verified.reason}`);
  const capability = verified.payload;

  try {
    if (!(await consumeCapability(capability.capability_id))) {
      return jsonError(403, "Payment refused: capability already used");
    }

    const paymentId = newId("pay");
    const now = new Date().toISOString();
    await insertPayment({
      payment_id: paymentId,
      capability_id: capability.capability_id,
      authorization_id: capability.authorization_id,
      paypal_order_id: null,
      status: "CREATED",
      amount: transaction.amount,
      currency: transaction.currency.toUpperCase(),
      approve_url: null,
      raw: null,
      created_at: now,
      updated_at: now,
    });

    try {
      const { order, approveUrl } = await createOrder({
        paymentId,
        amount: transaction.amount,
        currency: transaction.currency.toUpperCase(),
        description: `${transaction.product} — ${transaction.merchant}`,
      });
      const payment = await updatePayment(paymentId, {
        paypal_order_id: order.id,
        status: "APPROVAL_PENDING",
        approve_url: approveUrl,
        raw: order,
      });
      return NextResponse.json(payment, { status: 201 });
    } catch (error) {
      await updatePayment(paymentId, { status: "FAILED", raw: { error: (error as Error).message } });
      throw error;
    }
  } catch (error) {
    console.error(error);
    return jsonError(502, "Payment could not be created");
  }
}
