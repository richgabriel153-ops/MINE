import type { DocumentRecord } from "./types";

/** The customer-facing Pay Now address for an invoice. */
export function payUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/pay?t=${token}`;
}

/** Show the Pay Now link on this document? (invoice with a link and money still owed) */
export function showsPayLink(doc: DocumentRecord, balanceKobo: number): boolean {
  return doc.type === "invoice" && Boolean(doc.payToken) && balanceKobo > 0;
}

/** Shorter text version for printing on the receipt ("inceipt.app/pay?t=…"). */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}
