import "server-only";

import { reconcileBilling, type PaystackSubscription, type PlanIds, type StoredBilling } from "@/lib/paystack-subscriptions";
import { paystack, planCodes } from "./paystack";
import { supabaseAdmin } from "./supabase-admin";

let cachedIds: PlanIds | null = null;

/** Our plan codes from env, plus their numeric ids from Paystack (some responses only include the id). */
async function planIds(): Promise<PlanIds> {
  if (cachedIds) return cachedIds;
  const codes = planCodes();
  const ids: PlanIds = { monthly: { code: codes.monthly }, yearly: { code: codes.yearly } };
  for (const plan of ["monthly", "yearly"] as const) {
    if (!codes[plan]) continue;
    try {
      const p = await paystack<{ id: number }>(`/plan/${codes[plan]}`);
      ids[plan].id = p.id;
    } catch {
      // code-only matching still works
    }
  }
  cachedIds = ids;
  return ids;
}

const BILLING_COLUMNS =
  "business_id, plan, status, current_period_end, pending_plan, paystack_customer_code, paystack_customer_id, paystack_subscription_code, paystack_email_token, paystack_pending_subscription_code";

export interface BillingRow extends StoredBilling {
  business_id: string;
  paystack_customer_code: string | null;
  paystack_customer_id: number | null;
}

export async function getBilling(businessId: string): Promise<BillingRow | null> {
  const { data } = await supabaseAdmin().from("business_billing").select(BILLING_COLUMNS).eq("business_id", businessId).maybeSingle();
  return (data as BillingRow | null) ?? null;
}

/** Re-read the business's subscriptions from Paystack and store the result. */
export async function syncBusinessBilling(businessId: string): Promise<BillingRow | null> {
  const billing = await getBilling(businessId);
  if (!billing?.paystack_customer_code) return billing;
  let customerId = billing.paystack_customer_id;
  if (!customerId) {
    const c = await paystack<{ id: number }>(`/customer/${billing.paystack_customer_code}`);
    customerId = c.id;
  }
  const subs = await paystack<PaystackSubscription[]>(`/subscription?customer=${customerId}&perPage=50`);
  const next = reconcileBilling(billing, subs, await planIds());
  const { data } = await supabaseAdmin()
    .from("business_billing")
    .update({ ...next, paystack_customer_id: customerId, updated_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .select(BILLING_COLUMNS)
    .single();
  return data as BillingRow;
}

export async function businessIdForCustomer(customerCode: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from("business_billing").select("business_id").eq("paystack_customer_code", customerCode).maybeSingle();
  return (data?.business_id as string | undefined) ?? null;
}
