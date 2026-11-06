import { describe, expect, it } from "vitest";
import {
  computeTax,
  DEFAULT_TAX_PROFILE,
  outputVatFromDocuments,
  personalIncomeTax,
  taxYears,
  vatDueDate,
  type TaxProfile,
} from "@/lib/tax";
import type { DocumentRecord } from "@/lib/types";

const N = (n: number) => n * 100;
const sole = (p: Partial<TaxProfile> = {}): TaxProfile => ({ ...DEFAULT_TAX_PROFILE, ...p });
const company = (p: Partial<TaxProfile> = {}): TaxProfile => ({ ...DEFAULT_TAX_PROFILE, kind: "company", ...p });

describe("personalIncomeTax", () => {
  it("applies the 2026 bands", () => {
    const total = (k: number) => personalIncomeTax(k).reduce((s, b) => s + b.taxKobo, 0);
    expect(total(N(800_000))).toBe(0);
    expect(total(N(3_000_000))).toBe(N(330_000));
    expect(total(N(5_500_000))).toBe(N(330_000 + 450_000));
    expect(total(N(60_000_000))).toBe(N(330_000 + 1_620_000 + 2_730_000 + 5_750_000 + 2_500_000));
  });
  it("labels the bands", () => {
    expect(personalIncomeTax(N(4_000_000)).map((b) => b.label)).toEqual(["First ₦800,000", "Next ₦2,200,000", "Next ₦9,000,000"]);
  });
});

describe("computeTax: sole trader", () => {
  const input = {
    year: 2026,
    sales: [
      { date: "2026-03-01", amountKobo: N(6_000_000) },
      { date: "2026-11-01", amountKobo: N(4_000_000) },
      { date: "2025-12-31", amountKobo: N(9_999_999) }, // other year
    ],
    expenses: [
      { date: "2026-04-01", amountKobo: N(3_000_000), category: "Stock" },
      { date: "2026-05-01", amountKobo: N(1_000_000), category: "Rent" },
      { date: "2026-05-02", amountKobo: N(700_000), category: "Personal" },
    ],
    outputVat: [],
  };

  it("profit, reliefs and tax", () => {
    const r = computeTax(sole({ rentPaidKobo: N(1_000_000), pensionKobo: N(300_000), excludedCategories: ["Personal"] }), input);
    expect(r.turnoverKobo).toBe(N(10_000_000));
    expect(r.expensesKobo).toBe(N(4_000_000));
    expect(r.excludedExpensesKobo).toBe(N(700_000));
    expect(r.profitKobo).toBe(N(6_000_000));
    expect(r.personal?.rentReliefKobo).toBe(N(200_000));
    expect(r.personal?.chargeableKobo).toBe(N(5_500_000));
    expect(r.totalTaxKobo).toBe(N(780_000));
    expect(r.small).toBe(true);
    expect(r.vat.mustCharge).toBe(false);
    expect(r.deadlines[0]).toEqual({ label: "Personal income tax return (self-assessment)", date: "2027-03-31" });
  });

  it("caps rent relief at ₦500,000", () => {
    const r = computeTax(sole({ rentPaidKobo: N(5_000_000) }), input);
    expect(r.personal?.rentReliefKobo).toBe(N(500_000));
  });

  it("a loss means no tax", () => {
    const r = computeTax(sole({ extraExpensesKobo: N(20_000_000) }), input);
    expect(r.profitKobo).toBeLessThan(0);
    expect(r.totalTaxKobo).toBe(0);
    expect(r.effectiveRatePercent).toBe(0);
  });
});

describe("computeTax: company", () => {
  const big = {
    year: 2026,
    sales: [{ date: "2026-06-10", amountKobo: N(215_000_000) }],
    expenses: [{ date: "2026-06-11", amountKobo: N(150_000_000), category: "Stock" }],
    outputVat: [
      { date: "2026-06-10", amountKobo: N(10_000_000) },
      { date: "2026-12-02", amountKobo: N(5_000_000) },
    ],
  };

  it("30% CIT and 4% development levy above the small limit", () => {
    const r = computeTax(company(), big);
    expect(r.turnoverKobo).toBe(N(200_000_000));
    expect(r.profitKobo).toBe(N(50_000_000));
    expect(r.small).toBe(false);
    expect(r.company).toEqual({ citKobo: N(15_000_000), levyKobo: N(2_000_000) });
    expect(r.totalTaxKobo).toBe(N(17_000_000));
    expect(r.effectiveRatePercent).toBe(34);
    expect(r.vat.mustCharge).toBe(true);
    expect(r.vat.months).toEqual([
      { month: "2026-06", vatKobo: N(10_000_000), dueDate: "2026-07-21" },
      { month: "2026-12", vatKobo: N(5_000_000), dueDate: "2027-01-21" },
    ]);
    expect(r.deadlines[0].date).toBe("2027-06-30");
  });

  it("small companies pay 0%", () => {
    const r = computeTax(company(), { ...big, sales: [{ date: "2026-01-05", amountKobo: N(80_000_000) }], outputVat: [] });
    expect(r.small).toBe(true);
    expect(r.totalTaxKobo).toBe(0);
  });

  it("professional services and big fixed assets are never small", () => {
    const small = { ...big, sales: [{ date: "2026-01-05", amountKobo: N(80_000_000) }], expenses: [], outputVat: [] };
    expect(computeTax(company({ professionalServices: true }), small).small).toBe(false);
    expect(computeTax(company({ fixedAssetsKobo: N(300_000_000) }), small).small).toBe(false);
    expect(computeTax(company({ professionalServices: true }), small).totalTaxKobo).toBe(N(24_000_000 + 3_200_000));
  });
});

describe("helpers", () => {
  it("VAT due dates", () => {
    expect(vatDueDate("2026-01")).toBe("2026-02-21");
    expect(vatDueDate("2026-12")).toBe("2027-01-21");
  });

  it("output VAT from documents", () => {
    const base = {
      id: "x",
      number: "1",
      issueDate: "2026-02-01",
      dueDate: null,
      customer: { name: "", phone: "" },
      items: [{ id: "i", description: "A", quantity: 1, unitPriceKobo: N(10_000) }],
      discount: null,
      deliveryKobo: 0,
      vatEnabled: true,
      status: "paid",
      amountPaidKobo: 0,
      method: "transfer",
      notes: "",
      templateId: "classic",
      createdAt: "",
      updatedAt: "",
    } as unknown as DocumentRecord;
    const docs = [
      { ...base, type: "receipt" },
      { ...base, type: "quote" },
      { ...base, type: "invoice", receiptId: "r" },
      { ...base, type: "invoice", vatEnabled: false },
    ] as DocumentRecord[];
    expect(outputVatFromDocuments(docs)).toEqual([{ date: "2026-02-01", amountKobo: N(750) }]);
  });

  it("tax years from 2026", () => {
    expect(taxYears(["2025-05-01", "2027-01-01"], "2026-10-01")).toEqual([2027, 2026]);
  });
});
