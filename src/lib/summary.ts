import { startOfMonth, startOfWeek } from "./dates";
import { computeTotals } from "./totals";
import type { DocumentRecord } from "./types";

/**
 * Money actually received for a document.
 * An invoice that was turned into a receipt is skipped: the receipt already counts that money.
 */
export function receivedKobo(doc: DocumentRecord): number {
  if (doc.type === "invoice" && doc.receiptId) return 0;
  return computeTotals(doc).amountPaidKobo;
}

/** Money still owed on a document (0 once an invoice has been turned into a receipt). */
export function owingKobo(doc: DocumentRecord): number {
  if (doc.type === "invoice" && doc.receiptId) return 0;
  return computeTotals(doc).balanceKobo;
}

export function isOwing(doc: DocumentRecord): boolean {
  return owingKobo(doc) > 0;
}

export interface Summary {
  weekKobo: number;
  monthKobo: number;
  owingKobo: number;
  owingCount: number;
}

/** Sales this week (Mon–Sun) and this month by document date, plus everything still owed. */
export function summarise(docs: DocumentRecord[], today: string): Summary {
  const weekStart = startOfWeek(today);
  const monthStart = startOfMonth(today);
  const summary: Summary = { weekKobo: 0, monthKobo: 0, owingKobo: 0, owingCount: 0 };
  for (const doc of docs) {
    const received = receivedKobo(doc);
    if (doc.issueDate <= today) {
      if (doc.issueDate >= weekStart) summary.weekKobo += received;
      if (doc.issueDate >= monthStart) summary.monthKobo += received;
    }
    const owing = owingKobo(doc);
    if (owing > 0) {
      summary.owingKobo += owing;
      summary.owingCount += 1;
    }
  }
  return summary;
}
