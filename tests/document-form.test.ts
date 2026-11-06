import { describe, expect, it } from "vitest";
import { emptyForm, hasErrors, parseQuantity, toDraft, validateForm, type DocumentFormState } from "@/lib/document-form";

const N = (naira: number) => naira * 100;

function form(overrides: Partial<DocumentFormState> = {}): DocumentFormState {
  return {
    ...emptyForm("receipt", "2026-10-01"),
    items: [{ id: "a", description: "Ankara gown", quantity: 2, unitPriceKobo: N(15000) }],
    ...overrides,
  };
}

describe("emptyForm", () => {
  it("receipts default to Paid, invoices to Unpaid with a due date a week later", () => {
    expect(emptyForm("receipt").status).toBe("paid");
    const inv = emptyForm("invoice", "2026-10-01");
    expect(inv.status).toBe("unpaid");
    expect(inv.dueDate).toBe("2026-10-08");
  });
});

describe("validateForm", () => {
  it("accepts a simple receipt", () => {
    expect(hasErrors(validateForm(form()))).toBe(false);
  });
  it("needs at least one item", () => {
    const e = validateForm(form({ items: [{ id: "x", description: "", quantity: 1, unitPriceKobo: null }] }));
    expect(e.items).toBeTruthy();
  });
  it("ignores completely empty extra rows", () => {
    const f = form();
    f.items.push({ id: "b", description: "", quantity: 1, unitPriceKobo: null });
    expect(hasErrors(validateForm(f))).toBe(false);
    expect(toDraft(f).items).toHaveLength(1);
  });
  it("flags half-filled items", () => {
    const e = validateForm(form({ items: [{ id: "x", description: "Wig", quantity: 1, unitPriceKobo: null }] }));
    expect(e.itemErrors?.x.price).toBeTruthy();
  });
  it("part payment must be more than 0 and less than the total", () => {
    expect(validateForm(form({ status: "part", amountPaidKobo: null })).amountPaid).toBeTruthy();
    expect(validateForm(form({ status: "part", amountPaidKobo: N(30000) })).amountPaid).toBeTruthy();
    expect(validateForm(form({ status: "part", amountPaidKobo: N(10000) })).amountPaid).toBeUndefined();
  });
  it("invoice due date can't be before the invoice date", () => {
    const e = validateForm(form({ type: "invoice", status: "unpaid", dueDate: "2026-09-30" }));
    expect(e.dueDate).toBeTruthy();
  });
  it("percentage discount can't exceed 100%", () => {
    expect(validateForm(form({ discountType: "percent", discountPercent: 120 })).discount).toBeTruthy();
  });
  it("reports a bad customer phone", () => {
    expect(validateForm(form(), false).customerPhone).toBeTruthy();
  });
});

describe("toDraft", () => {
  it("only keeps the amount paid for part payments", () => {
    expect(toDraft(form({ status: "paid", amountPaidKobo: N(5) })).amountPaidKobo).toBe(0);
    expect(toDraft(form({ status: "part", amountPaidKobo: N(5) })).amountPaidKobo).toBe(N(5));
  });
  it("receipts have no due date", () => {
    expect(toDraft(form()).dueDate).toBeNull();
  });
  it("keeps the chosen discount type only", () => {
    expect(toDraft(form({ discountType: "percent", discountPercent: 10, discountKobo: N(50) })).discount).toEqual({
      type: "percent",
      percent: 10,
    });
    expect(toDraft(form({ discountType: "amount", discountKobo: null })).discount).toBeNull();
  });
});

describe("parseQuantity", () => {
  it.each([
    ["2", 2],
    ["1.5", 1.5],
    ["0.25", 0.25],
    ["1,000", 1000],
  ])("parses %s", (t, v) => expect(parseQuantity(t)).toBe(v));
  it.each(["", "0", "-1", "1.234", "abc"])("rejects %s", (t) => expect(parseQuantity(t)).toBeNull());
});
