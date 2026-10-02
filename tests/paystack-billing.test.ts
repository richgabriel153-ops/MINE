import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidPaystackSignature } from "@/lib/paystack-signature";
import { reconcileBilling, type PaystackSubscription, type StoredBilling } from "@/lib/paystack-subscriptions";

const ids = { monthly: { code: "PLN_month", id: 11 }, yearly: { code: "PLN_year", id: 22 } };
const empty: StoredBilling = {
  plan: null, status: "none", current_period_end: null, pending_plan: null,
  paystack_subscription_code: null, paystack_email_token: null, paystack_pending_subscription_code: null,
};
const sub = (p: Partial<PaystackSubscription>): PaystackSubscription => ({
  subscription_code: "SUB_1", email_token: "tok1", status: "active", next_payment_date: "2026-11-01T00:00:00.000Z",
  createdAt: "2026-10-01T00:00:00.000Z", plan: { plan_code: "PLN_month", id: 11 }, ...p,
});

describe("reconcileBilling", () => {
  it("new monthly subscription", () => {
    const s = reconcileBilling(empty, [sub({})], ids);
    expect(s).toMatchObject({ plan: "monthly", status: "active", current_period_end: "2026-11-01T00:00:00.000Z", paystack_subscription_code: "SUB_1", pending_plan: null });
  });
  it("renewal moves the period end forward", () => {
    const first = reconcileBilling(empty, [sub({})], ids);
    expect(reconcileBilling(first, [sub({ next_payment_date: "2026-12-01T00:00:00.000Z" })], ids).current_period_end).toBe("2026-12-01T00:00:00.000Z");
  });
  it("failed renewal → attention (grace period applies)", () => {
    expect(reconcileBilling(empty, [sub({ status: "attention" })], ids).status).toBe("attention");
  });
  it("cancelled: keeps Pro to the end of the paid period", () => {
    const first = reconcileBilling(empty, [sub({})], ids);
    const s = reconcileBilling(first, [sub({ status: "non-renewing", next_payment_date: null })], ids);
    expect(s).toMatchObject({ status: "non_renewing", current_period_end: "2026-11-01T00:00:00.000Z" });
  });
  it("after the period: Free", () => {
    const first = reconcileBilling(empty, [sub({})], ids);
    expect(reconcileBilling(first, [sub({ status: "complete" })], ids).status).toBe("cancelled");
  });
  it("switching monthly → yearly: monthly runs out, yearly is pending, then takes over", () => {
    const first = reconcileBilling(empty, [sub({})], ids);
    const yearly = sub({ subscription_code: "SUB_2", email_token: "tok2", plan: { plan_code: "PLN_year" }, createdAt: "2026-10-15T00:00:00.000Z" });
    const during = reconcileBilling(first, [sub({ status: "non-renewing", next_payment_date: null }), yearly], ids);
    expect(during).toMatchObject({ plan: "monthly", status: "non_renewing", pending_plan: "yearly", paystack_pending_subscription_code: "SUB_2", current_period_end: "2026-11-01T00:00:00.000Z" });
    const after = reconcileBilling(during, [sub({ status: "complete" }), { ...yearly, next_payment_date: "2027-11-01T00:00:00.000Z" }], ids);
    expect(after).toMatchObject({ plan: "yearly", status: "active", pending_plan: null, paystack_subscription_code: "SUB_2", current_period_end: "2027-11-01T00:00:00.000Z" });
  });
  it("ignores subscriptions to other plans and matches plans by id too", () => {
    expect(reconcileBilling(empty, [sub({ plan: { plan_code: "PLN_other" } })], ids).status).toBe("none");
    expect(reconcileBilling(empty, [sub({ plan: 22 })], ids).plan).toBe("yearly");
  });
});

describe("isValidPaystackSignature", () => {
  const body = JSON.stringify({ event: "charge.success" });
  const good = createHmac("sha512", "sk_test_x").update(body).digest("hex");
  it("accepts Paystack's signature", () => expect(isValidPaystackSignature(body, good, "sk_test_x")).toBe(true));
  it("rejects anything else", () => {
    expect(isValidPaystackSignature(body, "nope", "sk_test_x")).toBe(false);
    expect(isValidPaystackSignature(body + " ", good, "sk_test_x")).toBe(false);
    expect(isValidPaystackSignature(body, good, undefined)).toBe(false);
    expect(isValidPaystackSignature(body, null, "sk_test_x")).toBe(false);
  });
});
