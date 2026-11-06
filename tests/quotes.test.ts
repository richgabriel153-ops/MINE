import { describe, expect, it } from "vitest";
import { emptyForm, toDraft, validateForm } from "@/lib/document-form";
import { invoiceFromQuote, quoteStatus } from "@/lib/quotes";
import { computeTotals } from "@/lib/totals";
import type { DocumentRecord } from "@/lib/types";

const quote: DocumentRecord = {
  id: "q1", schemaVersion: 1, type: "quote", number: "QUO-0003", issueDate: "2026-10-01", dueDate: "2026-10-15",
  customer: { name: "Tunde Logistics", phone: "+2348031234567" },
  items: [{ id: "a", description: "Delivery bags", quantity: 10, unitPriceKobo: 120_000 }],
  discount: { type: "percent", percent: 10 }, deliveryKobo: 250_000, vatEnabled: true, status: "unpaid",
  amountPaidKobo: 0, method: "transfer", notes: "Prices valid for 2 weeks", templateId: "modern",
  createdAt: "", updatedAt: "", quoteTitle: "quotation", quoteStatus: "sent",
};

describe("quoteStatus", () => {
  it("expires after the valid-until date unless accepted or declined", () => {
    expect(quoteStatus(quote, "2026-10-15")).toBe("sent");
    expect(quoteStatus(quote, "2026-10-16")).toBe("expired");
    expect(quoteStatus({ ...quote, quoteStatus: "accepted" }, "2026-12-01")).toBe("accepted");
    expect(quoteStatus({ ...quote, quoteStatus: "declined" }, "2026-12-01")).toBe("declined");
    expect(quoteStatus({ ...quote, quoteStatus: undefined }, "2026-10-02")).toBe("draft");
  });
  it("shows Invoiced once converted", () => {
    expect(quoteStatus({ ...quote, invoiceId: "i1" }, "2026-12-01")).toBe("converted");
  });
});

describe("invoiceFromQuote", () => {
  it("copies everything that affects the price, dated today and linked back", () => {
    const inv = invoiceFromQuote(quote, "2026-10-05");
    expect(inv).toMatchObject({ type: "invoice", issueDate: "2026-10-05", dueDate: "2026-10-12", status: "unpaid", sourceQuoteId: "q1", sourceQuoteNumber: "QUO-0003", notes: "Prices valid for 2 weeks" });
    expect(computeTotals(inv).totalKobo).toBe(computeTotals(quote).totalKobo);
    expect(inv.items).not.toBe(quote.items); // a copy
  });
});

describe("quote form", () => {
  it("defaults: valid for 14 days, no payment", () => {
    const f = emptyForm("quote", "2026-10-01");
    expect(f.dueDate).toBe("2026-10-15");
    const d = toDraft({ ...f, items: [{ id: "x", description: "Bags", quantity: 1, unitPriceKobo: 100 }] });
    expect(d).toMatchObject({ type: "quote", status: "unpaid", amountPaidKobo: 0, dueDate: "2026-10-15", quoteTitle: "quotation", quoteStatus: "draft" });
  });
  it("valid-until can't be before the quote date", () => {
    const f = { ...emptyForm("quote", "2026-10-01"), dueDate: "2026-09-30", items: [{ id: "x", description: "Bags", quantity: 1, unitPriceKobo: 100 }] };
    expect(validateForm(f).dueDate).toMatch(/valid-until/i);
  });
});
