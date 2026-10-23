// Redirects are unauthenticated GETs and must never capture or expose a payment.
export default function PaymentReturnPage() {
  return (
    <section className="py-12 text-center">
      <h1 className="text-2xl font-bold mb-4">Deadbolt sandbox payment</h1>
      <p className="text-gray-600">Return to your shopping agent to confirm the payment status and complete checkout.</p>
    </section>
  );
}
