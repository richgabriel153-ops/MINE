import { describe, expect, it } from "vitest";
import { addDays, formatDate, lagosDate, startOfMonth, startOfWeek } from "@/lib/dates";
import { countersFromNumbers, formatDocNumber, parseDocNumber } from "@/lib/numbering";

describe("dates", () => {
  it("formats as DD/MM/YYYY", () => {
    expect(formatDate("2026-10-01")).toBe("01/10/2026");
  });
  it("uses Lagos time, not the device or UTC date", () => {
    // 23:30 UTC on 30 Sept is 00:30 on 1 Oct in Lagos (UTC+1)
    expect(lagosDate(new Date("2026-09-30T23:30:00Z"))).toBe("2026-10-01");
    expect(lagosDate(new Date("2026-09-30T22:59:00Z"))).toBe("2026-09-30");
  });
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("weeks start on Monday", () => {
    expect(startOfWeek("2026-10-01")).toBe("2026-09-28"); // Thursday → Monday
    expect(startOfWeek("2026-10-04")).toBe("2026-09-28"); // Sunday → previous Monday
    expect(startOfWeek("2026-09-28")).toBe("2026-09-28");
  });
  it("month start", () => {
    expect(startOfMonth("2026-10-17")).toBe("2026-10-01");
  });
});

describe("numbering", () => {
  it("pads to 4 digits", () => {
    expect(formatDocNumber("receipt", 1)).toBe("RCT-0001");
    expect(formatDocNumber("invoice", 42)).toBe("INV-0042");
    expect(formatDocNumber("receipt", 12345)).toBe("RCT-12345");
  });
  it("parses numbers back", () => {
    expect(parseDocNumber("INV-0042")).toEqual({ type: "invoice", n: 42 });
    expect(parseDocNumber("XYZ-1")).toBeNull();
  });
  it("counters never go backwards after a restore", () => {
    expect(countersFromNumbers(["RCT-0003", "INV-0010", "RCT-0001"], { receipt: 5, invoice: 2 })).toEqual({
      receipt: 5,
      invoice: 10,
    });
  });
});
