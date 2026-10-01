import { formatDate } from "./dates";
import { formatNaira } from "./money";
import { normaliseNgPhone, whatsappDigits } from "./phone";
import { computeTotals } from "./totals";
import type { BusinessProfile, DocumentRecord } from "./types";

const TITLES = new Set([
  "mr", "mrs", "miss", "ms", "dr", "prof", "engr", "chief", "alhaji", "alhaja", "pastor", "rev",
  "barr", "hon", "madam", "mama", "aunty", "auntie", "uncle", "oga", "sir", "lady", "prince", "princess",
]);

/** "Mrs Bisi Adeyemi" → "Mrs Bisi", "Tunde Bakare" → "Tunde", "Chief (Dr.) Okafor" → "Chief (Dr.)" */
export function greetingName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const name: string[] = [];
  for (const word of words) {
    name.push(word);
    if (!TITLES.has(word.toLowerCase().replace(/[^a-z]/g, ""))) break;
  }
  return name.join(" ");
}

/** The friendly message that goes with the image on WhatsApp. */
export function shareMessage(doc: DocumentRecord, profile: BusinessProfile): string {
  const totals = computeTotals(doc);
  const name = greetingName(doc.customer.name);
  const greeting = name ? `Hello ${name},` : "Hello,";
  const kind = doc.type === "invoice" ? "invoice" : "receipt";
  const from = profile.name ? ` from ${profile.name}` : "";
  const lines = [`${greeting} here is your ${kind} ${doc.number}${from}.`, `Total: ${formatNaira(totals.totalKobo)}`];

  if (doc.status === "part") lines.push(`Paid: ${formatNaira(totals.amountPaidKobo)}`, `Balance: ${formatNaira(totals.balanceKobo)}`);
  if (doc.type === "invoice" && doc.status !== "paid") {
    const due = doc.dueDate ? ` by ${formatDate(doc.dueDate)}` : "";
    if (doc.status === "unpaid") lines.push(`Amount due${due}: ${formatNaira(totals.balanceKobo)}`);
    if (profile.bankName && profile.accountNumber) {
      const name = profile.accountName ? ` (${profile.accountName})` : "";
      lines.push(`Pay to: ${profile.bankName} ${profile.accountNumber}${name}`);
    }
  }
  lines.push("Thank you!");
  return lines.join("\n");
}

/** WhatsApp link that opens a chat with the customer (or the contact picker) with the message typed in. */
export function whatsappLink(doc: DocumentRecord, message: string): string {
  const phone = doc.customer.phone ? normaliseNgPhone(doc.customer.phone) : null;
  const base = phone ? `https://wa.me/${whatsappDigits(phone)}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(message)}`;
}

/** "RCT-0001 Ada's Fashion House.png" → safe file name */
export function exportFileName(doc: DocumentRecord, profile: BusinessProfile, ext: string): string {
  const business = profile.name.replace(/[^\p{L}\p{N} _-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
  return `${[doc.number, business].filter(Boolean).join(" ")}.${ext}`;
}
