import { myAccess } from "./cloud/repo";
import { getCloudContext } from "./cloud/session";
import { isNetworkError } from "./offline-cache";
import { permissionsFor, type Permissions, type Role } from "./permissions";

export type ProSource = "subscription" | "comp";

export interface CloudAccount {
  email: string;
  businessId: string;
  plan: "monthly" | "yearly" | null;
  /** Subscription status: none | active | non_renewing | attention | cancelled (owner only) */
  billingStatus: string | null;
  periodEnd: string | null;
  pendingPlan: "monthly" | "yearly" | null;
  /** Online payments set up (Pay Now links can be added). */
  payoutsConnected: boolean;
}

export interface Access {
  /** Always "cloud": records live in the InCeipt account. (Kept so older screens keep compiling.) */
  mode: "cloud";
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
const ACCESS_KEY = "inceipt.access";

function cacheAccess(a: Access) {
  try {
    localStorage.setItem(ACCESS_KEY, JSON.stringify(a));
  } catch {
    // ignore
  }
}

function cachedAccess(businessId: string): Access | null {
  try {
    const a = JSON.parse(localStorage.getItem(ACCESS_KEY) ?? "null") as Access | null;
    return a?.cloud?.businessId === businessId ? a : null;
  } catch {
    return null;
  }
}

/** Work out what the current user can do (needs a login and a chosen business). */
export async function loadAccess(): Promise<Access> {
  const ctx = await getCloudContext().catch(() => null);
  if (!ctx) {
    return {
      mode: "cloud",
      isPro: false,
      proSource: null,
      role: "staff",
      can: permissionsFor("staff", false),
      blocked: "Please log in to continue.",
    };
  }
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
      payoutsConnected: Boolean(a.payouts_connected),
    };
    const blocked = !a.role
      ? a.member_status === "deactivated"
        ? "The owner has turned off your access to this business."
        : "Staff access is paused because this business isn't on Pro right now. Ask the owner to renew."
      : undefined;
    const access: Access = {
      mode: "cloud",
      isPro: a.is_pro,
      proSource: a.is_pro ? (a.comp ? "comp" : "subscription") : null,
      role,
      can: permissionsFor(role, a.is_pro),
      cloud,
      blocked,
    };
    if (!blocked) cacheAccess(access);
    return access;
  } catch (err) {
    // Offline: carry on with what we knew last time (screens show the saved copy; saving waits).
    const saved = isNetworkError(err) ? cachedAccess(ctx.businessId) : null;
    if (saved) return { ...saved, offline: true };
    return {
      mode: "cloud",
      isPro: false,
      proSource: null,
      role: "staff",
      can: permissionsFor("staff", false),
      cloud: { email: ctx.email, businessId: ctx.businessId, plan: null, billingStatus: null, periodEnd: null, pendingPlan: null, payoutsConnected: false },
      blocked: "You're offline. Connect to the internet to open your business for the first time on this phone.",
      offline: true,
    };
  }
}
