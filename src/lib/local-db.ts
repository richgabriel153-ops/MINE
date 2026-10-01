import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { BACKUP_APP, BACKUP_VERSION, planImport, type BackupFile, type ImportMode, type ImportPlan } from "./backup";
import { OLD_DEFAULT_BRAND_COLOR } from "./brand";
import type { Expense, ExpenseDraft } from "./expenses";
import { newId } from "./id";
import { formatDocNumber, type Counters } from "./numbering";
import { EMPTY_PROFILE, type BusinessProfile, type DocType, type DocumentDraft, type DocumentRecord, type PaymentMethod, type TemplateId } from "./types";

/**
 * Everything lives in one IndexedDB database on the device:
 *   documents – receipts and invoices
 *   meta      – profile, number counters, settings
 */
interface InCeiptDB extends DBSchema {
  documents: {
    key: string;
    value: DocumentRecord;
    indexes: { byCreatedAt: string };
  };
  meta: {
    key: string;
    value: unknown;
  };
  expenses: {
    key: string;
    value: Expense;
    indexes: { byDate: string };
  };
}

// Internal name kept from before the rename to InCeipt, so records already on phones stay.
const DB_NAME = "receiptnaija";
// v1: documents + meta. v2: expenses.
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<InCeiptDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<InCeiptDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Each step runs once per phone, so existing records are kept.
        if (oldVersion < 1) {
          const docs = db.createObjectStore("documents", { keyPath: "id" });
          docs.createIndex("byCreatedAt", "createdAt");
          db.createObjectStore("meta");
        }
        if (oldVersion < 2) {
          db.createObjectStore("expenses", { keyPath: "id" }).createIndex("byDate", "date");
        }
      },
    });
  }
  return dbPromise;
}

/* ---------- Profile ---------- */

export async function getProfile(): Promise<BusinessProfile> {
  const db = await getDb();
  const saved = (await db.get("meta", "profile")) as Partial<BusinessProfile> | undefined;
  const profile = { ...EMPTY_PROFILE, ...saved };
  // Moved from green to indigo; anyone still on the old default gets the new one.
  if (profile.brandColor.toLowerCase() === OLD_DEFAULT_BRAND_COLOR) profile.brandColor = EMPTY_PROFILE.brandColor;
  return profile;
}

export async function saveProfile(profile: BusinessProfile): Promise<void> {
  const db = await getDb();
  await db.put("meta", profile, "profile");
}

/* ---------- Counters ---------- */

const ZERO_COUNTERS: Counters = { receipt: 0, invoice: 0, quote: 0 };

export async function getCounters(): Promise<Counters> {
  const db = await getDb();
  const saved = (await db.get("meta", "counters")) as Counters | undefined;
  return { ...ZERO_COUNTERS, ...saved };
}

/** The number the next document of this type will get (for showing in the form). */
export async function peekNextNumber(type: DocType): Promise<string> {
  const counters = await getCounters();
  return formatDocNumber(type, counters[type] + 1);
}

/* ---------- Documents ---------- */

/** All documents, newest first. */
export async function listDocuments(): Promise<DocumentRecord[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("documents", "byCreatedAt");
  return all.reverse();
}

export async function getDocument(id: string): Promise<DocumentRecord | undefined> {
  const db = await getDb();
  return db.get("documents", id);
}

/**
 * Save a new document. Its number (RCT-0001 / INV-0001) is assigned here, in the same
 * transaction as the counter update, so two documents can never get the same number.
 */
export async function createDocument(draft: DocumentDraft): Promise<DocumentRecord> {
  const db = await getDb();
  const tx = db.transaction(["documents", "meta"], "readwrite");
  const meta = tx.objectStore("meta");
  const counters = { ...ZERO_COUNTERS, ...((await meta.get("counters")) as Counters | undefined) };
  counters[draft.type] += 1;
  const now = new Date().toISOString();
  const record: DocumentRecord = {
    ...draft,
    id: newId(),
    schemaVersion: 1,
    number: formatDocNumber(draft.type, counters[draft.type]),
    createdAt: now,
    updatedAt: now,
  };
  await meta.put(counters, "counters");
  await tx.objectStore("documents").put(record);
  await tx.done;
  return record;
}

