/**
 * The InCeipt Assistant's tools: what the AI can ask the app to do.
 * Shared by the server (sent to Claude) and the phone (inputs are checked here before anything runs).
 * Amounts are in naira for the model; the app converts to kobo.
 */
import { MAX_KOBO } from "../money";
import type { DocType, PaymentMethod, QuoteStatus } from "../types";

export interface AgentToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
}

const METHOD = { type: "string", enum: ["transfer", "cash", "pos"], description: "How the customer paid." };

export const AGENT_TOOLS: AgentToolDef[] = [
  {
    name: "find_documents",
    description:
      "Search the business's receipts, invoices and quotes. Use it to look up a document number before acting on it, to see who owes money, or to answer questions about past sales. Returns up to 20 matches, newest first.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["receipt", "invoice", "quote", "any"] },
        status: { type: "string", enum: ["owing", "paid", "any"], description: "owing = unpaid or part paid." },
        customer: { type: "string", description: "Part of the customer's name or phone number." },
        number: { type: "string", description: "Document number, e.g. INV-0004." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "business_summary",
    description:
      "Money received, expenses (by category), profit and money owed by customers for a period. Use it for questions like 'how much did I make this week?'.",
    input_schema: {
      type: "object",
      properties: { period: { type: "string", enum: ["today", "week", "month", "year"] } },
      required: ["period"],
      additionalProperties: false,
    },
  },
  {
    name: "create_document",
    description:
      "Create a receipt (customer has paid), an invoice (customer will pay later) or a quote/proforma (a price offer). The user is shown a summary and must confirm before it is saved.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["receipt", "invoice", "quote"] },
        customer_name: { type: "string", description: "Customer's name. Empty string if not given." },
        customer_phone: { type: "string", description: "Nigerian mobile number, e.g. 08031234567." },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number", description: "Up to 2 decimal places." },
              unit_price_naira: { type: "number", description: "Price of ONE unit in naira." },
            },
            required: ["description", "quantity", "unit_price_naira"],
            additionalProperties: false,
          },
        },
        payment_status: {
          type: "string",
          enum: ["paid", "unpaid", "part"],
          description: "Receipts are usually paid; invoices unpaid or part. Ignored for quotes.",
        },
        amount_paid_naira: { type: "number", description: "Only for part payment: how much was paid now." },
        method: METHOD,
        vat: { type: "boolean", description: "Add 7.5% VAT. Only if the user asks." },
        discount_naira: { type: "number" },
        delivery_naira: { type: "number" },
        due_in_days: { type: "integer", description: "Invoices: days until due (default 7). Quotes: days valid (default 14)." },
        notes: { type: "string" },
        quote_title: { type: "string", enum: ["quotation", "proforma"] },
      },
      required: ["type", "customer_name", "items", "payment_status"],
      additionalProperties: false,
    },
  },
  {
    name: "record_payment",
    description: "Record money received against an unpaid or part-paid invoice/receipt. Needs confirmation.",
    input_schema: {
      type: "object",
      properties: { document_number: { type: "string" }, amount_naira: { type: "number" }, method: METHOD },
      required: ["document_number", "amount_naira", "method"],
      additionalProperties: false,
    },
  },
  {
    name: "mark_invoice_paid",
    description: "Mark an invoice as fully paid and create its receipt. Needs confirmation.",
    input_schema: {
      type: "object",
      properties: { invoice_number: { type: "string" }, method: METHOD },
      required: ["invoice_number", "method"],
      additionalProperties: false,
    },
  },
  {
    name: "log_expense",
    description: "Log money the business spent. Needs confirmation.",
    input_schema: {
      type: "object",
      properties: {
        amount_naira: { type: "number" },
        category: { type: "string", description: "Use an existing category when one fits: Stock, Transport, Fuel, Rent, Salaries, Utilities, Other." },
        note: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
      },
      required: ["amount_naira", "category"],
      additionalProperties: false,
    },
  },
  {
    name: "convert_quote",
    description: "Turn a quote into an invoice. Needs confirmation.",
    input_schema: {
      type: "object",
      properties: { quote_number: { type: "string" } },
      required: ["quote_number"],
      additionalProperties: false,
    },
  },
  {
    name: "set_quote_status",
    description: "Mark a quote as sent, accepted or declined. Needs confirmation.",
    input_schema: {
      type: "object",
      properties: { quote_number: { type: "string" }, status: { type: "string", enum: ["draft", "sent", "accepted", "declined"] } },
      required: ["quote_number", "status"],
      additionalProperties: false,
    },
  },
  {
    name: "tax_estimate",
    description:
      "Estimated income tax and VAT for a year under the Nigeria Tax Act 2025, from the business's records and its tax settings. Owner only.",
    input_schema: {
      type: "object",
      properties: { year: { type: "integer" } },
      required: ["year"],
      additionalProperties: false,
    },
  },
];

