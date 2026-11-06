/** Runs the assistant's tool calls on this phone, through the same data functions the screens use. */
import { lagosDate } from "../dates";
import {
  convertQuote,
  createDocument,
  listDocuments,
  listExpenses,
  listSales,
  markInvoicePaid,
  recordPayment,
  saveExpense,
  getExpenseCategories,
  setQuoteStatus,
} from "../db";
import { allCategories } from "../expenses";
import { formatNaira } from "../money";
import type { Permissions, Role } from "../permissions";
import { byCategory, profitFor, rangeFor, type Range } from "../profit";
import { owingKobo } from "../summary";
import { computeTax, outputVatFromDocuments } from "../tax";
import { loadTaxProfile } from "../tax-profile";
import { computeTotals } from "../totals";
import type { DocumentRecord } from "../types";
import { docBrief, draftFromCreate, findByNumber } from "./actions";
import { ToolInputError, type ParsedTool } from "./tools";

export interface RunContext {
  role: Role;
  can: Permissions;
}

export interface RunResult {
  /** What the model sees (kept short). */
  content: string;
  isError?: boolean;
  /** A button to show under the chat, e.g. "Open RCT-0004". */
  link?: { href: string; label: string };
}

const out = (value: unknown): string => JSON.stringify(value);

function denied(reason: string): RunResult {
  return { content: out({ error: reason }), isError: true };
}

async function mustFind(number: string, kind?: DocumentRecord["type"]): Promise<DocumentRecord> {
  const doc = findByNumber(await listDocuments(), number);
  if (!doc) throw new ToolInputError(`No document numbered ${number}. Use find_documents to look it up.`);
  if (kind && doc.type !== kind) throw new ToolInputError(`${doc.number} is a ${doc.type}, not a ${kind}.`);
  return doc;
}

function yearRange(today: string): Range {
  return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
}

