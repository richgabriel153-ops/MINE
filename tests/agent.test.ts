import { describe, expect, it } from "vitest";
import { describeAction, docBrief, draftFromCreate, findByNumber } from "@/lib/agent/actions";
import { AGENT_TOOLS, parseToolCall, ToolInputError, WRITE_TOOLS } from "@/lib/agent/tools";
import { computeTotals } from "@/lib/totals";
import type { DocumentRecord } from "@/lib/types";

const today = "2026-10-01";

describe("tool definitions", () => {
  it("are valid strict schemas", () => {
    for (const t of AGENT_TOOLS) {
      expect(t.input_schema.additionalProperties).toBe(false);
      for (const r of t.input_schema.required) expect(Object.keys(t.input_schema.properties)).toContain(r);
    }
    const optional = AGENT_TOOLS.reduce((n, t) => n + Object.keys(t.input_schema.properties).length - t.input_schema.required.length, 0);
    expect(optional).toBeLessThanOrEqual(24); // strict mode limit on optional parameters
    for (const w of WRITE_TOOLS) expect(AGENT_TOOLS.map((t) => t.name)).toContain(w);
  });
});

describe("parseToolCall", () => {
  it("converts naira to kobo and checks inputs", () => {
    const p = parseToolCall("create_document", {
      type: "receipt",
      customer_name: "Ada",
      items: [{ description: "Bag of rice", quantity: 2, unit_price_naira: 45000 }],
      payment_status: "paid",
    });
    expect(p.name).toBe("create_document");
    if (p.name !== "create_document") return;
    expect(p.input.items[0].unitPriceKobo).toBe(4_500_000);
    expect(p.input.vat).toBe(false);
  });

  it("rejects bad input with a reason", () => {
    expect(() => parseToolCall("create_document", { type: "receipt", customer_name: "", items: [], payment_status: "paid" })).toThrow(ToolInputError);
    expect(() => parseToolCall("record_payment", { document_number: "INV-1", amount_naira: -5, method: "cash" })).toThrow(/more than 0/);
    expect(() => parseToolCall("record_payment", { document_number: "INV-1", amount_naira: 5, method: "bitcoin" })).toThrow(/one of/);
    expect(() => parseToolCall("log_expense", { amount_naira: 5000, category: "Fuel", date: "01/10/2026" })).toThrow(/YYYY-MM-DD/);
    expect(() => parseToolCall("delete_everything", {})).toThrow(/Unknown tool/);
    expect(() => parseToolCall("tax_estimate", "2026")).toThrow(ToolInputError);
  });
});

describe("drafts and confirmation summaries", () => {
  const create = (extra: Record<string, unknown> = {}) => {
    const p = parseToolCall("create_document", {
      type: "invoice",
      customer_name: "Tunde",
      customer_phone: "0803 123 4567",
      items: [{ description: "Carton of indomie", quantity: 3, unit_price_naira: 9500 }],
      payment_status: "part",
      amount_paid_naira: 10000,
      due_in_days: 14,
      ...extra,
    });
    if (p.name !== "create_document") throw new Error();
    return p;
  };

  it("builds the same draft the form would", () => {
    const d = draftFromCreate(create().input, today);
    expect(d.customer.phone).toBe("+2348031234567");
    expect(d.dueDate).toBe("2026-10-15");
    expect(d.status).toBe("part");
    expect(computeTotals(d)).toMatchObject({ totalKobo: 2_850_000, amountPaidKobo: 1_000_000, balanceKobo: 1_850_000 });
  });

  it("uses the form's own error messages", () => {
    expect(() => draftFromCreate(create({ customer_phone: "12345" }).input, today)).toThrow(/Nigerian mobile number/);
    expect(() => draftFromCreate(create({ amount_paid_naira: 50000 }).input, today)).toThrow(/covers the full amount/);
  });

  it("describes what will happen", () => {
    const s = describeAction(create(), today, []);
    expect(s.title).toBe("New invoice for Tunde, 0803 123 4567");
    expect(s.lines).toEqual(["3 × Carton of indomie @ ₦9,500", "Total ₦28,500", "Paid ₦10,000, owes ₦18,500", "Due 15/10/2026"]);
  });
});

describe("findByNumber", () => {
  const docs = [{ number: "INV-0004" }, { number: "RCT-0012" }] as DocumentRecord[];
  it("accepts the ways people type numbers", () => {
    expect(findByNumber(docs, "inv-4")?.number).toBe("INV-0004");
    expect(findByNumber(docs, "INV 0004")?.number).toBe("INV-0004");
    expect(findByNumber(docs, "rct12")?.number).toBe("RCT-0012");
    expect(findByNumber(docs, "QUO-0001")).toBeUndefined();
  });

  it("briefs documents for the model", () => {
    const p = parseToolCall("create_document", {
      type: "receipt", customer_name: "Ada", items: [{ description: "Rice", quantity: 2, unit_price_naira: 45000 }], payment_status: "paid",
    });
    if (p.name !== "create_document") throw new Error();
    const draft = draftFromCreate(p.input, today);
    const b = docBrief({ ...draft, id: "x", number: "RCT-0001", schemaVersion: 1, createdAt: "", updatedAt: "" });
    expect(b).toMatchObject({ number: "RCT-0001", total_naira: 90000, paid_naira: 90000, owing_naira: 0, status: "paid" });
  });
});
