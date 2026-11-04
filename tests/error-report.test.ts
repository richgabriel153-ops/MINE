import { describe, expect, it } from "vitest";
import { cleanReport, scrub } from "@/lib/error-report";

describe("error reports from phones", () => {
  it("removes personal details before saving", () => {
    const s = scrub("Failed for ada@shop.ng phone +2348031234567 acct 0123456789 token sb_secret_abcdefghijklmnop");
    expect(s).not.toMatch(/ada@shop\.ng|8031234567|0123456789|sb_secret_abc/);
    expect(s).toContain("[email]");
    expect(s).toContain("[number]");
    expect(s).toContain("[token]");
  });

  it("keeps only the page path, never the search words in the address", () => {
    const r = cleanReport({ message: "boom", page: "/history?q=Ada%20Okafor#x", kind: "screen" });
    expect(r?.page).toBe("/history");
    expect(r?.kind).toBe("screen");
  });

  it("refuses empty or odd reports and trims long ones", () => {
    expect(cleanReport(null)).toBeNull();
    expect(cleanReport({ message: "" })).toBeNull();
    expect(cleanReport({ message: "x", kind: "<script>" })?.kind).toBe("error");
    expect(cleanReport({ message: "x", page: "javascript:alert(1)" })?.page).toBe("");
    expect(cleanReport({ message: "y".repeat(5000) })?.message.length).toBe(500);
  });
});