/** Tools that change records: the user confirms each one first. */
export const WRITE_TOOLS = new Set(["create_document", "record_payment", "mark_invoice_paid", "log_expense", "convert_quote", "set_quote_status"]);

/* ---------- Input checks (the phone never trusts the model's input blindly) ---------- */

export class ToolInputError extends Error {}

type Obj = Record<string, unknown>;

function obj(input: unknown): Obj {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ToolInputError("Input must be an object.");
  return input as Obj;
}
function str(o: Obj, key: string, required: true, max?: number): string;
function str(o: Obj, key: string, required?: false, max?: number): string | undefined;
function str(o: Obj, key: string, required = false, max = 300): string | undefined {
  const v = o[key];
  if (v === undefined || v === null) {
    if (required) throw new ToolInputError(`${key} is required.`);
    return undefined;
  }
  if (typeof v !== "string") throw new ToolInputError(`${key} must be text.`);
  if (v.length > max) throw new ToolInputError(`${key} is too long.`);
  return v.trim();
}
function oneOf<T extends string>(o: Obj, key: string, values: readonly T[], required: true): T;
function oneOf<T extends string>(o: Obj, key: string, values: readonly T[], required?: false): T | undefined;
function oneOf<T extends string>(o: Obj, key: string, values: readonly T[], required = false): T | undefined {
  const v = str(o, key, required as false);
  if (v === undefined) return undefined;
  if (!(values as readonly string[]).includes(v)) throw new ToolInputError(`${key} must be one of ${values.join(", ")}.`);
  return v as T;
}

/** Naira → kobo. Rejects negatives, more than 2 decimals' worth of rounding, and absurd amounts. */
export function nairaToKobo(value: unknown, key: string, { allowZero = false } = {}): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ToolInputError(`${key} must be a number.`);
  const kobo = Math.round(value * 100);
  if (kobo < 0 || (!allowZero && kobo === 0)) throw new ToolInputError(`${key} must be more than 0.`);
  if (kobo > MAX_KOBO) throw new ToolInputError(`${key} is too large.`);
  return kobo;
}
function optKobo(o: Obj, key: string): number | undefined {
  return o[key] === undefined || o[key] === null ? undefined : nairaToKobo(o[key], key, { allowZero: true });
}

const METHODS = ["transfer", "cash", "pos"] as const satisfies readonly PaymentMethod[];

export interface FindInput {
  type?: DocType | "any";
  status?: "owing" | "paid" | "any";
  customer?: string;
  number?: string;
}
export interface CreateInput {
  type: DocType;
  customerName: string;
  customerPhone?: string;
  items: { description: string; quantity: number; unitPriceKobo: number }[];
  paymentStatus: "paid" | "unpaid" | "part";
  amountPaidKobo?: number;
  method?: PaymentMethod;
  vat: boolean;
  discountKobo?: number;
  deliveryKobo?: number;
  dueInDays?: number;
  notes?: string;
  quoteTitle?: "quotation" | "proforma";
}

export type ParsedTool =
  | { name: "find_documents"; input: FindInput }
  | { name: "business_summary"; input: { period: "today" | "week" | "month" | "year" } }
  | { name: "create_document"; input: CreateInput }
  | { name: "record_payment"; input: { number: string; amountKobo: number; method: PaymentMethod } }
  | { name: "mark_invoice_paid"; input: { number: string; method: PaymentMethod } }
  | { name: "log_expense"; input: { amountKobo: number; category: string; note: string; date?: string } }
  | { name: "convert_quote"; input: { number: string } }
  | { name: "set_quote_status"; input: { number: string; status: QuoteStatus } }
  | { name: "tax_estimate"; input: { year: number } };

