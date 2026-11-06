/**
 * The app's data functions. Every record lives in the InCeipt account (Supabase); the phone keeps
 * only a small read-only copy for when the network drops (see offline-cache.ts) and a few display
 * preferences (last template, last note).
 */
import * as cloud from "./cloud/repo";
import { getCloudContext, type CloudContext } from "./cloud/session";
import type { Expense, ExpenseDraft } from "./expenses";
import { withOfflineCopy } from "./offline-cache";
import { OWNER_ONLY_MESSAGE } from "./permissions";
import type { BusinessProfile, DocType, DocumentDraft, DocumentRecord, PaymentMethod, QuoteStatus, TemplateId } from "./types";

// Display preferences only (never records). Kept on this phone.
export { getSettings, updateSettings } from "./local-db";
export type { Settings } from "./local-db";
export type { BusinessSummary, Customer, DocumentPageQuery } from "./cloud/repo";

export class NotSignedInError extends Error {
  constructor() {
    super("Please log in to continue.");
  }
}

async function ctx(): Promise<CloudContext> {
  const c = await getCloudContext();
  if (!c) throw new NotSignedInError();
  return c;
}

const key = (c: CloudContext, name: string) => `${c.businessId}:${name}`;

export async function getProfile(): Promise<BusinessProfile> {
  const c = await ctx();
  return withOfflineCopy(key(c, "profile"), () => cloud.getProfile(c.businessId));
}

export async function saveProfile(profile: BusinessProfile): Promise<void> {
  const c = await ctx();
  return cloud.saveProfile(c.businessId, profile);
}

export async function peekNextNumber(type: DocType): Promise<string> {
  const c = await ctx();
  return cloud.peekNextNumber(c.businessId, type);
}

/** Every document (used by reports: profit, tax, quotes). Lists on screen use listDocumentsPage. */
export async function listDocuments(): Promise<DocumentRecord[]> {
  const c = await ctx();
  return withOfflineCopy(key(c, "documents"), () => cloud.listDocuments(c.businessId));
}

/** One page of documents, filtered and searched in the database. */
export async function listDocumentsPage(q: cloud.DocumentPageQuery): Promise<{ docs: DocumentRecord[]; hasMore: boolean }> {
  const c = await ctx();
  const name = `page:${q.type}:${q.status ?? "all"}:${q.search ?? ""}:${q.offset}`;
  return withOfflineCopy(key(c, name), () => cloud.listDocumentsPage(c.businessId, q));
}

/** Home screen totals, calculated by the database (owner only). */
export async function getBusinessSummary(today: string): Promise<cloud.BusinessSummary> {
  const c = await ctx();
  return withOfflineCopy(key(c, `summary:${today}`), () => cloud.businessSummary(c.businessId, today));
}

export async function getDocument(id: string): Promise<DocumentRecord | undefined> {
  const c = await ctx();
  return withOfflineCopy(key(c, `doc:${id}`), () => cloud.getDocument(id));
}

export async function createDocument(draft: DocumentDraft): Promise<DocumentRecord> {
  const c = await ctx();
  return cloud.createDocument(c.businessId, draft);
}

export async function updateDocument(id: string, draft: DocumentDraft): Promise<DocumentRecord> {
  await ctx();
  return cloud.updateDocument(id, draft);
}

export class OwnerOnlyError extends Error {
  constructor() {
    super(OWNER_ONLY_MESSAGE);
  }
}

/** Throws OwnerOnlyError when a staff member tries (the attempt is logged for the owner). */
export async function deleteDocument(id: string): Promise<void> {
  await ctx();
  if (!(await cloud.deleteDocument(id))) throw new OwnerOnlyError();
}

export async function markInvoicePaid(invoiceId: string, method: PaymentMethod, today: string): Promise<DocumentRecord> {
  await ctx();
  return cloud.markInvoicePaid(invoiceId, method, today);
}

