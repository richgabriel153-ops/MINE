import { describe, expect, it } from "vitest";
import { filterDocuments, monthLabel } from "@/lib/history-filter";
import { summarise } from "@/lib/summary";
import type { DocumentRecord } from "@/lib/types";

const N = (n: number) => n * 100;
let seq = 0;
function doc(p: Partial<DocumentRecord>): DocumentRecord {
  seq += 1;
  return {
    id: `d${seq}`,
    schemaVersion: 1,
    type: "receipt",
    number: `RCT-${String(seq).padStart(4, "0")}`,
    issueDate: "2026-10-01",
    dueDate: null,
    customer: { name: "", phone: "" },
    items: [{ id: "i", description: "Item", quantity: 1, unitPriceKobo: N(10000) }],
    discount: null,
    deliveryKobo: 0,
    vatEnabled: false,
    status: "paid",
    amountPaidKobo: 0,
    method: "cash",
    notes: "",
    templateId: "classic",
    createdAt: "",
    updatedAt: "",
    ...p,
  };
}

describe("summarise", () => {
  const today = "2026-10-01"; // Thursday; week starts Mon 28 Sept
  it("adds up money received this week and this month", () => {
    const s = summarise(
      [
        doc({ issueDate: "2026-10-01" }), // this week + month
        doc({ issueDate: "2026-09-28" }), // this week, last month
        doc({ issueDate: "2026-09-27" }), // last week, last month
        doc({ issueDate: "2026-10-01", status: "part", amountPaidKobo: N(4000) }),
      ],
      today,
    );
    expect(s.weekKobo).toBe(N(10000 + 10000 + 4000));
    expect(s.monthKobo).toBe(N(10000 + 4000));
  });
  it("totals what customers still owe", () => {
    const s = summarise(
      [
        doc({ status: "part", amountPaidKobo: N(4000) }),
        doc({ type: "invoice", status: "unpaid" }),
        doc({ status: "paid" }),
      ],
      today,
    );
    expect(s.owingKobo).toBe(N(6000 + 10000));
    expect(s.owingCount).toBe(2);
  });
  it("does not count an invoice twice once it has become a receipt", () => {
    const s = summarise(
      [doc({ type: "invoice", status: "paid", receiptId: "r1" }), doc({ id: "r1", status: "paid", sourceInvoiceId: "x" })],
      today,
    );
    expect(s.weekKobo).toBe(N(10000));
    expect(s.owingKobo).toBe(0);
  });
  it("unpaid invoices are not sales", () => {
    expect(summarise([doc({ type: "invoice", status: "unpaid" })], today).weekKobo).toBe(0);
  });
  it("ignores documents dated in the future for sales", () => {
    expect(summarise([doc({ issueDate: "2026-10-05" })], today).weekKobo).toBe(0);
  });
});

describe("filterDocuments", () => {
  const docs = [
    doc({ number: "RCT-0100", customer: { name: "Bisi Adeyemi", phone: "+2348031234567" } }),
    doc({ number: "INV-0007", type: "invoice", status: "unpaid", customer: { name: "Tunde", phone: "" } }),
    doc({ status: "part", amountPaidKobo: N(1), items: [{ id: "x", description: "Lace fabric", quantity: 1, unitPriceKobo: N(5) }] }),
  ];
  const all = { query: "", status: "all" as const, type: "all" as const };
  it("searches number, name, items and phone", () => {
    expect(filterDocuments(docs, { ...all, query: "inv-0007" })).toHaveLength(1);
    expect(filterDocuments(docs, { ...all, query: "bisi" })).toHaveLength(1);
    expect(filterDocuments(docs, { ...all, query: "lace" })).toHaveLength(1);
    expect(filterDocuments(docs, { ...all, query: "0803 123" })).toHaveLength(1);
    expect(filterDocuments(docs, { ...all, query: "+234803" })).toHaveLength(1);
    expect(filterDocuments(docs, { ...all, query: "nobody" })).toHaveLength(0);
  });
  it("filters by status and type", () => {
    expect(filterDocuments(docs, { ...all, status: "unpaid" })).toHaveLength(1);
    expect(filterDocuments(docs, { ...all, status: "owing" })).toHaveLength(2);
    expect(filterDocuments(docs, { ...all, type: "invoice" })).toHaveLength(1);
  });
});

describe("monthLabel", () => {
  it("names the month", () => expect(monthLabel("2026-10-17")).toBe("October 2026"));
});