export async function runTool(call: ParsedTool, ctx: RunContext): Promise<RunResult> {
  const today = lagosDate();
  try {
    switch (call.name) {
      case "find_documents": {
        const { type, status, customer, number } = call.input;
        const q = customer?.toLowerCase().replace(/\s+/g, "");
        let docs = await listDocuments();
        if (number) docs = docs.filter((d) => d === findByNumber([d], number));
        if (type && type !== "any") docs = docs.filter((d) => d.type === type);
        if (status === "owing") docs = docs.filter((d) => owingKobo(d) > 0);
        if (status === "paid") docs = docs.filter((d) => d.type !== "quote" && (d.status === "paid" || Boolean(d.receiptId)));
        if (q) docs = docs.filter((d) => `${d.customer.name}${d.customer.phone}`.toLowerCase().replace(/\s+/g, "").includes(q));
        docs.sort((a, b) => (b.issueDate + b.createdAt).localeCompare(a.issueDate + a.createdAt));
        return { content: out({ count: docs.length, documents: docs.slice(0, 20).map(docBrief) }) };
      }

      case "business_summary": {
        if (!ctx.can.viewRevenue) return denied("Only the business owner can see sales totals.");
        const range = call.input.period === "year" ? yearRange(today) : rangeFor(call.input.period, today);
        const [sales, docs] = await Promise.all([listSales(), listDocuments()]);
        const expenses = ctx.can.expenses ? await listExpenses() : [];
        const amounts = expenses.map((e) => ({ date: e.date, amountKobo: e.amountKobo, category: e.category }));
        const p = profitFor(sales, amounts, range);
        const owing = docs.filter((d) => owingKobo(d) > 0);
        return {
          content: out({
            period: call.input.period,
            from: range.from,
            to: range.to,
            money_received: formatNaira(p.salesKobo),
            expenses: ctx.can.expenses ? formatNaira(p.expensesKobo) : "not available",
            profit: ctx.can.expenses ? formatNaira(p.profitKobo) : "not available",
            expenses_by_category: byCategory(amounts, range).map((c) => ({ category: c.category, amount: formatNaira(c.amountKobo) })),
            customers_owing: owing.length,
            total_owed_to_business: formatNaira(owing.reduce((s, d) => s + owingKobo(d), 0)),
          }),
        };
      }

      case "create_document": {
        if (call.input.type === "quote" && !ctx.can.quotes) return denied("Quotes need InCeipt Pro.");
        if (call.input.paymentStatus === "part" && call.input.type !== "quote" && !ctx.can.trackDebts) return denied("Part payments need InCeipt Pro.");
        const doc = await createDocument(draftFromCreate(call.input, today));
        return {
          content: out({ created: doc.number, total: formatNaira(computeTotals(doc).totalKobo) }),
          link: { href: `/view?id=${encodeURIComponent(doc.id)}`, label: `Open ${doc.number}` },
        };
      }

      case "record_payment": {
        if (!ctx.can.trackDebts) return denied("Recording payments needs InCeipt Pro.");
        const doc = await mustFind(call.input.number);
        if (doc.type === "quote") throw new ToolInputError("Quotes can't take payments. Convert it to an invoice first.");
        const balance = computeTotals(doc).balanceKobo;
        if (balance <= 0) throw new ToolInputError(`${doc.number} is already fully paid.`);
        if (call.input.amountKobo > balance) throw new ToolInputError(`That's more than the ${formatNaira(balance)} still owed on ${doc.number}.`);
        const updated = await recordPayment(doc.id, call.input.amountKobo, call.input.method, today);
        return {
          content: out({ updated: updated.number, still_owed: formatNaira(computeTotals(updated).balanceKobo) }),
          link: { href: `/view?id=${encodeURIComponent(updated.id)}`, label: `Open ${updated.number}` },
        };
      }

      case "mark_invoice_paid": {
        const doc = await mustFind(call.input.number, "invoice");
        if (doc.receiptId) throw new ToolInputError(`${doc.number} has already been marked as paid.`);
        const receipt = await markInvoicePaid(doc.id, call.input.method, today);
        return {
          content: out({ invoice: doc.number, receipt: receipt.number }),
          link: { href: `/view?id=${encodeURIComponent(receipt.id)}`, label: `Open ${receipt.number}` },
        };
      }

      case "log_expense": {
        if (!ctx.can.expenses) return denied(ctx.role === "owner" ? "Expenses need InCeipt Pro." : "Only the business owner can log expenses.");
        const known = allCategories(await getExpenseCategories());
        const category = known.find((c) => c.toLowerCase() === call.input.category.toLowerCase()) ?? "Other";
        const note = category === "Other" && category.toLowerCase() !== call.input.category.toLowerCase()
          ? [call.input.category, call.input.note].filter(Boolean).join(": ")
          : call.input.note;
        const date = call.input.date && call.input.date <= today ? call.input.date : today;
        await saveExpense(null, { amountKobo: call.input.amountKobo, category, date, note: note.slice(0, 300) });
        return { content: out({ logged: formatNaira(call.input.amountKobo), category, date }), link: { href: "/expenses", label: "See expenses" } };
      }

      case "convert_quote": {
        if (!ctx.can.quotes) return denied("Quotes need InCeipt Pro.");
        const quote = await mustFind(call.input.number, "quote");
        if (quote.invoiceId) throw new ToolInputError(`${quote.number} was already turned into ${quote.invoiceNumber}.`);
        const invoice = await convertQuote(quote.id, today);
        return {
          content: out({ quote: quote.number, invoice: invoice.number }),
          link: { href: `/view?id=${encodeURIComponent(invoice.id)}`, label: `Open ${invoice.number}` },
        };
      }

      case "set_quote_status": {
        if (!ctx.can.quotes) return denied("Quotes need InCeipt Pro.");
        const quote = await mustFind(call.input.number, "quote");
        await setQuoteStatus(quote.id, call.input.status);
        return { content: out({ quote: quote.number, status: call.input.status }) };
      }

      case "tax_estimate": {
        if (!ctx.can.taxes) return denied("Only the business owner can see tax estimates.");
        const [sales, expenses, docs] = await Promise.all([listSales(), listExpenses(), listDocuments()]);
        const profile = loadTaxProfile();
        const r = computeTax(profile, {
          year: call.input.year,
          sales,
          expenses: expenses.map((e) => ({ date: e.date, amountKobo: e.amountKobo, category: e.category })),
          outputVat: outputVatFromDocuments(docs),
        });
        return {
          content: out({
            year: r.year,
            business_type: r.kind === "company" ? "company (CIT)" : "sole trader (personal income tax)",
            turnover: formatNaira(r.turnoverKobo),
            expenses: formatNaira(r.expensesKobo),
            profit: formatNaira(r.profitKobo),
            small_business: r.small,
            estimated_tax: formatNaira(r.totalTaxKobo),
            company: r.company && { cit: formatNaira(r.company.citKobo), development_levy: formatNaira(r.company.levyKobo) },
            vat_must_charge: r.vat.mustCharge,
            vat_charged: formatNaira(r.outputVatKobo),
            deadlines: r.deadlines,
            notes: r.notes,
            note: "Estimate only, not professional tax advice. Settings can be changed on the Tax page.",
          }),
          link: { href: "/tax", label: "Open Tax" },
        };
      }
    }
  } catch (e) {
    if (e instanceof ToolInputError) return { content: out({ error: e.message }), isError: true };
    return { content: out({ error: e instanceof Error ? e.message : "Something went wrong." }), isError: true };
  }
}
