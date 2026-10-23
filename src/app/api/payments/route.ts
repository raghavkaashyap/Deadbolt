import { TransitionConflict } from "@/lib/deadbolt/store";
import { requireAccess, requireAgentIdentity } from "@/lib/deadbolt/access";
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
import { transition, updatePayment, type PaymentRecord } from "@/lib/deadbolt/store";

export async function POST(request: NextRequest) {
  const denied = requireAccess(request, true);
  if (denied) return denied;
  const parsed = await parseBody(request, PaymentSchema);
  if ("response" in parsed) return parsed.response;
  const { agent_id, capability_token, transaction } = parsed.data;
  const wrongAgent = requireAgentIdentity(agent_id);
  if (wrongAgent) return wrongAgent;

  try {
    const verified = verifyCapability(capability_token, agent_id, transaction);
    if (!verified.ok) return jsonError(403, `Payment refused: ${verified.reason}`);
    const capability = verified.payload;
    const reserved = await transition<PaymentRecord>("reserve", {
      authorization_id: capability.authorization_id, capability_id: capability.capability_id,
      agent_id, payment_id: newId("pay"),
    });
    if (reserved.status !== "CREATED") return NextResponse.json(reserved);
    const paymentId = reserved.payment_id;
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
    if (error instanceof TransitionConflict) return jsonError(409, "Task state changed; refresh before retrying");
      // A timeout may mean PayPal accepted the order. Keep the reservation and
      // retry with the same paymentId / PayPal-Request-Id; never reopen the task.
      console.error("Sandbox order creation uncertain", paymentId, error);
      throw error;
    }
  } catch (error) {
    if (error instanceof TransitionConflict) return jsonError(409, "Task state changed; refresh before retrying");
    console.error(error);
    return jsonError(502, "Payment could not be created");
  }
}
