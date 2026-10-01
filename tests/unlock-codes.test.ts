import { describe, expect, it } from "vitest";
import { isValidUnlockCode, parseCodeList } from "@/lib/unlock-codes";

const ENV = " NAIJA-PRO-1234 , second-code,, x ";

describe("unlock codes (temporary)", () => {
  it("reads the comma-separated list, ignoring blanks and very short entries", () => {
    expect(parseCodeList(ENV)).toEqual(["NAIJA-PRO-1234", "SECOND-CODE"]);
    expect(parseCodeList(undefined)).toEqual([]);
  });
  it("accepts codes regardless of case and spaces", () => {
    expect(isValidUnlockCode("naija-pro-1234", ENV)).toBe(true);
    expect(isValidUnlockCode("  Second-Code ", ENV)).toBe(true);
    expect(isValidUnlockCode("naija-pro-\n1234", ENV)).toBe(true);
  });
  it("rejects wrong, partial or empty codes", () => {
    expect(isValidUnlockCode("NAIJA-PRO-123", ENV)).toBe(false);
    expect(isValidUnlockCode("", ENV)).toBe(false);
    expect(isValidUnlockCode("X", ENV)).toBe(false);
    expect(isValidUnlockCode("anything", undefined)).toBe(false);
  });
});
