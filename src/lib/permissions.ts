/**
 * What a user may do, from two facts: are they Pro, and are they the owner or a staff member.
 * Phone-only (no account) users are always the owner of their own records.
 */
export type Role = "owner" | "staff";

export interface Permissions {
  /** Record part payments and see who owes money (debt tracking). */
  trackDebts: boolean;
  /** Bold and Elegant templates. */
  proTemplates: boolean;
  /** Hide "Made with InCeipt". */
  removeFooter: boolean;
  /** See all records in History, not only the latest 50. */
  unlimitedHistory: boolean;
  /** Quotations and proforma invoices. */
  quotes: boolean;
  /** Log expenses and see profit. Owner only. */
  expenses: boolean;
  /** See sales totals and money received. Owner only. */
  viewRevenue: boolean;
  /** Edit or delete past records. Owner only. */
  editRecords: boolean;
  /** Business details, branding, backup, payouts, billing. Owner only. */
  manageBusiness: boolean;
  /** Invite and manage staff, see the activity log. Owner + Pro. */
  manageStaff: boolean;
  /** Add Pay Now links to invoices. */
  payLinks: boolean;
  /** Tax estimates and tax reports. Owner + Pro. */
  taxes: boolean;
  /** The InCeipt Assistant (AI). Pro; staff can use it within their own permissions. */
  assistant: boolean;
}

export function permissionsFor(role: Role, isPro: boolean): Permissions {
  const owner = role === "owner";
  return {
    trackDebts: isPro,
    proTemplates: isPro,
    removeFooter: isPro,
    unlimitedHistory: isPro,
    quotes: isPro,
    expenses: isPro && owner,
    viewRevenue: owner,
    editRecords: owner,
    manageBusiness: owner,
    manageStaff: isPro && owner,
    payLinks: isPro,
    taxes: isPro && owner,
    assistant: isPro,
  };
}

/** Friendly reason shown when a staff member hits an owner-only action. */
export const OWNER_ONLY_MESSAGE = "Only the business owner can do this.";
