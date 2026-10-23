/** Sandbox-only Orders v2 client. Callers own durable idempotency and retries. */
import { z } from "zod";

const SANDBOX = "https://api-m.sandbox.paypal.com";
const TIMEOUT_MS = 10000;
const TokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() });
const OrderSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
  status: z.enum(["CREATED", "SAVED", "APPROVED", "VOIDED", "COMPLETED", "PAYER_ACTION_REQUIRED"]),
  links: z.array(z.object({ href: z.string().url(), rel: z.string() })).optional(),
}).passthrough();
type PayPalOrder = z.infer<typeof OrderSchema>;

export class PayPalError extends Error {
  constructor(message: string, readonly status: number | null = null, readonly debugId?: string) {
    super(message);
    this.name = "PayPalError";
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;

function safeCode(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : undefined;
}

/** Never include provider bodies, credentials, access tokens or buyer data in errors. */
async function fetchJSON(path: string, init: RequestInit): Promise<unknown> {
  if ((process.env.PAYPAL_API_BASE ?? SANDBOX) !== SANDBOX) throw new PayPalError("Only PayPal Sandbox is supported");
  let response: Response;
  let data: unknown;
  try {
    response = await fetch(`${SANDBOX}${path}`, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
    data = await response.json();
  } catch {
    throw new PayPalError("PayPal request timed out, failed, or returned invalid JSON; the payment outcome may be uncertain");
  }
  if (!response.ok) {
    const error = data as { debug_id?: unknown; details?: { issue?: unknown }[] } | null;
    const debugId = safeCode(error?.debug_id);
    const issue = Array.isArray(error?.details) ? safeCode(error.details[0]?.issue) : undefined;
    if (response.status === 401) cachedToken = null;
    throw new PayPalError(`PayPal HTTP ${response.status}${issue ? ` (${issue})` : ""}${debugId ? `; debug ID ${debugId}` : ""}`, response.status, debugId);
  }
  return data;
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.value;
  if (!tokenRequest) {
    tokenRequest = (async () => {
      const id = process.env.PAYPAL_CLIENT_ID;
      const secret = process.env.PAYPAL_CLIENT_SECRET;
      if (!id || !secret) throw new PayPalError("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required");
      const raw = await fetchJSON("/v1/oauth2/token", {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      const parsed = TokenSchema.safeParse(raw);
      if (!parsed.success) throw new PayPalError("PayPal returned an invalid access token response");
      cachedToken = { value: parsed.data.access_token, expiresAt: Date.now() + parsed.data.expires_in * 1000 };
      return cachedToken.value;
    })().finally(() => { tokenRequest = null; });
  }
  return tokenRequest;
}

async function paypalRequest(path: string, body: unknown, idempotencyKey: string): Promise<PayPalOrder> {
  const raw = await fetchJSON(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${await getAccessToken()}`, "Content-Type": "application/json", "PayPal-Request-Id": idempotencyKey, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const parsed = OrderSchema.safeParse(raw);
  if (!parsed.success) throw new PayPalError("PayPal returned an invalid order response; reconcile before retrying");
  return parsed.data;
}

export async function createOrder(args: { paymentId: string; amount: number; currency: string; description: string }) {
  if (args.currency !== "USD" || !Number.isFinite(args.amount) || args.amount <= 0 || Math.abs(args.amount * 100 - Math.round(args.amount * 100)) > 0.00001) {
    throw new PayPalError("Sandbox orders require a positive USD amount in cents");
  }
  const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  if (!["http:", "https:"].includes(appUrl.protocol) || appUrl.username || appUrl.password || appUrl.search || appUrl.hash || appUrl.pathname !== "/") throw new PayPalError("NEXT_PUBLIC_APP_URL must be an HTTP(S) origin");
  const returnUrl = `${appUrl.origin}/payments/${encodeURIComponent(args.paymentId)}/return`;
  const order = await paypalRequest("/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [{ reference_id: args.paymentId, description: args.description.slice(0, 127), amount: { currency_code: args.currency, value: args.amount.toFixed(2) } }],
    application_context: { return_url: returnUrl, cancel_url: `${returnUrl}?cancelled=1`, user_action: "PAY_NOW" },
  }, args.paymentId);
  const approveUrl = order.links?.find(link => link.rel === "approve" || link.rel === "payer-action")?.href ?? null;
  if (approveUrl) {
    const url = new URL(approveUrl);
    if (url.protocol !== "https:" || !["www.sandbox.paypal.com", "sandbox.paypal.com"].includes(url.hostname) || url.username || url.password || url.port) {
      throw new PayPalError("PayPal returned an unexpected approval URL");
    }
  } else if (!["APPROVED", "COMPLETED"].includes(order.status)) {
    throw new PayPalError("PayPal returned no buyer approval URL; reconcile before retrying");
  }
  return { order, approveUrl };
}

export async function captureOrder(orderId: string) {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(orderId)) throw new PayPalError("Invalid PayPal order ID");
  const order = await paypalRequest(`/v2/checkout/orders/${orderId}/capture`, {}, `capture_${orderId}`);
  if (order.id !== orderId) throw new PayPalError("PayPal returned a different order; reconcile before retrying");
  return order;
}