/** Check a tool call's input and turn it into app values. Throws ToolInputError with a reason the model can fix. */
export function parseToolCall(name: string, raw: unknown): ParsedTool {
  const o = obj(raw);
  switch (name) {
    case "find_documents":
      return {
        name,
        input: {
          type: oneOf(o, "type", ["receipt", "invoice", "quote", "any"] as const),
          status: oneOf(o, "status", ["owing", "paid", "any"] as const),
          customer: str(o, "customer", false, 100),
          number: str(o, "number", false, 30),
        },
      };
    case "business_summary":
      return { name, input: { period: oneOf(o, "period", ["today", "week", "month", "year"] as const, true) } };
    case "create_document": {
      const itemsRaw = o.items;
      if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) throw new ToolInputError("items needs at least one item.");
      if (itemsRaw.length > 50) throw new ToolInputError("Too many items (50 max).");
      const items = itemsRaw.map((it, i) => {
        const io = obj(it);
        const description = str(io, "description", true, 200);
        if (!description) throw new ToolInputError(`items[${i}].description is empty.`);
        const q = io.quantity;
        if (typeof q !== "number" || !Number.isFinite(q) || q <= 0 || q > 1_000_000) throw new ToolInputError(`items[${i}].quantity must be more than 0.`);
        return { description, quantity: Math.round(q * 100) / 100, unitPriceKobo: nairaToKobo(io.unit_price_naira, `items[${i}].unit_price_naira`, { allowZero: true }) };
      });
      const due = o.due_in_days;
      if (due !== undefined && due !== null && (typeof due !== "number" || !Number.isInteger(due) || due < 0 || due > 365))
        throw new ToolInputError("due_in_days must be a whole number from 0 to 365.");
      const vat = o.vat;
      if (vat !== undefined && vat !== null && typeof vat !== "boolean") throw new ToolInputError("vat must be true or false.");
      return {
        name,
        input: {
          type: oneOf(o, "type", ["receipt", "invoice", "quote"] as const, true),
          customerName: str(o, "customer_name", true, 100),
          customerPhone: str(o, "customer_phone", false, 20) || undefined,
          items,
          paymentStatus: oneOf(o, "payment_status", ["paid", "unpaid", "part"] as const, true),
          amountPaidKobo: optKobo(o, "amount_paid_naira"),
          method: oneOf(o, "method", METHODS),
          vat: vat === true,
          discountKobo: optKobo(o, "discount_naira"),
          deliveryKobo: optKobo(o, "delivery_naira"),
          dueInDays: typeof due === "number" ? due : undefined,
          notes: str(o, "notes", false, 500),
          quoteTitle: oneOf(o, "quote_title", ["quotation", "proforma"] as const),
        },
      };
    }
    case "record_payment":
      return {
        name,
        input: { number: str(o, "document_number", true, 30), amountKobo: nairaToKobo(o.amount_naira, "amount_naira"), method: oneOf(o, "method", METHODS, true) },
      };
    case "mark_invoice_paid":
      return { name, input: { number: str(o, "invoice_number", true, 30), method: oneOf(o, "method", METHODS, true) } };
    case "log_expense": {
      const date = str(o, "date", false, 10);
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ToolInputError("date must be YYYY-MM-DD.");
      const category = str(o, "category", true, 40);
      if (!category) throw new ToolInputError("category is empty.");
      return { name, input: { amountKobo: nairaToKobo(o.amount_naira, "amount_naira"), category, note: str(o, "note", false, 300) ?? "", date } };
    }
    case "convert_quote":
      return { name, input: { number: str(o, "quote_number", true, 30) } };
    case "set_quote_status":
      return { name, input: { number: str(o, "quote_number", true, 30), status: oneOf(o, "status", ["draft", "sent", "accepted", "declined"] as const, true) } };
    case "tax_estimate": {
      const year = o.year;
      if (typeof year !== "number" || !Number.isInteger(year) || year < 2000 || year > 2100) throw new ToolInputError("year must be a year like 2026.");
      return { name, input: { year } };
    }
    default:
      throw new ToolInputError(`Unknown tool ${name}.`);
  }
}
