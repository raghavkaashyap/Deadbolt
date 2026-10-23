// PayPal redirects the sandbox buyer here after approving (or cancelling) an order.
// On approval we capture the payment and show the result.
import { captureOrder } from "@/lib/deadbolt/paypal";
import { getPayment, updatePayment } from "@/lib/deadbolt/store";

export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { id } = await params;
  const { cancelled } = await searchParams;

  let message: string;
  try {
    const payment = await getPayment(id);
    if (!payment) {
      message = "Payment not found.";
    } else if (cancelled) {
      message = "Payment cancelled. No money moved.";
    } else if (payment.status === "COMPLETED") {
      message = `Payment complete: ${payment.currency} ${payment.amount} (PayPal order ${payment.paypal_order_id}).`;
    } else if (payment.status === "APPROVAL_PENDING" && payment.paypal_order_id) {
      const captured = await captureOrder(payment.paypal_order_id);
      const status = captured.status === "COMPLETED" ? "COMPLETED" : "FAILED";
      await updatePayment(id, { status, raw: captured });
      message =
        status === "COMPLETED"
          ? `Payment complete: ${payment.currency} ${payment.amount} (PayPal order ${payment.paypal_order_id}).`
          : `PayPal returned status ${captured.status}.`;
    } else {
      message = `Payment is ${payment.status}.`;
    }
  } catch (error) {
    message = `Capture failed: ${(error as Error).message}`;
  }

  return (
    <section className="py-12 text-center">
      <h1 className="text-2xl font-bold mb-4">Deadbolt payment</h1>
      <p className="text-gray-600">{message}</p>
    </section>
  );
}
