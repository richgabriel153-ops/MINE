import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { newId } from "./id";
import { formatDocNumber, type Counters } from "./numbering";
import { EMPTY_PROFILE, type BusinessProfile, type DocType, type DocumentDraft, type DocumentRecord, type TemplateId } from "./types";

/**
 * Everything lives in one IndexedDB database on the device:
 *   documents – receipts and invoices
 *   meta      – profile, number counters, settings
 */
interface ReceiptNaijaDB extends DBSchema {
  documents: {
    key: string;
    value: DocumentRecord;
    indexes: { byCreatedAt: string };
  };
  meta: {
    key: string;
    value: unknown;
  };
}

const DB_NAME = "receiptnaija";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ReceiptNaijaDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<ReceiptNaijaDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const docs = db.createObjectStore("documents", { keyPath: "id" });
        docs.createIndex("byCreatedAt", "createdAt");
        db.createObjectStore("meta");
      },
    });
  }
  return dbPromise;
}

/* ---------- Profile ---------- */

export async function getProfile(): Promise<BusinessProfile> {
  const db = await getDb();
  const saved = (await db.get("meta", "profile")) as Partial<BusinessProfile> | undefined;
  return { ...EMPTY_PROFILE, ...saved };
}

export async function saveProfile(profile: BusinessProfile): Promise<void> {
  const db = await getDb();
  await db.put("meta", profile, "profile");
}

/* ---------- Counters ---------- */

const ZERO_COUNTERS: Counters = { receipt: 0, invoice: 0 };

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

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("documents", id);
}

/* ---------- Small settings (last notes, last template, …) ---------- */

export interface Settings {
  lastNotes: string;
  lastTemplate: TemplateId;
}

const DEFAULT_SETTINGS: Settings = { lastNotes: "", lastTemplate: "classic" };

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
