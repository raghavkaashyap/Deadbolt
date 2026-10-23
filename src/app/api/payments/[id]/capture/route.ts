/**
 * POST /api/payments/:id/capture
 * Captures a PayPal order after the sandbox buyer approved it.
 */
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/deadbolt/http";
import { captureOrder } from "@/lib/deadbolt/paypal";
import { getPayment, updatePayment } from "@/lib/deadbolt/store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const payment = await getPayment(id);
    if (!payment) return jsonError(404, "Payment not found");
    if (payment.status === "COMPLETED") return NextResponse.json(payment);
    if (payment.status !== "APPROVAL_PENDING" || !payment.paypal_order_id) {
      return jsonError(409, `Payment is ${payment.status} and cannot be captured`);
    }

    const captured = await captureOrder(payment.paypal_order_id);
    const updated = await updatePayment(id, {
      status: captured.status === "COMPLETED" ? "COMPLETED" : "FAILED",
      raw: captured,
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return jsonError(502, "Capture failed");
  }
}
