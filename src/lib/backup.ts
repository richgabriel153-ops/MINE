import { countersFromNumbers, type Counters } from "./numbering";
import { EMPTY_PROFILE, type BusinessProfile, type DocumentRecord } from "./types";

export const BACKUP_APP = "inceipt";
/** Backups made before the app was renamed from ReceiptNaija to InCeipt. */
const LEGACY_BACKUP_APPS = ["receiptnaija"];
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  profile: BusinessProfile;
  counters: Counters;
  settings: Record<string, unknown>;
  documents: DocumentRecord[];
}

export class BackupError extends Error {}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isDocument(v: unknown): v is DocumentRecord {
  if (!isObject(v)) return false;
  return (
    typeof v.id === "string" &&
    (v.type === "receipt" || v.type === "invoice") &&
    typeof v.number === "string" &&
    typeof v.issueDate === "string" &&
    Array.isArray(v.items) &&
    v.items.every(
      (i) =>
        isObject(i) &&
        typeof i.description === "string" &&
        typeof i.quantity === "number" &&
        Number.isSafeInteger(i.unitPriceKobo),
    ) &&
    (v.status === "paid" || v.status === "part" || v.status === "unpaid") &&
    Number.isSafeInteger(v.amountPaidKobo) &&
    Number.isSafeInteger(v.deliveryKobo) &&
    isObject(v.customer)
  );
}

/** Read a backup file's text, checking it really is one of ours. Throws BackupError with a friendly message. */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("This file isn't a InCeipt backup.");
  }
  if (!isObject(data) || (data.app !== BACKUP_APP && !LEGACY_BACKUP_APPS.includes(String(data.app)))) throw new BackupError("This file isn't a InCeipt backup.");
  if (typeof data.version !== "number" || data.version > BACKUP_VERSION)
    throw new BackupError("This backup was made with a newer version of InCeipt. Please update the app first.");
  if (!Array.isArray(data.documents)) throw new BackupError("This backup file is damaged.");
  const bad = data.documents.filter((d) => !isDocument(d)).length;
  if (bad > 0) throw new BackupError(`This backup file is damaged (${bad} record${bad === 1 ? "" : "s"} can't be read).`);

  const counters = isObject(data.counters) ? data.counters : {};
  return {
    app: BACKUP_APP,
    version: data.version,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : "",
    profile: { ...EMPTY_PROFILE, ...(isObject(data.profile) ? (data.profile as Partial<BusinessProfile>) : {}) },
    counters: {
      receipt: Number.isSafeInteger(counters.receipt) ? (counters.receipt as number) : 0,
      invoice: Number.isSafeInteger(counters.invoice) ? (counters.invoice as number) : 0,
    },
    settings: isObject(data.settings) ? data.settings : {},
    documents: data.documents as DocumentRecord[],
  };
}

export type ImportMode = "merge" | "replace";

export interface ImportPlan {
  documents: DocumentRecord[];
  counters: Counters;
  profile: BusinessProfile;
  added: number;
  updated: number;
}

/**
 * Work out the result of restoring a backup.
 *  merge:   keep what's on this phone, add new records from the backup; when both have the same record, keep the newer one.
 *  replace: use the backup only.
 * Counters always end up at least as high as every number in use, so numbers never repeat.
 */
export function planImport(
  backup: BackupFile,
  current: { documents: DocumentRecord[]; counters: Counters; profile: BusinessProfile },
  mode: ImportMode,
): ImportPlan {
  if (mode === "replace") {
    return {
      documents: backup.documents,
      counters: countersFromNumbers(backup.documents.map((d) => d.number), backup.counters),
      profile: backup.profile,
      added: backup.documents.length,
      updated: 0,
    };
  }
  const byId = new Map(current.documents.map((d) => [d.id, d]));
  let added = 0;
  let updated = 0;
  for (const doc of backup.documents) {
    const existing = byId.get(doc.id);
    if (!existing) {
      byId.set(doc.id, doc);
      added += 1;
    } else if (doc.updatedAt > existing.updatedAt) {
      byId.set(doc.id, doc);
      updated += 1;
    }
  }
  const documents = [...byId.values()];
  const highest = {
    receipt: Math.max(current.counters.receipt, backup.counters.receipt),
    invoice: Math.max(current.counters.invoice, backup.counters.invoice),
  };
  return {
    documents,
    counters: countersFromNumbers(documents.map((d) => d.number), highest),
    // Keep this phone's business details unless none have been entered yet.
    profile: current.profile.name.trim() ? current.profile : backup.profile,
    added,
    updated,
  };
}

export function backupFileName(today: string): string {
  return `inceipt-backup-${today}.json`;
}
