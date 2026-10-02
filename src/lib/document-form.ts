import { newId } from "./id";
import { addDays, lagosDate } from "./dates";
import { QUOTE_VALID_DAYS } from "./quotes";
import { computeTotals, type Totals } from "./totals";
import type { DocType, DocumentDraft, DocumentRecord, PaymentMethod, PaymentStatus, QuoteStatus, TemplateId } from "./types";

/** Form state. Amount fields are null while the box is empty. */
export interface FormItem {
  id: string;
  description: string;
  quantity: number | null;
  unitPriceKobo: number | null;
}

export interface DocumentFormState {
  type: DocType;
  issueDate: string;
  dueDate: string;
  customerName: string;
  customerPhone: string;
  items: FormItem[];
  discountType: "amount" | "percent";
  discountKobo: number | null;
  discountPercent: number | null;
  deliveryKobo: number | null;
  vatEnabled: boolean;
  status: PaymentStatus;
  amountPaidKobo: number | null;
  method: PaymentMethod;
  notes: string;
  templateId: TemplateId;
  /** Quotes only. */
  quoteTitle: "quotation" | "proforma";
  quoteStatus: QuoteStatus;
}

export const DEFAULT_DUE_DAYS = 7;

export function newItem(): FormItem {
  return { id: newId(), description: "", quantity: 1, unitPriceKobo: null };
}

export function defaultStatus(type: DocType): PaymentStatus {
  return type === "receipt" ? "paid" : "unpaid";
}

function dueDays(type: DocType): number {
  return type === "quote" ? QUOTE_VALID_DAYS : DEFAULT_DUE_DAYS;
}

export function emptyForm(type: DocType, today = lagosDate()): DocumentFormState {
  return {
    type,
    issueDate: today,
    dueDate: addDays(today, dueDays(type)),
    customerName: "",
    customerPhone: "",
    items: [newItem()],
    discountType: "amount",
    discountKobo: null,
    discountPercent: null,
    deliveryKobo: null,
    vatEnabled: false,
    status: defaultStatus(type),
    amountPaidKobo: null,
    method: "transfer",
    notes: "",
    templateId: "classic",
    quoteTitle: "quotation",
    quoteStatus: "draft",
  };
}

export function formFromRecord(doc: DocumentRecord): DocumentFormState {
  return {
    type: doc.type,
    issueDate: doc.issueDate,
    dueDate: doc.dueDate ?? addDays(doc.issueDate, dueDays(doc.type)),
    customerName: doc.customer.name,
    customerPhone: doc.customer.phone,
    items: doc.items.map((i) => ({ ...i })),
    discountType: doc.discount?.type ?? "amount",
    discountKobo: doc.discount?.type === "amount" ? doc.discount.kobo : null,
    discountPercent: doc.discount?.type === "percent" ? doc.discount.percent : null,
    deliveryKobo: doc.deliveryKobo || null,
    vatEnabled: doc.vatEnabled,
    status: doc.status,
    amountPaidKobo: doc.status === "part" ? doc.amountPaidKobo : null,
    method: doc.method,
    notes: doc.notes,
    templateId: doc.templateId,
    quoteTitle: doc.quoteTitle ?? "quotation",
    quoteStatus: doc.quoteStatus ?? "draft",
  };
}

/** A copy of an existing document as a fresh draft dated today. */
export function duplicateForm(doc: DocumentRecord, today = lagosDate()): DocumentFormState {
  const form = formFromRecord(doc);
  return {
    ...form,
    issueDate: today,
    dueDate: addDays(today, dueDays(form.type)),
    items: form.items.map((i) => ({ ...i, id: newId() })),
    quoteStatus: "draft",
  };
}

function isBlankItem(item: FormItem): boolean {
  return item.description.trim() === "" && item.unitPriceKobo === null;
}

/** Items the user actually filled in (completely empty rows are ignored). */
function filledItems(form: DocumentFormState): FormItem[] {
  return form.items.filter((i) => !isBlankItem(i));
}

