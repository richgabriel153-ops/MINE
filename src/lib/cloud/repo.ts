/**
 * Records stored in the InCeipt account (Supabase). Writes go through database functions that
 * check the caller's role and Pro status; see supabase/migrations.
 */
import { formatDocNumber, type Counters } from "../numbering";
import { computeTotals } from "../totals";
import { EMPTY_PROFILE, type BusinessProfile, type DocType, type DocumentDraft, type DocumentRecord, type PaymentMethod, type TemplateId } from "../types";
import { friendlyError, supabase } from "./client";

export interface DocumentRow {
  id: string;
  business_id: string;
  type: DocType;
  number: string;
  issue_date: string;
  status: DocumentRecord["status"];
  total_kobo: number | string;
  amount_paid_kobo: number | string;
  data: Partial<DocumentRecord>;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export function rowToDocument(row: DocumentRow): DocumentRecord {
  const paid = Number(row.amount_paid_kobo);
  return {
    ...(row.data as DocumentRecord),
    id: row.id,
    schemaVersion: 1,
    type: row.type,
    number: row.number,
    status: row.status,
    amountPaidKobo: row.status === "part" ? paid : 0,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw friendlyError(error);
  return data as T;
}

/** Totals the server stores alongside the document (worked out with the same kobo maths). */
function totalsFor(draft: DocumentDraft): { total: number; paid: number } {
  const t = computeTotals(draft);
  return { total: t.totalKobo, paid: t.amountPaidKobo };
}

export async function listDocuments(businessId: string): Promise<DocumentRecord[]> {
  const { data, error } = await supabase()
    .from("documents")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw friendlyError(error);
  return (data as DocumentRow[]).map(rowToDocument);
}

export async function getDocument(id: string): Promise<DocumentRecord | undefined> {
  const { data, error } = await supabase().from("documents").select("*").eq("id", id).maybeSingle();
  if (error) throw friendlyError(error);
  return data ? rowToDocument(data as DocumentRow) : undefined;
}

export async function createDocument(businessId: string, draft: DocumentDraft): Promise<DocumentRecord> {
  const { total, paid } = totalsFor(draft);
  const row = await call<DocumentRow>("create_document", { bid: businessId, p_doc: draft, p_total: total, p_paid: paid });
  return rowToDocument(row);
}

export async function updateDocument(id: string, draft: DocumentDraft): Promise<DocumentRecord> {
  const { total, paid } = totalsFor(draft);
  const row = await call<DocumentRow>("update_document", { p_id: id, p_doc: draft, p_total: total, p_paid: paid });
  return rowToDocument(row);
}

/** Returns false when the caller isn't allowed (the attempt is logged for the owner). */
export async function deleteDocument(id: string): Promise<boolean> {
  return call<boolean>("delete_document", { p_id: id });
}

export async function markInvoicePaid(invoiceId: string, method: PaymentMethod, today: string): Promise<DocumentRecord> {
  return rowToDocument(await call<DocumentRow>("mark_invoice_paid", { p_invoice_id: invoiceId, p_method: method, p_today: today }));
}

export async function recordPayment(documentId: string, amountKobo: number, method: PaymentMethod | "online", paidOn: string): Promise<DocumentRecord> {
  return rowToDocument(
    await call<DocumentRow>("record_payment", { p_document_id: documentId, p_amount: amountKobo, p_method: method, p_paid_on: paidOn }),
  );
}

export async function setDocumentTemplate(id: string, templateId: TemplateId): Promise<void> {
  await call("set_document_template", { p_id: id, p_template: templateId });
}

interface BusinessRow {
  id: string;
  profile: Partial<BusinessProfile>;
  counters: Partial<Counters> & { quote?: number };
  settings: Record<string, unknown>;
}

async function getBusiness(businessId: string): Promise<BusinessRow> {
  const { data, error } = await supabase().from("businesses").select("id, profile, counters, settings").eq("id", businessId).single();
  if (error) throw friendlyError(error);
  return data as BusinessRow;
}

export async function getProfile(businessId: string): Promise<BusinessProfile> {
  const b = await getBusiness(businessId);
  return { ...EMPTY_PROFILE, ...b.profile };
}

export async function saveProfile(businessId: string, profile: BusinessProfile): Promise<void> {
  await call("update_business_profile", { bid: businessId, p_profile: profile });
}

export async function getBusinessSettings(businessId: string): Promise<Record<string, unknown>> {
  return (await getBusiness(businessId)).settings ?? {};
}

export async function peekNextNumber(businessId: string, type: DocType): Promise<string> {
  const b = await getBusiness(businessId);
  const used = Number((b.counters as Record<string, number>)[type] ?? 0);
  return formatDocNumber(type, used + 1);
}

/* ---------- Account set-up ---------- */

export interface MyBusiness {
  business_id: string;
  name: string;
  role: "owner" | "staff";
  status: string;
  is_pro: boolean;
}

export async function myBusinesses(): Promise<MyBusiness[]> {
  return call<MyBusiness[]>("my_businesses", {});
}

export async function createBusiness(profile: BusinessProfile, ownerName: string): Promise<string> {
  return call<string>("create_business", { p_profile: profile, p_owner_name: ownerName });
}

/** Copy records saved on this phone into the account (keeps their numbers). */
export async function importLocal(businessId: string, docs: DocumentRecord[], counters: Counters): Promise<number> {
  const payload = docs.map((doc) => {
    const t = computeTotals(doc);
    // Receipts made from an invoice don't carry money of their own (the invoice does).
    const paid = doc.type === "invoice" && doc.receiptId ? t.totalKobo : t.amountPaidKobo;
    return { doc, total: t.totalKobo, paid };
  });
  return call<number>("import_local", { bid: businessId, p_docs: payload, p_counters: counters });
}

export interface MyAccess {
  role: "owner" | "staff" | null;
  member_status: "invited" | "active" | "deactivated" | null;
  is_pro: boolean;
  comp: boolean;
  plan: "monthly" | "yearly" | null;
  status: string | null;
  current_period_end: string | null;
  pending_plan: "monthly" | "yearly" | null;
}

export async function myAccess(businessId: string): Promise<MyAccess> {
  return call<MyAccess>("my_access", { bid: businessId });
}
