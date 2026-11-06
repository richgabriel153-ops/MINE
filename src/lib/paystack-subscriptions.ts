import type { BillingStatus, Plan } from "./billing";

/** A Paystack subscription, as returned by GET /subscription. */
export interface PaystackSubscription {
  subscription_code: string;
  email_token: string;
  /** active | non-renewing | attention | completed | complete | cancelled */
  status: string;
  next_payment_date: string | null;
  createdAt?: string;
  plan: { plan_code?: string; id?: number } | number | string | null;
}

export interface StoredBilling {
  plan: Plan | null;
  status: BillingStatus;
  current_period_end: string | null;
  pending_plan: Plan | null;
  paystack_subscription_code: string | null;
  paystack_email_token: string | null;
  paystack_pending_subscription_code: string | null;
}

/** Our two plans, identified by Paystack plan code (PLN_…) and/or numeric plan id. */
export interface PlanIds {
  monthly: { code: string; id?: number };
  yearly: { code: string; id?: number };
}

export function planOf(sub: PaystackSubscription, ids: PlanIds): Plan | null {
  const p = sub.plan;
  const code = typeof p === "object" && p ? p.plan_code : typeof p === "string" ? p : undefined;
  const id = typeof p === "object" && p ? p.id : typeof p === "number" ? p : undefined;
  for (const plan of ["monthly", "yearly"] as const) {
    if ((code && code === ids[plan].code) || (id !== undefined && id === ids[plan].id)) return plan;
  }
  return null;
}

const LIVE = new Set(["active", "non-renewing", "attention"]);

/**
 * Work out a business's plan from its Paystack subscriptions (the source of truth), so a missed or
 * repeated webhook can never leave it in the wrong state.
 *
 * - One live subscription → that's the plan.
 * - Two live (after switching plans): the one that won't renew is current; the other starts when
 *   it ends and shows as the pending plan.
 * - None live → Free (status "cancelled"), keeping the last period end for the record.
 */
export function reconcileBilling(prev: StoredBilling, subs: PaystackSubscription[], ids: PlanIds): StoredBilling {
  const ours = subs.filter((s) => planOf(s, ids) !== null);
  const live = ours.filter((s) => LIVE.has(s.status));

  if (live.length === 0) {
    const wasLive = ["active", "non_renewing", "attention"].includes(prev.status);
    return {
      ...prev,
      status: wasLive || prev.status === "cancelled" ? "cancelled" : prev.status,
      pending_plan: null,
      paystack_pending_subscription_code: null,
    };
  }

  const byStart = [...live].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const current = live.find((s) => s.status === "non-renewing" && live.length > 1) ?? byStart[0];
  const pending = live.find((s) => s !== current) ?? null;

  const status: BillingStatus =
    current.status === "attention" ? "attention" : current.status === "non-renewing" ? "non_renewing" : "active";
  const sameSub = prev.paystack_subscription_code === current.subscription_code;

  return {
    plan: planOf(current, ids),
    status,
    current_period_end: current.next_payment_date ?? (sameSub ? prev.current_period_end : null) ?? prev.current_period_end,
    pending_plan: pending ? planOf(pending, ids) : null,
    paystack_subscription_code: current.subscription_code,
    paystack_email_token: current.email_token,
    paystack_pending_subscription_code: pending?.subscription_code ?? null,
  };
}
