import { describe, expect, it } from "vitest";
import { billingSummary, isProActive, PLANS, YEARLY_SAVING_KOBO } from "@/lib/billing";

const now = new Date("2026-10-10T12:00:00Z");

describe("plans", () => {
  it("yearly saves ₦8,000 compared to monthly", () => {
    expect(PLANS.monthly.kobo).toBe(300_000);
    expect(PLANS.yearly.kobo).toBe(2_800_000);
    expect(YEARLY_SAVING_KOBO).toBe(800_000);
  });
});

describe("isProActive", () => {
  it("active within the period", () => {
    expect(isProActive({ comp: false, status: "active", periodEnd: "2026-11-01T00:00:00Z" }, now)).toBe(true);
  });
  it("cancelled plans keep Pro until the period ends (plus grace)", () => {
    expect(isProActive({ comp: false, status: "non_renewing", periodEnd: "2026-10-09T00:00:00Z" }, now)).toBe(true);
    expect(isProActive({ comp: false, status: "non_renewing", periodEnd: "2026-10-06T00:00:00Z" }, now)).toBe(false);
  });
  it("failed renewal: 3 days' grace, then Free", () => {
    expect(isProActive({ comp: false, status: "attention", periodEnd: "2026-10-08T00:00:00Z" }, now)).toBe(true);
    expect(isProActive({ comp: false, status: "attention", periodEnd: "2026-10-06T00:00:00Z" }, now)).toBe(false);
  });
  it("no plan / ended", () => {
    expect(isProActive({ comp: false, status: "none", periodEnd: null }, now)).toBe(false);
    expect(isProActive({ comp: false, status: "cancelled", periodEnd: "2026-12-01T00:00:00Z" }, now)).toBe(false);
  });
  it("honoured codes are always Pro", () => {
    expect(isProActive({ comp: true, status: "none", periodEnd: null }, now)).toBe(true);
  });
});

describe("billingSummary", () => {
  const cloud = (p: object) => ({ isPro: true, proSource: "subscription" as const, cloud: { plan: "monthly" as const, billingStatus: "active", periodEnd: "2026-11-01T00:00:00Z", pendingPlan: null, ...p } });
  it("describes renewals and switches", () => {
    expect(billingSummary(cloud({}), now).detail).toBe("Renews on 01/11/2026 for ₦3,000.");
    expect(billingSummary(cloud({ pendingPlan: "yearly" }), now).detail).toMatch(/switches to Yearly \(₦28,000\/year\)/);
  });
  it("describes cancellation", () => {
    expect(billingSummary(cloud({ billingStatus: "non_renewing" }), now).detail).toBe("Pro stays on until 01/11/2026, then you move to Free.");
  });
  it("free users", () => {
    expect(billingSummary({ isPro: false, proSource: null }, now).title).toBe("Free");
  });
});