/** Record money received against an invoice or receipt (Pro). */
export async function recordPayment(id: string, amountKobo: number, method: PaymentMethod, paidOn: string): Promise<DocumentRecord> {
  await ctx();
  return cloud.recordPayment(id, amountKobo, method, paidOn);
}

export async function setDocumentTemplate(id: string, templateId: TemplateId): Promise<void> {
  await ctx();
  await cloud.setDocumentTemplate(id, templateId);
}

/* ---------- Customers ---------- */

export async function listCustomers(search: string, offset: number, limit = 30) {
  const c = await ctx();
  return withOfflineCopy(key(c, `customers:${search}:${offset}`), () => cloud.listCustomers(c.businessId, search, offset, limit));
}

export async function saveCustomer(id: string | null, name: string, phone: string): Promise<string> {
  const c = await ctx();
  return cloud.saveCustomer(c.businessId, id, name, phone);
}

export async function deleteCustomer(id: string): Promise<void> {
  await ctx();
  return cloud.deleteCustomer(id);
}

export async function customerDocuments(customerId: string): Promise<DocumentRecord[]> {
  const c = await ctx();
  return withOfflineCopy(key(c, `customer-docs:${customerId}`), () => cloud.customerDocuments(c.businessId, customerId));
}

/* ---------- Expenses and profit (owner, Pro) ---------- */

export async function listExpenses(): Promise<Expense[]> {
  const c = await ctx();
  return withOfflineCopy(key(c, "expenses"), () => cloud.listExpenses(c.businessId));
}

export async function listExpensesPage(offset: number, limit: number): Promise<{ expenses: Expense[]; hasMore: boolean }> {
  const c = await ctx();
  return withOfflineCopy(key(c, `expenses-page-${offset}-${limit}`), () => cloud.listExpensesPage(c.businessId, offset, limit));
}

export async function expensesSince(from: string): Promise<number> {
  const c = await ctx();
  return withOfflineCopy(key(c, `expenses-since-${from}`), () => cloud.expensesSince(c.businessId, from));
}

/** `photo`: a compressed JPEG to attach, null to remove, undefined to keep. */
export async function saveExpense(id: string | null, draft: ExpenseDraft, photo?: Blob | null): Promise<Expense> {
  const c = await ctx();
  return cloud.saveExpense(c.businessId, id, draft, photo);
}

export async function deleteExpense(expense: Expense): Promise<void> {
  const c = await ctx();
  return cloud.deleteExpense(c.businessId, expense);
}

/** A viewable address for an expense photo. */
export async function expensePhotoUrl(expense: Expense): Promise<string | null> {
  if (expense.photo) return expense.photo;
  if (expense.photoPath) return cloud.expensePhotoUrl(expense.photoPath);
  return null;
}

export async function getExpenseCategories(): Promise<string[]> {
  const c = await ctx();
  return withOfflineCopy(key(c, "categories"), () => cloud.getExpenseCategories(c.businessId));
}

export async function setExpenseCategories(categories: string[]): Promise<void> {
  const c = await ctx();
  return cloud.setExpenseCategories(c.businessId, categories);
}

/** Money received per day (from payments). */
export async function listSales(): Promise<{ date: string; amountKobo: number }[]> {
  const c = await ctx();
  return withOfflineCopy(key(c, "sales"), () => cloud.listSales(c.businessId));
}

/* ---------- Quotations (Pro) ---------- */

export async function setQuoteStatus(id: string, status: QuoteStatus): Promise<DocumentRecord> {
  await ctx();
  return cloud.setQuoteStatus(id, status);
}

/** One tap: make a linked invoice from a quote. Returns the new invoice. */
export async function convertQuote(id: string, today: string): Promise<DocumentRecord> {
  await ctx();
  return cloud.convertQuote(id, today);
}

/* ---------- Your data ---------- */

export async function exportMyData(): Promise<unknown> {
  await ctx().catch(() => null); // export works for any signed-in person, even without a business
  return cloud.exportMyData();
}
