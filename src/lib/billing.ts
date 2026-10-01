import { formatDate, lagosDate } from "./dates";
import { formatNaira } from "./money";

export type Plan = "monthly" | "yearly";

export const PLANS: Record<Plan, { kobo: number; label: string; per: string }> = {
  monthly: { kobo: 300_000, label: "Monthly", per: "month" },
  yearly: { kobo: 2_800_000, label: "Yearly", per: "year" },
};

/** Paying yearly instead of 12 months: ₦36,000 − ₦28,000 = ₦8,000. */
export const YEARLY_SAVING_KOBO = PLANS.monthly.kobo * 12 - PLANS.yearly.kobo;

/** Pro keeps working this long after a missed renewal, to give time to pay. */
export const GRACE_DAYS = 3;

export type BillingStatus = "none" | "active" | "non_renewing" | "attention" | "cancelled";

export interface BillingState {
  comp: boolean;
  status: BillingStatus;
  periodEnd: string | null;
}

/** Same rule as the database's is_pro(): honoured, or within the paid period plus grace days. */
export function isProActive(b: BillingState, now: Date = new Date()): boolean {
  if (b.comp) return true;
  if (!["active", "non_renewing", "attention"].includes(b.status) || !b.periodEnd) return false;
  return Date.parse(b.periodEnd) + GRACE_DAYS * 86_400_000 > now.getTime();
}

function day(iso: string): string {
  return formatDate(lagosDate(new Date(iso)));
}

interface AccessLike {
  isPro: boolean;
  proSource: "legacy" | "subscription" | "comp" | null;
  cloud?: { plan: Plan | null; billingStatus: string | null; periodEnd: string | null; pendingPlan: Plan | null };
}

/** One-line plan description for the account and Pro pages. */
export function billingSummary(access: AccessLike, now: Date = new Date()): { title: string; detail: string } {
  if (access.proSource === "comp" || access.proSource === "legacy") return { title: "Pro", detail: "Unlocked with a code. Thank you for being an early supporter." };
  const c = access.cloud;
  if (!c || !c.plan || !c.periodEnd || c.billingStatus === "none") return { title: "Free", detail: "Upgrade for debt tracking, staff, Pay Now links and more." };
  const plan = PLANS[c.plan];
  const ends = day(c.periodEnd);
  const graceOver = Date.parse(c.periodEnd) + GRACE_DAYS * 86_400_000 <= now.getTime();
  switch (c.billingStatus) {
    case "active":
      return {
        title: `Pro ${plan.label}`,
        detail: c.pendingPlan
          ? `Renews on ${ends}, then switches to ${PLANS[c.pendingPlan].label} (${formatNaira(PLANS[c.pendingPlan].kobo)}/${PLANS[c.pendingPlan].per}).`
          : `Renews on ${ends} for ${formatNaira(plan.kobo)}.`,
      };
    case "non_renewing":
      return c.pendingPlan
        ? { title: `Pro ${plan.label}`, detail: `Switches to ${PLANS[c.pendingPlan].label} on ${ends}.` }
        : { title: `Pro ${plan.label} (cancelled)`, detail: graceOver ? "Your Pro has ended." : `Pro stays on until ${ends}, then you move to Free.` };
    case "attention":
      return {
        title: `Pro ${plan.label}: payment failed`,
        detail: graceOver ? "Pro is paused until payment goes through." : "We couldn't renew your plan. Update your card to keep Pro.",
      };
    default:
      return { title: "Free", detail: "Your Pro has ended. Upgrade any time; your records are safe." };
  }
}
