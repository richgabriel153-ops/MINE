import { addDays } from "./dates";
import type { DocumentDraft, DocumentRecord, QuoteStatus } from "./types";

export type QuoteDisplayStatus = QuoteStatus | "expired" | "converted";

export const QUOTE_STATUS_LABEL: Record<QuoteDisplayStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  converted: "Invoiced",
};

/** How long a new quote is valid for, by default. */
export const QUOTE_VALID_DAYS = 14;

/**
 * The status to show. A quote that hasn't been accepted or declined becomes "Expired" once its
 * valid-until date has passed; a quote turned into an invoice shows "Invoiced".
 */
export function quoteStatus(doc: DocumentRecord, today: string): QuoteDisplayStatus {
  if (doc.invoiceId) return "converted";
  const s = doc.quoteStatus ?? "draft";
  if ((s === "draft" || s === "sent") && doc.dueDate && doc.dueDate < today) return "expired";
  return s;
}

/** The invoice a quote becomes: same customer, items, prices, discount, VAT and notes; dated today. */
export function invoiceFromQuote(quote: DocumentRecord, today: string, dueDays = 7): DocumentDraft {
  return {
    type: "invoice",
    issueDate: today,
    dueDate: addDays(today, dueDays),
    customer: { ...quote.customer },
    items: quote.items.map((i) => ({ ...i })),
    discount: quote.discount ? { ...quote.discount } : null,
    deliveryKobo: quote.deliveryKobo,
    vatEnabled: quote.vatEnabled,
    status: "unpaid",
    amountPaidKobo: 0,
    method: quote.method,
    notes: quote.notes,
    templateId: quote.templateId,
    sourceQuoteId: quote.id,
    sourceQuoteNumber: quote.number,
  };
}
