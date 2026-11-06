import { createHash } from "node:crypto";

import { isValidPaystackSignature } from "@/lib/paystack-signature";
import { businessIdForCustomer, syncBusinessBilling } from "@/lib/server/billing-sync";
import { recordOnlinePayment } from "@/lib/server/pay-links";
import { isServerCloudConfigured, supabaseAdmin } from "@/lib/server/supabase-admin";

/**
 * Paystack webhook. Set this URL in Paystack → Settings → API Keys & Webhooks:
 *   https://<your-domain>/api/paystack/webhook
 *
 * Every request must carry a valid x-paystack-signature (HMAC-SHA512 of the body with your secret key).
 * Each body is processed once (stored by its hash). We always answer 200 quickly once verified,
 * so Paystack doesn't keep retrying; failures are kept in paystack_events for follow-up.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!isValidPaystackSignature(raw, request.headers.get("x-paystack-signature"), process.env.PAYSTACK_SECRET_KEY)) {
    return new Response("Invalid signature", { status: 401 });
  }
  if (!isServerCloudConfigured()) return new Response("Not configured", { status: 503 });

  let payload: { event?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const event = payload.event ?? "unknown";
  const data = payload.data ?? {};
  const id = createHash("sha256").update(raw).digest("hex");

  const db = supabaseAdmin();
  const { error: dupError } = await db.from("paystack_events").insert({ id, event, payload });
  if (dupError) {
    // Already received (unique id) → nothing to do.
    if (dupError.code === "23505") return new Response("OK (duplicate)");
    console.error("paystack webhook store", dupError);
  }

  try {
    await handle(event, data);
    await db.from("paystack_events").update({ processed_at: new Date().toISOString() }).eq("id", id);
  } catch (err) {
    console.error("paystack webhook", event, err);
    await db.from("paystack_events").update({ error: String(err instanceof Error ? err.message : err) }).eq("id", id);
  }
  return new Response("OK");
}

async function handle(event: string, data: Record<string, unknown>) {
  const metadata = (typeof data.metadata === "object" && data.metadata ? data.metadata : {}) as Record<string, unknown>;

  // A customer paid an invoice through a Pay Now link.
  if (event === "charge.success" && metadata.kind === "invoice_payment") {
    await recordOnlinePayment(data);
    return;
  }

  // Anything about subscriptions: re-read the business's plan from Paystack.
  const isSubscriptionEvent =
    event.startsWith("subscription.") || event.startsWith("invoice.") || (event === "charge.success" && (data.plan || metadata.kind === "subscription"));
  if (!isSubscriptionEvent) return;

  const customer = (data.customer ?? {}) as { customer_code?: string };
  let businessId = typeof metadata.business_id === "string" ? metadata.business_id : null;
  if (!businessId && customer.customer_code) businessId = await businessIdForCustomer(customer.customer_code);
  if (businessId) await syncBusinessBilling(businessId);
}