/** Update an existing document. Its number and type stay the same. */
export async function updateDocument(id: string, draft: DocumentDraft): Promise<DocumentRecord> {
  const db = await getDb();
  const existing = await db.get("documents", id);
  if (!existing) throw new Error("This document no longer exists.");
  const record: DocumentRecord = {
    ...existing,
    ...draft,
    type: existing.type,
    id: existing.id,
    number: existing.number,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await db.put("documents", record);
  return record;
}

/**
 * Delete a document. If it was the receipt made from an invoice, the invoice stays "Paid"
 * but forgets the link, so its money is still counted in the summary.
 */
export async function deleteDocument(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("documents", "readwrite");
  const doc = await tx.store.get(id);
  if (doc?.sourceInvoiceId) {
    const invoice = await tx.store.get(doc.sourceInvoiceId);
    if (invoice?.receiptId === id) {
      const unlinked = { ...invoice, updatedAt: new Date().toISOString() };
      delete unlinked.receiptId;
      await tx.store.put(unlinked);
    }
  }
  await tx.store.delete(id);
  await tx.done;
}

/**
 * The customer has paid an invoice: mark it Paid and create a matching receipt (RCT-…) dated today,
 * linked both ways. Returns the new receipt.
 */
export async function markInvoicePaid(invoiceId: string, method: PaymentMethod, today: string): Promise<DocumentRecord> {
  const db = await getDb();
  const tx = db.transaction(["documents", "meta"], "readwrite");
  const docs = tx.objectStore("documents");
  const meta = tx.objectStore("meta");
  const invoice = await docs.get(invoiceId);
  if (!invoice || invoice.type !== "invoice") throw new Error("This invoice no longer exists.");
  if (invoice.receiptId) throw new Error("This invoice has already been marked as paid.");

  const counters = { ...ZERO_COUNTERS, ...((await meta.get("counters")) as Counters | undefined) };
  counters.receipt += 1;
  const now = new Date().toISOString();
  const receipt: DocumentRecord = {
    ...invoice,
    id: newId(),
    type: "receipt",
    number: formatDocNumber("receipt", counters.receipt),
    issueDate: today,
    dueDate: null,
    status: "paid",
    amountPaidKobo: 0,
    method,
    createdAt: now,
    updatedAt: now,
    sourceInvoiceId: invoice.id,
    sourceInvoiceNumber: invoice.number,
  };
  delete receipt.receiptId;
  await meta.put(counters, "counters");
  await docs.put(receipt);
  await docs.put({ ...invoice, status: "paid", method, receiptId: receipt.id, updatedAt: now });
  await tx.done;
  return receipt;
}

/**
 * Record money received on this phone (Pro). Adds to the amount paid; the status becomes
 * Part paid or Paid. Returns the updated document.
 */
export async function recordPayment(id: string, amountKobo: number, method: PaymentMethod): Promise<DocumentRecord> {
  const db = await getDb();
  const doc = await db.get("documents", id);
  if (!doc) throw new Error("This document no longer exists.");
  const { computeTotals } = await import("./totals");
  const totals = computeTotals(doc);
  if (amountKobo <= 0 || amountKobo > totals.balanceKobo) throw new Error("That amount is more than what's left to pay.");
  const paid = totals.amountPaidKobo + amountKobo;
  const full = paid >= totals.totalKobo;
  const updated: DocumentRecord = {
    ...doc,
    status: full ? "paid" : "part",
    amountPaidKobo: full ? 0 : paid,
    method,
    updatedAt: new Date().toISOString(),
  };
  await db.put("documents", updated);
  return updated;
}

/* ---------- Small settings (last notes, last template, …) ---------- */

export interface Settings {
  lastNotes: string;
  lastTemplate: TemplateId;
  /** ISO time of the last backup the user saved, or "" */
  lastBackupAt: string;
}

const DEFAULT_SETTINGS: Settings = { lastNotes: "", lastTemplate: "classic", lastBackupAt: "" };

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const saved = (await db.get("meta", "settings")) as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const db = await getDb();
  const current = await getSettings();
  await db.put("meta", { ...current, ...patch }, "settings");
}

