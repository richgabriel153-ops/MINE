/**
 * Records stored in the InCeipt account (Supabase). Writes go through database functions that
 * check the caller's role and Pro status; see supabase/migrations.
 */
import { formatDocNumber, type Counters } from "../numbering";
import { computeTotals } from "../totals";
import type { Expense, ExpenseDraft } from "../expenses";
import { EMPTY_PROFILE, type BusinessProfile, type DocType, type DocumentDraft, type DocumentRecord, type PaymentMethod, type QuoteStatus, type TemplateId } from "../types";
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
  payouts_connected?: boolean;
}

/** Add a Pay Now link to an invoice; returns the link code. */
export async function createPayLink(documentId: string): Promise<string> {
  try {
    return await call<string>("create_pay_link", { p_doc_id: documentId });
  } catch (err) {
    const m = err instanceof Error ? err.message : "";
    if (/payouts_not_connected/.test(m)) throw new Error("Online payments aren't set up for this business yet.");
    if (/nothing_to_pay/.test(m)) throw new Error("This invoice is already fully paid.");
    throw err;
  }
}

export async function myAccess(businessId: string): Promise<MyAccess> {
  return call<MyAccess>("my_access", { bid: businessId });
}

/* ---------- Staff and activity ---------- */

export interface Member {
  id: string;
  email: string;
  name: string;
  role: "owner" | "staff";
  status: "invited" | "active" | "deactivated";
  created_at: string;
}

export async function listMembers(businessId: string): Promise<Member[]> {
  const { data, error } = await supabase()
    .from("members")
    .select("id, email, name, role, status, created_at")
    .eq("business_id", businessId)
    .order("created_at");
  if (error) throw friendlyError(error);
  return data as Member[];
}

export async function inviteStaff(businessId: string, email: string, name: string): Promise<void> {
  try {
    await call("invite_staff", { bid: businessId, p_email: email, p_name: name });
  } catch (err) {
    const m = err instanceof Error ? err.message : "";
    if (/bad_email/.test(m)) throw new Error("That email address doesn't look right.");
    if (/is_owner/.test(m)) throw new Error("That's the owner's email.");
    throw err;
  }
}

export async function setStaffActive(memberId: string, active: boolean): Promise<void> {
  await call("set_staff_active", { p_member_id: memberId, p_active: active });
}

export async function setMyName(businessId: string, name: string): Promise<void> {
  await call("set_my_name", { bid: businessId, p_name: name });
}

export interface ActivityEntry {
  id: number;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  created_at: string;
}

export async function listActivity(businessId: string, beforeId?: number, limit = 50): Promise<ActivityEntry[]> {
  let q = supabase()
    .from("activity_log")
    .select("id, actor_name, action, entity_type, entity_id, summary, created_at")
    .eq("business_id", businessId)
    .order("id", { ascending: false })
    .limit(limit);
  if (beforeId) q = q.lt("id", beforeId);
  const { data, error } = await q;
  if (error) throw friendlyError(error);
  return data as ActivityEntry[];
}

export interface PaymentEntry {
  amount_kobo: number;
  method: string;
  paid_on: string;
  source: string;
  created_by_name: string;
  created_at: string;
}

export async function documentPayments(documentId: string): Promise<PaymentEntry[]> {
  const rows = await call<PaymentEntry[]>("document_payments", { p_doc_id: documentId });
  return rows.map((r) => ({ ...r, amount_kobo: Number(r.amount_kobo) }));
}

/* ---------- Expenses (owner) ---------- */

interface ExpenseRow {
  id: string;
  amount_kobo: number | string;
  category: string;
  spent_on: string;
  note: string;
  photo_path: string | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

function rowToExpense(r: ExpenseRow): Expense {
  return {
    id: r.id,
    amountKobo: Number(r.amount_kobo),
    category: r.category,
    date: r.spent_on,
    note: r.note,
    photoPath: r.photo_path,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listExpenses(businessId: string): Promise<Expense[]> {
  const { data, error } = await supabase()
    .from("expenses")
    .select("*")
    .eq("business_id", businessId)
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw friendlyError(error);
  return (data as ExpenseRow[]).map(rowToExpense);
}

const PHOTO_BUCKET = "expense-photos";

/** Save an expense; `photo` is a JPEG blob to upload, null to remove, undefined to keep. */
export async function saveExpense(businessId: string, id: string | null, draft: ExpenseDraft, photo?: Blob | null, myName = ""): Promise<Expense> {
  const sb = supabase();
  const expenseId = id ?? crypto.randomUUID();
  let photoPath: string | null | undefined;
  if (photo) {
    photoPath = `${businessId}/${expenseId}.jpg`;
    const { error } = await sb.storage.from(PHOTO_BUCKET).upload(photoPath, photo, { contentType: "image/jpeg", upsert: true });
    if (error) throw friendlyError(error);
  } else if (photo === null) {
    photoPath = null;
    await sb.storage.from(PHOTO_BUCKET).remove([`${businessId}/${expenseId}.jpg`]);
  }
  const row = {
    amount_kobo: draft.amountKobo,
    category: draft.category,
    spent_on: draft.date,
    note: draft.note,
    updated_at: new Date().toISOString(),
    ...(photoPath !== undefined ? { photo_path: photoPath } : {}),
  };
  const query = id
    ? sb.from("expenses").update(row).eq("id", id).select("*").single()
    : sb.from("expenses").insert({ ...row, id: expenseId, business_id: businessId, created_by_name: myName }).select("*").single();
  const { data, error } = await query;
  if (error) throw friendlyError(error);
  return rowToExpense(data as ExpenseRow);
}

export async function deleteExpense(businessId: string, expense: Expense): Promise<void> {
  const { error } = await supabase().from("expenses").delete().eq("id", expense.id);
  if (error) throw friendlyError(error);
  if (expense.photoPath) await supabase().storage.from(PHOTO_BUCKET).remove([expense.photoPath]);
  void businessId;
}

export async function expensePhotoUrl(path: string): Promise<string | null> {
  const { data } = await supabase().storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function getExpenseCategories(businessId: string): Promise<string[]> {
  const settings = await getBusinessSettings(businessId);
  return Array.isArray(settings.expenseCategories) ? (settings.expenseCategories as string[]) : [];
}

export async function setExpenseCategories(businessId: string, categories: string[]): Promise<void> {
  await call("set_expense_categories", { bid: businessId, p_categories: categories });
}

/** Money received per day (owner): every payment by the date it was paid. */
export async function listSales(businessId: string): Promise<{ date: string; amountKobo: number }[]> {
  const { data, error } = await supabase().from("payments").select("paid_on, amount_kobo").eq("business_id", businessId);
  if (error) throw friendlyError(error);
  return (data as { paid_on: string; amount_kobo: number | string }[]).map((p) => ({ date: p.paid_on, amountKobo: Number(p.amount_kobo) }));
}

/* ---------- Quotations ---------- */

export async function setQuoteStatus(id: string, status: QuoteStatus): Promise<DocumentRecord> {
  return rowToDocument(await call<DocumentRow>("set_quote_status", { p_id: id, p_status: status }));
}

export async function convertQuote(id: string, today: string): Promise<DocumentRecord> {
  try {
    return rowToDocument(await call<DocumentRow>("convert_quote", { p_id: id, p_today: today, p_due_days: 7 }));
  } catch (err) {
    if (err instanceof Error && /already_converted/.test(err.message)) throw new Error("This quote has already been turned into an invoice.");
    throw err;
  }
}
