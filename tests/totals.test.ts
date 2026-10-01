import { describe, expect, it } from "vitest";
import { computeTotals, discountKobo, lineTotalKobo, type TotalsInput } from "@/lib/totals";

const base: TotalsInput = {
  items: [],
  discount: null,
  deliveryKobo: 0,
  vatEnabled: false,
  status: "paid",
  amountPaidKobo: 0,
};

const N = (naira: number) => naira * 100;

describe("line totals", () => {
  it("multiplies quantity by unit price", () => {
    expect(lineTotalKobo({ quantity: 3, unitPriceKobo: N(2500) })).toBe(N(7500));
  });
  it("supports decimal quantities like 1.5 yards", () => {
    expect(lineTotalKobo({ quantity: 1.5, unitPriceKobo: N(3000) })).toBe(N(4500));
    expect(lineTotalKobo({ quantity: 0.33, unitPriceKobo: 1001 })).toBe(330); // 330.33 → 330
  });
  it("treats zero, negative or empty quantity as 0", () => {
    expect(lineTotalKobo({ quantity: 0, unitPriceKobo: N(100) })).toBe(0);
    expect(lineTotalKobo({ quantity: -2, unitPriceKobo: N(100) })).toBe(0);
    expect(lineTotalKobo({ quantity: Number.NaN, unitPriceKobo: N(100) })).toBe(0);
  });
});

describe("computeTotals", () => {
  it("adds up line items", () => {
    const t = computeTotals({
      ...base,
      items: [
        { quantity: 2, unitPriceKobo: N(15000) },
        { quantity: 1, unitPriceKobo: N(4500) },
      ],
    });
    expect(t.subtotalKobo).toBe(N(34500));
    expect(t.totalKobo).toBe(N(34500));
  });

  it("returns zeros for no items", () => {
    const t = computeTotals(base);
    expect(t).toMatchObject({ subtotalKobo: 0, totalKobo: 0, balanceKobo: 0 });
  });

  it("adds delivery fee after VAT, without taxing it", () => {
    const t = computeTotals({
      ...base,
      items: [{ quantity: 1, unitPriceKobo: N(10000) }],
      deliveryKobo: N(2000),
      vatEnabled: true,
    });
    expect(t.vatKobo).toBe(N(750));
    expect(t.totalKobo).toBe(N(10000 + 750 + 2000));
  });

  it("does not let money maths drift with many small items", () => {
    const items = Array.from({ length: 10 }, () => ({ quantity: 1, unitPriceKobo: 10 })); // ₦0.10 each
    expect(computeTotals({ ...base, items }).totalKobo).toBe(100);
  });
});

describe("discounts", () => {
  it("takes a fixed ₦ amount off", () => {
    expect(discountKobo(N(10000), { type: "amount", kobo: N(1500) })).toBe(N(1500));
  });
  it("takes a percentage off", () => {
    expect(discountKobo(N(10000), { type: "percent", percent: 10 })).toBe(N(1000));
    expect(discountKobo(N(9999), { type: "percent", percent: 2.5 })).toBe(24_998); // 24997.5 → 24998
  });
  it("never discounts more than the subtotal", () => {
    expect(discountKobo(N(5000), { type: "amount", kobo: N(8000) })).toBe(N(5000));
    expect(discountKobo(N(5000), { type: "percent", percent: 150 })).toBe(N(5000));
  });
  it("ignores negative discounts", () => {
    expect(discountKobo(N(5000), { type: "amount", kobo: -N(100) })).toBe(0);
    expect(discountKobo(N(5000), { type: "percent", percent: -10 })).toBe(0);
  });
  it("applies the discount before VAT", () => {
    const t = computeTotals({
      ...base,
      items: [{ quantity: 1, unitPriceKobo: N(20000) }],
      discount: { type: "percent", percent: 10 },
      vatEnabled: true,
    });
    expect(t.discountKobo).toBe(N(2000));
    expect(t.vatKobo).toBe(N(1350)); // 7.5% of 18,000
    expect(t.totalKobo).toBe(N(19350));
  });
  it("delivery fee is still charged when the discount wipes out the items", () => {
    const t = computeTotals({
      ...base,
      items: [{ quantity: 1, unitPriceKobo: N(1000) }],
      discount: { type: "amount", kobo: N(5000) },
      deliveryKobo: N(1500),
    });
    expect(t.totalKobo).toBe(N(1500));
  });
});

describe("VAT", () => {
  it("is off by default (vatEnabled false adds nothing)", () => {
    const t = computeTotals({ ...base, items: [{ quantity: 1, unitPriceKobo: N(10000) }] });
    expect(t.vatKobo).toBe(0);
  });
  it("is 7.5% rounded to the nearest kobo", () => {
    const t = computeTotals({ ...base, items: [{ quantity: 1, unitPriceKobo: 333 }], vatEnabled: true });
    expect(t.vatKobo).toBe(25); // 24.975 → 25
    expect(t.totalKobo).toBe(358);
  });
});

describe("payment status", () => {
  const items = [{ quantity: 1, unitPriceKobo: N(50000) }];

  it("paid: everything paid, no balance", () => {
    const t = computeTotals({ ...base, items, status: "paid" });
    expect(t.amountPaidKobo).toBe(N(50000));
    expect(t.balanceKobo).toBe(0);
  });
  it("unpaid: nothing paid, full balance", () => {
    const t = computeTotals({ ...base, items, status: "unpaid", amountPaidKobo: N(999) });
    expect(t.amountPaidKobo).toBe(0);
    expect(t.balanceKobo).toBe(N(50000));
  });
  it("part paid: balance is total minus amount paid", () => {
    const t = computeTotals({ ...base, items, status: "part", amountPaidKobo: N(20000) });
    expect(t.amountPaidKobo).toBe(N(20000));
    expect(t.balanceKobo).toBe(N(30000));
  });
  it("part paid: works with kobo amounts", () => {
    const t = computeTotals({ ...base, items, status: "part", amountPaidKobo: 1_234_567 });
    expect(t.balanceKobo).toBe(N(50000) - 1_234_567);
  });
  it("part paid: cannot pay more than the total or less than 0", () => {
    expect(computeTotals({ ...base, items, status: "part", amountPaidKobo: N(80000) }).balanceKobo).toBe(0);
    expect(computeTotals({ ...base, items, status: "part", amountPaidKobo: -5 }).amountPaidKobo).toBe(0);
  });
  it("part paid: balance includes VAT and delivery", () => {
    const t = computeTotals({
      ...base,
      items,
      vatEnabled: true,
      deliveryKobo: N(2500),
      status: "part",
      amountPaidKobo: N(25000),
    });
    expect(t.totalKobo).toBe(N(50000 + 3750 + 2500));
    expect(t.balanceKobo).toBe(N(31250));
  });
});
