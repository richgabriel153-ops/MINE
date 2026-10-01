import "server-only";

import { lagosDate } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { supabaseAdmin } from "./supabase-admin";

/** A successful Paystack charge for an invoice (from the webhook or from verifying a reference). */
interface ChargeData {
  status?: string;
  reference?: string;
  amount?: number;
  paid_at?: string;
  paidAt?: string;
  metadata?: unknown;
}

/**
 * Record a Pay Now payment against its invoice. Safe to call more than once for the same
 * transaction (the reference is unique). The invoice's paid amount and status update automatically.
 * Returns true if this call recorded it.
 */
export async function recordOnlinePayment(data: Record<string, unknown> | ChargeData): Promise<boolean> {
  const charge = data as ChargeData;
  const meta = (typeof charge.metadata === "object" && charge.metadata ? charge.metadata : {}) as Record<string, unknown>;
  const documentId = typeof meta.document_id === "string" ? meta.document_id : null;
  if (charge.status !== "success" || !charge.reference || !documentId || !charge.amount || charge.amount <= 0) return false;

  const db = supabaseAdmin();
  const { data: doc } = await db.from("documents").select("id, business_id, number, type").eq("id", documentId).maybeSingle();
  if (!doc || doc.type !== "invoice") return false;

  const paidAt = charge.paid_at ?? charge.paidAt ?? new Date().toISOString();
  const { data: inserted, error } = await db
    .from("payments")
    .upsert(
      {
        business_id: doc.business_id,
        document_id: doc.id,
        amount_kobo: Math.round(charge.amount),
        method: "online",
        paid_on: lagosDate(new Date(paidAt)),
        kind: "payment",
        source: "paystack",
        reference: charge.reference,
        created_by_name: "Paystack",
      },
      { onConflict: "reference", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  if (!inserted || inserted.length === 0) return false; // already recorded

  await db.from("activity_log").insert({
    business_id: doc.business_id,
    actor_name: "Paystack",
    action: "payment",
    entity_type: "invoice",
    entity_id: doc.id,
    summary: `Customer paid ${formatNaira(Math.round(charge.amount))} online for ${doc.number}`,
  });
  return true;
}

export interface PublicInvoice {
  businessName: string;
  logo: string;
  brandColor: string;
  number: string;
  customerName: string;
  issueDate: string;
  dueDate: string | null;
  totalKobo: number;
  paidKobo: number;
  balanceKobo: number;
  items: { description: string; quantity: number }[];
  businessId: string;
  documentId: string;
}

/** What a customer sees on the Pay Now page (nothing private beyond the invoice itself). */
export async function invoiceForToken(token: string): Promise<PublicInvoice | null> {
  if (!/^[a-f0-9]{8,32}$/.test(token)) return null;
  const db = supabaseAdmin();
  const { data: doc } = await db
    .from("documents")
    .select("id, business_id, number, type, issue_date, total_kobo, amount_paid_kobo, data")
    .eq("pay_token", token)
    .maybeSingle();
  if (!doc || doc.type !== "invoice") return null;
  const { data: business } = await db.from("businesses").select("profile").eq("id", doc.business_id).single();
  const profile = (business?.profile ?? {}) as Record<string, string>;
  const data = doc.data as { customer?: { name?: string }; dueDate?: string | null; items?: { description: string; quantity: number }[] };
  const total = Number(doc.total_kobo);
  const paid = Number(doc.amount_paid_kobo);
  return {
    businessName: profile.name ?? "",
    logo: profile.logo ?? "",
    brandColor: profile.brandColor ?? "#3e4580",
    number: doc.number,
    customerName: data.customer?.name ?? "",
    issueDate: doc.issue_date,
    dueDate: data.dueDate ?? null,
    totalKobo: total,
    paidKobo: paid,
    balanceKobo: Math.max(0, total - paid),
    items: (data.items ?? []).map((i) => ({ description: i.description, quantity: i.quantity })),
    businessId: doc.business_id,
    documentId: doc.id,
  };
}

export async function subaccountFor(businessId: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from("business_payouts").select("subaccount_code").eq("business_id", businessId).maybeSingle();
  return (data?.subaccount_code as string | undefined) ?? null;
}
