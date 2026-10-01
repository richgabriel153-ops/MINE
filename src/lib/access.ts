import { myAccess } from "./cloud/repo";
import { getCloudContext } from "./cloud/session";
import { getProStatus } from "./local-db";
import { permissionsFor, type Permissions, type Role } from "./permissions";

export type ProSource = "legacy" | "subscription" | "comp";

export interface CloudAccount {
  email: string;
  businessId: string;
  plan: "monthly" | "yearly" | null;
  /** Subscription status: none | active | non_renewing | attention | cancelled (owner only) */
  billingStatus: string | null;
  periodEnd: string | null;
  pendingPlan: "monthly" | "yearly" | null;
}

export interface Access {
  /** "local": records on this phone only. "cloud": signed in to a business account. */
  mode: "local" | "cloud";
  isPro: boolean;
  proSource: ProSource | null;
  role: Role;
  can: Permissions;
  cloud?: CloudAccount;
  /** Set when a signed-in person can't use the business (e.g. deactivated staff, or the owner's Pro ended). */
  blocked?: string;
  offline?: boolean;
}

/** Work out what the current user can do. */
export async function loadAccess(): Promise<Access> {
  const ctx = await getCloudContext().catch(() => null);
  if (ctx) {
    try {
      const a = await myAccess(ctx.businessId);
      const role: Role = a.role ?? "staff";
      const cloud: CloudAccount = {
        email: ctx.email,
        businessId: ctx.businessId,
        plan: a.plan,
        billingStatus: a.status,
        periodEnd: a.current_period_end,
        pendingPlan: a.pending_plan,
      };
      const blocked = !a.role
        ? a.member_status === "deactivated"
          ? "The owner has turned off your access to this business."
          : "Staff access is paused because this business isn't on Pro right now. Ask the owner to renew."
        : undefined;
      return {
        mode: "cloud",
        isPro: a.is_pro,
        proSource: a.is_pro ? (a.comp ? "comp" : "subscription") : null,
        role,
        can: permissionsFor(role, a.is_pro),
        cloud,
        blocked,
      };
    } catch {
      // Account records need the internet.
      return {
        mode: "cloud",
        isPro: false,
        proSource: null,
        role: "staff",
        can: permissionsFor("staff", false),
        cloud: { email: ctx.email, businessId: ctx.businessId, plan: null, billingStatus: null, periodEnd: null, pendingPlan: null },
        blocked: "You're offline. Your business records are in your InCeipt account, so connect to the internet to continue.",
        offline: true,
      };
    }
  }
  const legacy = await getProStatus();
  const isPro = legacy.unlocked;
  return {
    mode: "local",
    isPro,
    proSource: isPro ? "legacy" : null,
    role: "owner",
    can: permissionsFor("owner", isPro),
  };
}
