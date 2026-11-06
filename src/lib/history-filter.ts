import { formatNgPhone } from "./phone";
import { isOwing } from "./summary";
import type { DocType, DocumentRecord, PaymentStatus } from "./types";

export type StatusFilter = "all" | "owing" | PaymentStatus;
export type TypeFilter = "all" | DocType;

export interface HistoryFilter {
  query: string;
  status: StatusFilter;
  type: TypeFilter;
}

function matchesQuery(doc: DocumentRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  const haystack = [doc.number, doc.customer.name, doc.notes, ...doc.items.map((i) => i.description)].join(" ").toLowerCase();
  if (haystack.includes(q)) return true;
  // Phone search: "0803", "803 123" or "+234803…" all match.
  if (digits.length >= 3 && doc.customer.phone) {
    const phone = formatNgPhone(doc.customer.phone).replace(/\D/g, "");
    const local = digits.startsWith("234") ? `0${digits.slice(3)}` : digits;
    if (phone.includes(local) || phone.includes(digits)) return true;
  }
  return false;
}

export function filterDocuments(docs: DocumentRecord[], filter: HistoryFilter): DocumentRecord[] {
  return docs.filter((doc) => {
    if (filter.type !== "all" && doc.type !== filter.type) return false;
    if (filter.status === "owing" && !isOwing(doc)) return false;
    if (filter.status !== "all" && filter.status !== "owing" && doc.status !== filter.status) return false;
    return matchesQuery(doc, filter.query);
  });
}

/** "2026-10" → "October 2026" */
export function monthLabel(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
