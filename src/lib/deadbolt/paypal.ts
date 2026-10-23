/**
 * Minimal PayPal Orders v2 client (Sandbox by default).
 *
 * Flow: createOrder → buyer approves at the returned approve_url (a sandbox
 * buyer account) → captureOrder. Deadbolt only calls this after a capability
 * has been verified and consumed.
 */

const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken() {
  if (PAYPAL_API_BASE !== "https://api-m.sandbox.paypal.com") throw new Error("Only PayPal Sandbox is supported; merchant identity is not verified");
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET is not set");

  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function paypalRequest<T>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`${PAYPAL_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "PayPal-Request-Id": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal ${path} failed: ${res.status} ${JSON.stringify(data)}`);
  return data as T;
}

interface PayPalOrder {
  id: string;
  status: string;
  links?: { href: string; rel: string }[];
}

export async function createOrder(args: {
  paymentId: string;
  amount: number;
  currency: string;
  description: string;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const order = await paypalRequest<PayPalOrder>(
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: args.paymentId,
          description: args.description.slice(0, 127),
          amount: { currency_code: args.currency, value: args.amount.toFixed(2) },
        },
      ],
      application_context: {
        return_url: `${appUrl}/payments/${args.paymentId}/return`,
        cancel_url: `${appUrl}/payments/${args.paymentId}/return?cancelled=1`,
        user_action: "PAY_NOW",
      },
    },
    args.paymentId
  );
  const approveUrl = order.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href ?? null;
  return { order, approveUrl };
}

export function captureOrder(orderId: string) {
  return paypalRequest<PayPalOrder>(`/v2/checkout/orders/${orderId}/capture`, {}, `capture_${orderId}`);
}
