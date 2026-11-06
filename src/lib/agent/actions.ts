/** Pure helpers for the assistant: building drafts, describing actions for confirmation, finding documents. */
import { addDays } from "../dates";
import { emptyForm, hasErrors, toDraft, validateForm, type FormErrors } from "../document-form";
import { formatNaira } from "../money";
import { newId } from "../id";
import { formatNgPhone, normaliseNgPhone } from "../phone";
import { computeTotals } from "../totals";
import type { DocumentDraft, DocumentRecord } from "../types";
import { ToolInputError, type CreateInput, type ParsedTool } from "./tools";

const DOC_LABEL = { receipt: "Receipt", invoice: "Invoice", quote: "Quote" } as const;
const METHOD_LABEL = { transfer: "bank transfer", cash: "cash", pos: "POS" } as const;

function firstError(errors: FormErrors): string {
  if (errors.items) return errors.items;
  if (errors.itemErrors) {
    const e = Object.values(errors.itemErrors)[0];
    return e.description ?? e.quantity ?? e.price ?? "An item is incomplete.";
  }
  return errors.customerPhone ?? errors.discount ?? errors.amountPaid ?? errors.dueDate ?? errors.issueDate ?? "Something is missing.";
}

/** The draft the app would save for a create_document call. Throws ToolInputError with the form's own message. */
export function draftFromCreate(input: CreateInput, today: string): DocumentDraft {
  const form = emptyForm(input.type, today);
  let phone = "";
  let phoneValid = true;
  if (input.customerPhone) {
    const n = normaliseNgPhone(input.customerPhone);
    if (n) phone = n;
    else phoneValid = false;
  }
  const status = input.type === "quote" ? "unpaid" : input.paymentStatus;
  form.customerName = input.customerName;
  form.customerPhone = phone;
  form.items = input.items.map((i) => ({ id: newId(), description: i.description, quantity: i.quantity, unitPriceKobo: i.unitPriceKobo }));
  form.vatEnabled = input.vat;
  form.discountType = "amount";
  form.discountKobo = input.discountKobo || null;
  form.deliveryKobo = input.deliveryKobo || null;
  form.status = status;
  form.amountPaidKobo = status === "part" ? (input.amountPaidKobo ?? null) : null;
  form.method = input.method ?? "transfer";
  form.notes = input.notes ?? "";
  if (input.dueInDays !== undefined && input.type !== "receipt") form.dueDate = addDays(today, input.dueInDays);
  if (input.quoteTitle) form.quoteTitle = input.quoteTitle;
  const errors = validateForm(form, phoneValid);
  if (hasErrors(errors)) throw new ToolInputError(firstError(errors));
  return toDraft(form);
}

export interface ActionSummary {
  title: string;
  lines: string[];
}

/** What the user is asked to confirm. `docs` resolves document numbers to show amounts. */
export function describeAction(call: ParsedTool, today: string, docs: DocumentRecord[]): ActionSummary {
  switch (call.name) {
    case "create_document": {
      const draft = draftFromCreate(call.input, today);
      const totals = computeTotals(draft);
      const lines = draft.items.map((i) => `${i.quantity} × ${i.description} @ ${formatNaira(i.unitPriceKobo)}`);
      if (totals.discountKobo) lines.push(`Discount −${formatNaira(totals.discountKobo)}`);
      if (totals.vatKobo) lines.push(`VAT 7.5% ${formatNaira(totals.vatKobo)}`);
      if (totals.deliveryKobo) lines.push(`Delivery ${formatNaira(totals.deliveryKobo)}`);
      lines.push(`Total ${formatNaira(totals.totalKobo)}`);
      if (draft.type !== "quote") {
        if (draft.status === "paid") lines.push(`Paid by ${METHOD_LABEL[draft.method]}`);
        else if (draft.status === "part") lines.push(`Paid ${formatNaira(totals.amountPaidKobo)}, owes ${formatNaira(totals.balanceKobo)}`);
        else lines.push("Not paid yet");
      }
      if (draft.dueDate && draft.type !== "receipt") lines.push(`${draft.type === "quote" ? "Valid until" : "Due"} ${draft.dueDate.split("-").reverse().join("/")}`);
      const who = [draft.customer.name, draft.customer.phone ? formatNgPhone(draft.customer.phone) : ""].filter(Boolean).join(", ");
      return { title: `New ${DOC_LABEL[draft.type].toLowerCase()}${who ? ` for ${who}` : ""}`, lines };
    }
    case "record_payment": {
      const doc = findByNumber(docs, call.input.number);
      return {
        title: `Record ${formatNaira(call.input.amountKobo)} paid on ${doc?.number ?? call.input.number}`,
        lines: doc ? [`${doc.customer.name || "Customer"} · balance now ${formatNaira(computeTotals(doc).balanceKobo)}`, `By ${METHOD_LABEL[call.input.method]}`] : [],
      };
    }
    case "mark_invoice_paid": {
      const doc = findByNumber(docs, call.input.number);
      return {
        title: `Mark ${doc?.number ?? call.input.number} as paid`,
        lines: doc ? [`${doc.customer.name || "Customer"} · ${formatNaira(computeTotals(doc).balanceKobo)} by ${METHOD_LABEL[call.input.method]}`, "A receipt will be created."] : [],
      };
    }
    case "log_expense":
      return {
        title: `Log expense of ${formatNaira(call.input.amountKobo)}`,
        lines: [call.input.category, call.input.note, call.input.date ? `On ${call.input.date.split("-").reverse().join("/")}` : "Today"].filter(Boolean),
      };
    case "convert_quote":
      return { title: `Turn ${call.input.number} into an invoice`, lines: [] };
    case "set_quote_status":
      return { title: `Mark ${call.input.number} as ${call.input.status}`, lines: [] };
    default:
      return { title: call.name, lines: [] };
  }
}

/** "inv-4", "INV 0004", "INV-0004" all find INV-0004. */
export function findByNumber(docs: DocumentRecord[], number: string): DocumentRecord | undefined {
  const norm = (s: string) => {
    const m = /^([A-Za-z]+)[\s-]*0*(\d+)$/.exec(s.trim());
    return m ? `${m[1].toUpperCase()}-${Number(m[2])}` : s.trim().toUpperCase();
  };
  const want = norm(number);
  return docs.find((d) => norm(d.number) === want);
}

/** Short version of a document for the model (no internal ids beyond what's needed). */
export function docBrief(d: DocumentRecord) {
  const t = computeTotals(d);
  return {
    number: d.number,
    type: d.type,
    date: d.issueDate,
    due: d.dueDate,
    customer: d.customer.name,
    phone: d.customer.phone ? formatNgPhone(d.customer.phone) : "",
    items: d.items.map((i) => `${i.quantity} × ${i.description} @ ₦${i.unitPriceKobo / 100}`).join("; "),
    total_naira: t.totalKobo / 100,
    paid_naira: d.type === "quote" ? 0 : t.amountPaidKobo / 100,
    owing_naira: d.type === "quote" || (d.type === "invoice" && d.receiptId) ? 0 : t.balanceKobo / 100,
    status: d.type === "quote" ? (d.invoiceNumber ? `converted to ${d.invoiceNumber}` : (d.quoteStatus ?? "draft")) : d.receiptId ? `paid (receipt made)` : d.status,
  };
}
