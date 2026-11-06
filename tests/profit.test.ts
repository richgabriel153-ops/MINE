import { describe, expect, it } from "vitest";
import { allCategories, cleanCategory } from "@/lib/expenses";
import { byCategory, monthlySeries, profitFor, rangeFor } from "@/lib/profit";
import { salesFromDocuments, summarise } from "@/lib/summary";
import type { DocumentRecord } from "@/lib/types";

const N = (n: number) => n * 100;
const today = "2026-10-15"; // Thursday

describe("rangeFor", () => {
  it("today, Mon–Sun week and calendar month", () => {
    expect(rangeFor("today", today)).toEqual({ from: "2026-10-15", to: "2026-10-15" });
    expect(rangeFor("week", today)).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(rangeFor("month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(rangeFor("month", "2026-12-05")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(rangeFor("month", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});

describe("profitFor", () => {
  const sales = [
    { date: "2026-10-15", amountKobo: N(50_000) },
    { date: "2026-10-13", amountKobo: N(20_000) },
    { date: "2026-09-30", amountKobo: N(99_000) },
  ];
  const expenses = [
    { date: "2026-10-15", amountKobo: N(8_000) },
    { date: "2026-10-01", amountKobo: N(30_000) },
  ];
  it("sales minus expenses in the range", () => {
    expect(profitFor(sales, expenses, rangeFor("today", today))).toEqual({ salesKobo: N(50_000), expensesKobo: N(8_000), profitKobo: N(42_000) });
    expect(profitFor(sales, expenses, rangeFor("month", today))).toEqual({ salesKobo: N(70_000), expensesKobo: N(38_000), profitKobo: N(32_000) });
  });
  it("can be negative (a loss)", () => {
    expect(profitFor([], expenses, rangeFor("month", today)).profitKobo).toBe(-N(38_000));
  });
  it("custom ranges are inclusive", () => {
    expect(profitFor(sales, expenses, { from: "2026-09-30", to: "2026-10-01" }).salesKobo).toBe(N(99_000));
  });
});

describe("monthlySeries", () => {
  it("last 6 months, oldest first, across the year end", () => {
    const s = monthlySeries([{ date: "2026-01-05", amountKobo: 100 }], [{ date: "2025-12-31", amountKobo: 40 }], "2026-02-10");
    expect(s.map((m) => m.month)).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(s[3].expensesKobo).toBe(40);
    expect(s[4].salesKobo).toBe(100);
  });
});

describe("byCategory", () => {
  it("totals per category, biggest first", () => {
    const r = byCategory(
      [
        { date: "2026-10-02", amountKobo: 10, category: "Fuel" },
        { date: "2026-10-03", amountKobo: 50, category: "Stock" },
        { date: "2026-10-04", amountKobo: 15, category: "Fuel" },
        { date: "2026-09-04", amountKobo: 99, category: "Rent" },
      ],
      rangeFor("month", today),
    );
    expect(r).toEqual([{ category: "Stock", amountKobo: 50 }, { category: "Fuel", amountKobo: 25 }]);
  });
});

describe("sales only count money received", () => {
  const base: DocumentRecord = {
    id: "x", schemaVersion: 1, type: "receipt", number: "RCT-1", issueDate: "2026-10-15", dueDate: null,
    customer: { name: "", phone: "" }, items: [{ id: "i", description: "x", quantity: 1, unitPriceKobo: N(10_000) }],
    discount: null, deliveryKobo: 0, vatEnabled: false, status: "paid", amountPaidKobo: 0, method: "cash",
    notes: "", templateId: "classic", createdAt: "", updatedAt: "",
  };
  it("part payments count only what was paid; quotes and unpaid invoices count nothing", () => {
    const docs = [
      base,
      { ...base, id: "p", status: "part" as const, amountPaidKobo: N(4_000) },
      { ...base, id: "q", type: "quote" as const, status: "unpaid" as const },
      { ...base, id: "u", type: "invoice" as const, status: "unpaid" as const },
    ];
    expect(salesFromDocuments(docs).reduce((s, e) => s + e.amountKobo, 0)).toBe(N(14_000));
    const sum = summarise(docs, today);
    expect(sum.owingKobo).toBe(N(6_000) + N(10_000)); // quote not owed
  });
});

describe("categories", () => {
  it("adds custom categories before Other without duplicates", () => {
    expect(allCategories(["Packaging", "fuel", " "])).toEqual(["Stock", "Transport", "Fuel", "Rent", "Salaries", "Utilities", "Packaging", "Other"]);
  });
  it("cleans names", () => {
    expect(cleanCategory("  Data  bundle ")).toBe("Data bundle");
    expect(cleanCategory("")).toBeNull();
  });
});

describe("axis helpers", () => {
  it("round ticks", async () => {
    const { niceTicks, shortNaira } = await import("@/lib/profit");
    expect(niceTicks(N(37_500))).toEqual([0, N(10_000), N(20_000), N(30_000), N(40_000)]);
    expect(niceTicks(N(180_000))).toEqual([0, N(50_000), N(100_000), N(150_000), N(200_000)]);
    expect(niceTicks(0)[4]).toBeGreaterThan(0);
    expect(shortNaira(N(25_000))).toBe("₦25k");
    expect(shortNaira(N(1_500_000))).toBe("₦1.5m");
    expect(shortNaira(N(500))).toBe("₦500");
  });
});
