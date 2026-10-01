import { describe, expect, it } from "vitest";
import { formatNaira, mulDivKobo, parseNairaToKobo, percentOfKobo } from "@/lib/money";

describe("formatNaira", () => {
  it("formats whole naira with thousand separators", () => {
    expect(formatNaira(2_500_000)).toBe("₦25,000");
    expect(formatNaira(0)).toBe("₦0");
    expect(formatNaira(123_456_789_00)).toBe("₦123,456,789");
  });
  it("shows kobo only when there are some", () => {
    expect(formatNaira(2_500_050)).toBe("₦25,000.50");
    expect(formatNaira(5)).toBe("₦0.05");
  });
  it("puts the minus sign before ₦", () => {
    expect(formatNaira(-50_000)).toBe("-₦500");
  });
  it("rejects non-integer kobo", () => {
    expect(() => formatNaira(1.5)).toThrow();
  });
});

describe("parseNairaToKobo", () => {
  it.each([
    ["25000", 2_500_000],
    ["25,000", 2_500_000],
    ["₦25,000.5", 2_500_050],
    [" 1,200.75 ", 120_075],
    ["N500", 50_000],
    ["0.1", 10],
    ["0", 0],
    ["10.", 1000],
  ])("parses %s", (input, expected) => {
    expect(parseNairaToKobo(input)).toBe(expected);
  });
  it.each(["", "abc", "1.234", "-5", "1e5", "12.3.4"])("rejects %s", (input) => {
    expect(parseNairaToKobo(input)).toBeNull();
  });
  it("avoids floating point errors", () => {
    // 0.1 + 0.2 style problems: 1.15 * 100 = 114.99999 in floats
    expect(parseNairaToKobo("1.15")).toBe(115);
    expect(parseNairaToKobo("4.35")).toBe(435);
  });
});

describe("mulDivKobo / percentOfKobo", () => {
  it("rounds half up to the nearest kobo", () => {
    expect(mulDivKobo(5, 50, 100)).toBe(3); // 2.5 → 3
    expect(mulDivKobo(5, 30, 100)).toBe(2); // 1.5 → 2
    expect(mulDivKobo(5, 20, 100)).toBe(1); // 1.0 → 1
  });
  it("calculates percentages", () => {
    expect(percentOfKobo(1_000_000, 7.5)).toBe(75_000);
    expect(percentOfKobo(333, 7.5)).toBe(25); // 24.975 → 25
    expect(percentOfKobo(1_000_000, 12.25)).toBe(122_500);
  });
  it("handles very large amounts exactly", () => {
    expect(percentOfKobo(1_000_000_000_000, 7.5)).toBe(75_000_000_000);
  });
});
