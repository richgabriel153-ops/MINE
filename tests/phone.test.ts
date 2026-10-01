import { describe, expect, it } from "vitest";
import { formatNgPhone, normaliseNgPhone, whatsappDigits } from "@/lib/phone";

describe("normaliseNgPhone", () => {
  it.each([
    ["08031234567", "+2348031234567"],
    ["8031234567", "+2348031234567"],
    ["2348031234567", "+2348031234567"],
    ["+2348031234567", "+2348031234567"],
    ["+234 803 123 4567", "+2348031234567"],
    ["+234 0803 123 4567", "+2348031234567"],
    ["0803-123-4567", "+2348031234567"],
    ["(0803) 123 4567", "+2348031234567"],
    ["07012345678", "+2347012345678"],
    ["09012345678", "+2349012345678"],
    ["09112345678", "+2349112345678"],
    ["8112345678", "+2348112345678"],
    ["  08031234567  ", "+2348031234567"],
  ])("%s → %s", (input, expected) => {
    expect(normaliseNgPhone(input)).toBe(expected);
  });

  it.each([
    ["", "empty"],
    ["0803123456", "too short"],
    ["080312345678", "too long"],
    ["08231234567", "not a mobile prefix"],
    ["01234567890", "landline"],
    ["+447911123456", "UK number"],
    ["+18031234567", "other country with +"],
    ["0803abc4567", "letters"],
  ])("rejects %s (%s)", (input) => {
    expect(normaliseNgPhone(input)).toBeNull();
  });
});

describe("formatNgPhone", () => {
  it("shows numbers the local way", () => {
    expect(formatNgPhone("+2348031234567")).toBe("0803 123 4567");
  });
  it("leaves unknown values alone", () => {
    expect(formatNgPhone("")).toBe("");
    expect(formatNgPhone("12345")).toBe("12345");
  });
});

describe("whatsappDigits", () => {
  it("drops the +", () => {
    expect(whatsappDigits("+2348031234567")).toBe("2348031234567");
  });
});
