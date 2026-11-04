import { describe, expect, it } from "vitest";
import { authMessage, cleanEmail, EMAIL_PATTERN, passwordProblem, safeNext } from "@/lib/auth";

describe("passwords", () => {
  it("needs 8+ characters with letters and numbers", () => {
    expect(passwordProblem("short1")).toMatch(/8 characters/);
    expect(passwordProblem("onlyletters")).toMatch(/letter and one number/);
    expect(passwordProblem("12345678")).toMatch(/letter and one number/);
    expect(passwordProblem("password1")).toMatch(/too easy/);
    expect(passwordProblem("x".repeat(70) + "123")).toMatch(/72/);
    expect(passwordProblem("Mama Chi 2026")).toBeNull();
  });
});

describe("emails", () => {
  it("cleans and checks", () => {
    expect(cleanEmail("  Ada@Shop.NG ")).toBe("ada@shop.ng");
    expect(EMAIL_PATTERN.test("ada@shop.ng")).toBe(true);
    expect(EMAIL_PATTERN.test("ada@shop")).toBe(false);
    expect(EMAIL_PATTERN.test("ada shop@x.ng")).toBe(false);
  });
});

describe("after-login redirect", () => {
  it("only goes to pages inside InCeipt", () => {
    expect(safeNext("/history?status=owing")).toBe("/history?status=owing");
    expect(safeNext("https://evil.example")).toBe("/home");
    expect(safeNext("//evil.example")).toBe("/home");
    expect(safeNext("/\\evil.example")).toBe("/home");
    expect(safeNext(null)).toBe("/home");
  });
});

describe("auth messages", () => {
  it("are plain English", () => {
    expect(authMessage(new Error("Invalid login credentials"))).toBe("Wrong email or password.");
    expect(authMessage(new Error("Email not confirmed"))).toMatch(/confirm your email/);
    expect(authMessage(new Error("Token has expired or is invalid"))).toMatch(/wrong or has expired/);
    expect(authMessage(new Error("email rate limit exceeded"))).toMatch(/Too many tries/);
    expect(authMessage(new Error("For security purposes, you can only request this after 42 seconds"))).toMatch(/Too many tries/);
    expect(authMessage({ message: "Failed to fetch" })).toMatch(/No internet/);
    expect(authMessage(new Error("weird"))).toBe("Something went wrong. Please try again.");
  });
});
