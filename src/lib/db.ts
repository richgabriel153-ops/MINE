/**
 * The app's data functions. Each one works on this phone's records (no account) or on the
 * InCeipt account's records (signed in), so screens don't need to know which.
 */
import * as cloud from "./cloud/repo";
import { getCloudContext } from "./cloud/session";
import type { Expense, ExpenseDraft } from "./expenses";
import * as local from "./local-db";
import { OWNER_ONLY_MESSAGE } from "./permissions";
import { salesFromDocuments } from "./summary";
import type { BusinessProfile, DocType, DocumentDraft, DocumentRecord, PaymentMethod, QuoteStatus, TemplateId } from "./types";

// Things that always stay on this phone.
export { getSettings, updateSettings, exportAll, importBackup, getProStatus, setProUnlocked } from "./local-db";
export type { Settings, ProStatus } from "./local-db";

export async function isCloudMode(): Promise<boolean> {
  return (await getCloudContext()) !== null;
}

export async function getProfile(): Promise<BusinessProfile> {
  const c = await getCloudContext();
  return c ? cloud.getProfile(c.businessId) : local.getProfile();
}

export async function saveProfile(profile: BusinessProfile): Promise<void> {
  const c = await getCloudContext();
  return c ? cloud.saveProfile(c.businessId, profile) : local.saveProfile(profile);
}

export async function peekNextNumber(type: DocType): Promise<string> {
  const c = await getCloudContext();
  return c ? cloud.peekNextNumber(c.businessId, type) : local.peekNextNumber(type);
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  const c = await getCloudContext();
  return c ? cloud.listDocuments(c.businessId) : local.listDocuments();
}

export async function getDocument(id: string): Promise<DocumentRecord | undefined> {
  const c = await getCloudContext();
  return c ? cloud.getDocument(id) : local.getDocument(id);
}

export async function createDocument(draft: DocumentDraft): Promise<DocumentRecord> {
  const c = await getCloudContext();
  return c ? cloud.createDocument(c.businessId, draft) : local.createDocument(draft);
}

export async function updateDocument(id: string, draft: DocumentDraft): Promise<DocumentRecord> {
  const c = await getCloudContext();
  return c ? cloud.updateDocument(id, draft) : local.updateDocument(id, draft);
}

export class OwnerOnlyError extends Error {
  constructor() {
    super(OWNER_ONLY_MESSAGE);
  }
}

/** Throws OwnerOnlyError when a staff member tries (the attempt is logged for the owner). */
export async function deleteDocument(id: string): Promise<void> {
  const c = await getCloudContext();
  if (!c) return local.deleteDocument(id);
  if (!(await cloud.deleteDocument(id))) throw new OwnerOnlyError();
}

export async function markInvoicePaid(invoiceId: string, method: PaymentMethod, today: string): Promise<DocumentRecord> {
  const c = await getCloudContext();
  return c ? cloud.markInvoicePaid(invoiceId, method, today) : local.markInvoicePaid(invoiceId, method, today);
}

/** Record money received against an invoice or receipt (Pro). */
export async function recordPayment(id: string, amountKobo: number, method: PaymentMethod, paidOn: string): Promise<DocumentRecord> {
  const c = await getCloudContext();
  return c ? cloud.recordPayment(id, amountKobo, method, paidOn) : local.recordPayment(id, amountKobo, method);
}

export async function setDocumentTemplate(id: string, templateId: TemplateId): Promise<void> {
  const c = await getCloudContext();
  if (c) await cloud.setDocumentTemplate(id, templateId);
  else await local.setDocumentTemplate(id, templateId);
}

/* ---------- Expenses and profit (owner, Pro) ---------- */

export async function listExpenses(): Promise<Expense[]> {
  const c = await getCloudContext();
  return c ? cloud.listExpenses(c.businessId) : local.listExpenses();
}

/** `photo`: a compressed JPEG to attach, null to remove, undefined to keep. */
export async function saveExpense(id: string | null, draft: ExpenseDraft, photo?: Blob | null): Promise<Expense> {
  const c = await getCloudContext();
  if (c) return cloud.saveExpense(c.businessId, id, draft, photo);
  const dataUrl = photo ? await blobToDataUrl(photo) : photo;
  return local.saveExpense(id, draft, dataUrl);
}

export async function deleteExpense(expense: Expense): Promise<void> {
  const c = await getCloudContext();
  return c ? cloud.deleteExpense(c.businessId, expense) : local.deleteExpense(expense.id);
}

/** A viewable address for an expense photo. */
export async function expensePhotoUrl(expense: Expense): Promise<string | null> {
  if (expense.photo) return expense.photo;
  if (expense.photoPath) return cloud.expensePhotoUrl(expense.photoPath);
  return null;
}

export async function getExpenseCategories(): Promise<string[]> {
  const c = await getCloudContext();
  return c ? cloud.getExpenseCategories(c.businessId) : local.getExpenseCategories();
}

export async function setExpenseCategories(categories: string[]): Promise<void> {
  const c = await getCloudContext();
  return c ? cloud.setExpenseCategories(c.businessId, categories) : local.setExpenseCategories(categories);
}

/** Money received per day: payments (account) or receipts/invoices (phone). */
export async function listSales(): Promise<{ date: string; amountKobo: number }[]> {
  const c = await getCloudContext();
  return c ? cloud.listSales(c.businessId) : salesFromDocuments(await local.listDocuments());
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/* ---------- Quotations (Pro) ---------- */

export async function setQuoteStatus(id: string, status: QuoteStatus): Promise<DocumentRecord> {
  const c = await getCloudContext();
  return c ? cloud.setQuoteStatus(id, status) : local.setQuoteStatus(id, status);
}

/** One tap: make a linked invoice from a quote. Returns the new invoice. */
export async function convertQuote(id: string, today: string): Promise<DocumentRecord> {
  const c = await getCloudContext();
  return c ? cloud.convertQuote(id, today) : local.convertQuote(id, today);
}
