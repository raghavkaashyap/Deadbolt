import { TransitionConflict } from "@/lib/deadbolt/store";
import { requireAccess, requireAgentIdentity } from "@/lib/deadbolt/access";
/**
 * POST /api/payments/:id/capture
 * Captures a PayPal order after the sandbox buyer approved it.
 */
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/deadbolt/http";
import { captureOrder } from "@/lib/deadbolt/paypal";
import { getPayment, getAuthorization, updatePayment, transition, type PaymentRecord } from "@/lib/deadbolt/store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAccess(_request, true);
  if (denied) return denied;
  const { id } = await params;
  try {
    const payment = await getPayment(id);
    if (!payment) return jsonError(404, "Payment not found");
    const authorization = await getAuthorization(payment.authorization_id);
    if (!authorization) return jsonError(403, "Payment authorization missing");
    const wrongAgent = requireAgentIdentity(authorization.agent_id);
    if (wrongAgent) return wrongAgent;
    if (payment.status === "COMPLETED") return NextResponse.json(payment);
    if (payment.status !== "APPROVAL_PENDING" || !payment.paypal_order_id) {
      return jsonError(409, `Payment is ${payment.status} and cannot be captured`);
    }

    await transition<PaymentRecord>("capture", {
      payment_id: id, capability_id: payment.capability_id, authorization_id: payment.authorization_id,
    });
    const captured = await captureOrder(payment.paypal_order_id);
    const updated = await updatePayment(id, {
      status: captured.status === "COMPLETED" ? "COMPLETED" : "APPROVAL_PENDING",
      raw: captured,
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof TransitionConflict) return jsonError(409, "Task state changed; refresh before retrying");
    console.error(error);
    return jsonError(502, "Capture failed");
  }
}