export function toDraft(form: DocumentFormState): DocumentDraft {
  const discount =
    form.discountType === "amount"
      ? form.discountKobo
        ? { type: "amount" as const, kobo: form.discountKobo }
        : null
      : form.discountPercent
        ? { type: "percent" as const, percent: form.discountPercent }
        : null;
  const isQuote = form.type === "quote";
  return {
    type: form.type,
    issueDate: form.issueDate,
    dueDate: form.type === "receipt" ? null : form.dueDate,
    customer: { name: form.customerName.trim(), phone: form.customerPhone },
    items: filledItems(form).map((i) => ({
      id: i.id,
      description: i.description.trim(),
      quantity: i.quantity ?? 0,
      unitPriceKobo: i.unitPriceKobo ?? 0,
    })),
    discount,
    deliveryKobo: form.deliveryKobo ?? 0,
    vatEnabled: form.vatEnabled,
    status: isQuote ? "unpaid" : form.status,
    amountPaidKobo: !isQuote && form.status === "part" ? (form.amountPaidKobo ?? 0) : 0,
    method: form.method,
    notes: form.notes.trim(),
    templateId: form.templateId,
    ...(isQuote ? { quoteTitle: form.quoteTitle, quoteStatus: form.quoteStatus } : {}),
  };
}

export function formTotals(form: DocumentFormState): Totals {
  const draft = toDraft(form);
  return computeTotals({
    items: draft.items,
    discount: draft.discount,
    deliveryKobo: draft.deliveryKobo,
    vatEnabled: draft.vatEnabled,
    status: draft.status,
    amountPaidKobo: draft.amountPaidKobo,
  });
}

export interface FormErrors {
  items?: string;
  itemErrors?: Record<string, { description?: string; quantity?: string; price?: string }>;
  customerPhone?: string;
  discount?: string;
  amountPaid?: string;
  dueDate?: string;
  issueDate?: string;
}

export function hasErrors(errors: FormErrors): boolean {
  return Object.values(errors).some((v) => (typeof v === "object" ? Object.keys(v).length > 0 : !!v));
}

/** Plain-English checks before saving. `phoneValid` comes from the phone box. */
export function validateForm(form: DocumentFormState, phoneValid = true): FormErrors {
  const errors: FormErrors = {};
  const itemErrors: NonNullable<FormErrors["itemErrors"]> = {};

  const items = filledItems(form);
  if (items.length === 0) errors.items = "Add at least one item with a price.";
  for (const item of items) {
    const e: { description?: string; quantity?: string; price?: string } = {};
    if (item.description.trim() === "") e.description = "What did you sell?";
    if (item.quantity === null || item.quantity <= 0) e.quantity = "Enter a quantity";
    if (item.unitPriceKobo === null) e.price = "Enter a price";
    if (Object.keys(e).length) itemErrors[item.id] = e;
  }
  if (Object.keys(itemErrors).length) errors.itemErrors = itemErrors;

  if (!phoneValid) errors.customerPhone = "Enter a Nigerian mobile number, e.g. 0803 123 4567, or leave it empty.";

  if (form.discountType === "percent" && form.discountPercent !== null && form.discountPercent > 100)
    errors.discount = "A discount can't be more than 100%.";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.issueDate)) errors.issueDate = "Choose a date.";

  if (form.status === "part") {
    const totals = formTotals(form);
    const paid = form.amountPaidKobo ?? 0;
    if (paid <= 0) errors.amountPaid = "How much did the customer pay?";
    else if (paid >= totals.totalKobo)
      errors.amountPaid = "That covers the full amount. Choose “Paid” instead.";
  }

  if (form.type === "invoice") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)) errors.dueDate = "Choose a due date.";
    else if (form.dueDate < form.issueDate) errors.dueDate = "The due date can't be before the invoice date.";
  }
  if (form.type === "quote") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)) errors.dueDate = "Choose a valid-until date.";
    else if (form.dueDate < form.issueDate) errors.dueDate = "The valid-until date can't be before the quote date.";
  }

  return errors;
}

/** Parse a quantity box: up to 2 decimal places. */
export function parseQuantity(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 && value <= 1_000_000 ? value : null;
}

export const NOTE_SUGGESTIONS = [
  "Thank you for your patronage!",
  "No refund after 3 days.",
  "Goods sold in good condition cannot be returned.",
  "Please send proof of payment on WhatsApp.",
] as const;