/** Remember which template a document uses (no other changes). */
export async function setDocumentTemplate(id: string, templateId: TemplateId): Promise<DocumentRecord | undefined> {
  const db = await getDb();
  const doc = await db.get("documents", id);
  if (!doc) return undefined;
  const updated = { ...doc, templateId };
  await db.put("documents", updated);
  return updated;
}

/* ---------- Backup ---------- */

/** Everything on this phone, ready to save as a backup file. */
export async function exportAll(): Promise<BackupFile> {
  const [profile, counters, settings, documents, expenses, expenseCategories] = await Promise.all([
    getProfile(),
    getCounters(),
    getSettings(),
    listDocuments(),
    listExpenses(),
    getExpenseCategories(),
  ]);
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    profile,
    counters,
    settings: { lastNotes: settings.lastNotes, lastTemplate: settings.lastTemplate },
    documents,
    expenses,
    expenseCategories,
  };
}

/** Restore a backup (see planImport for how merge/replace work). All-or-nothing. */
export async function importBackup(backup: BackupFile, mode: ImportMode): Promise<ImportPlan> {
  const [documents, counters, profile] = await Promise.all([listDocuments(), getCounters(), getProfile()]);
  const plan = planImport(backup, { documents, counters, profile }, mode);
  const db = await getDb();
  const tx = db.transaction(["documents", "meta", "expenses"], "readwrite");
  const docs = tx.objectStore("documents");
  if (mode === "replace") await docs.clear();
  for (const doc of plan.documents) await docs.put(doc);
  const expenses = tx.objectStore("expenses");
  if (mode === "replace") await expenses.clear();
  for (const e of backup.expenses ?? []) {
    const existing = await expenses.get(e.id);
    if (!existing || e.updatedAt > existing.updatedAt) await expenses.put(e);
  }
  const meta = tx.objectStore("meta");
  await meta.put(plan.counters, "counters");
  await meta.put(plan.profile, "profile");
  if (backup.expenseCategories?.length) {
    const current = mode === "replace" ? [] : (((await meta.get("expenseCategories")) as string[] | undefined) ?? []);
    await meta.put([...new Set([...current, ...backup.expenseCategories])], "expenseCategories");
  }
  await tx.done;
  return plan;
}

/* ---------- Expenses ---------- */

/** All expenses, newest date first. */
export async function listExpenses(): Promise<Expense[]> {
  const db = await getDb();
  const all = await db.getAll("expenses");
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export async function saveExpense(id: string | null, draft: ExpenseDraft, photo?: string | null): Promise<Expense> {
  const db = await getDb();
  const existing = id ? await db.get("expenses", id) : undefined;
  const now = new Date().toISOString();
  const record: Expense = {
    ...existing,
    ...draft,
    id: existing?.id ?? newId(),
    photo: photo === undefined ? existing?.photo : photo || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.put("expenses", record);
  return record;
}

export async function deleteExpense(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("expenses", id);
}

export async function getExpenseCategories(): Promise<string[]> {
  const db = await getDb();
  return ((await db.get("meta", "expenseCategories")) as string[] | undefined) ?? [];
}

export async function setExpenseCategories(categories: string[]): Promise<void> {
  const db = await getDb();
  await db.put("meta", categories, "expenseCategories");
}

/* ---------- Pro ---------- */

export interface ProStatus {
  unlocked: boolean;
  unlockedAt: string;
}

export async function getProStatus(): Promise<ProStatus> {
  const db = await getDb();
  const saved = (await db.get("meta", "pro")) as ProStatus | undefined;
  return saved ?? { unlocked: false, unlockedAt: "" };
}

export async function setProUnlocked(): Promise<ProStatus> {
  const db = await getDb();
  const status = { unlocked: true, unlockedAt: new Date().toISOString() };
  await db.put("meta", status, "pro");
  return status;
}
