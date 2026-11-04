import { describe, expect, it } from "vitest";
import { contactLines } from "@/components/templates/shared";
import { cleanTin, validateProfile } from "@/lib/profile";
import { cleanProfileForUpload } from "@/lib/profile-clean";
import { EMPTY_PROFILE } from "@/lib/types";

const base = { ...EMPTY_PROFILE, name: "Ada Fabrics" };

describe("Tax ID (TIN) on business details", () => {
  it("accepts the common formats and tidies spacing", () => {
    expect(cleanTin(" TIN: 12345678 0001 ")).toBe("12345678-0001");
    for (const tin of ["12345678-0001", "1234567890", "1234567890123"]) {
      expect(validateProfile({ ...base, tin }).tin).toBeUndefined();
    }
  });

  it("rejects things that aren't a Tax ID, and empty is fine", () => {
    for (const tin of ["1234", "ABC12345678", "12345678-01", "<b>1</b>"]) {
      expect(validateProfile({ ...base, tin }).tin).toBeDefined();
    }
    expect(validateProfile({ ...base, tin: "" }).tin).toBeUndefined();
    expect(validateProfile(base).tin).toBeUndefined();
  });

  it("prints on documents only when filled in", () => {
    expect(contactLines({ ...base, tin: "12345678-0001" })).toContain("TIN 12345678-0001");
    expect(contactLines(base).some((l) => l.startsWith("TIN"))).toBe(false);
  });

  it("drops a bad Tax ID when moving old phone records up", () => {
    expect(cleanProfileForUpload({ ...base, tin: "nonsense" }).tin).toBe("");
    expect(cleanProfileForUpload({ ...base, tin: "12345678-0001" }).tin).toBe("12345678-0001");
  });
});
