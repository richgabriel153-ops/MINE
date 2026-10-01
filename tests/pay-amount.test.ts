import { describe, expect, it } from "vitest";
import { checkPayAmount, isValidEmail } from "@/lib/pay-amount";

describe("checkPayAmount", () => {
  it("accepts the full balance or a part of it", () => {
    expect(checkPayAmount(4_500_000, 4_500_000)).toBeNull();
    expect(checkPayAmount(1_000_000, 4_500_000)).toBeNull();
  });
  it("rejects more than the balance, zero, fractions and tiny amounts", () => {
    expect(checkPayAmount(4_500_001, 4_500_000)).toMatch(/more than/);
    expect(checkPayAmount(0, 4_500_000)).toBeTruthy();
    expect(checkPayAmount(10.5, 4_500_000)).toBeTruthy();
    expect(checkPayAmount(5_000, 4_500_000)).toMatch(/₦100/);
  });
  it("allows paying a balance smaller than ₦100 in full", () => {
    expect(checkPayAmount(5_000, 5_000)).toBeNull();
  });
});

describe("isValidEmail", () => {
  it("checks email addresses", () => {
    expect(isValidEmail("bisi@gmail.com")).toBe(true);
    expect(isValidEmail("bisi@")).toBe(false);
  });
});
