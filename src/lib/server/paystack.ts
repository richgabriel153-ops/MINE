import "server-only";

/** Minimal Paystack REST client (server only; uses PAYSTACK_SECRET_KEY). */
const BASE = "https://api.paystack.co";

export class PaystackError extends Error {}

export function isPaystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

export async function paystack<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new PaystackError("Payments aren't set up yet.");
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || json.status === false) throw new PaystackError(json.message || `Paystack error (${res.status})`);
  return json.data as T;
}

export function planCodes() {
  return {
    monthly: process.env.PAYSTACK_PLAN_MONTHLY?.trim() ?? "",
    yearly: process.env.PAYSTACK_PLAN_YEARLY?.trim() ?? "",
  };
}

/** Where to send people back to after paying (this deployment's address). */
export function appOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  return `${proto}://${host}`;
}
