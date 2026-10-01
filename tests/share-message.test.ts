import { describe, expect, it } from "vitest";
import { exportFileName, greetingName, shareMessage, whatsappLink } from "@/lib/share-message";
import { EMPTY_PROFILE, type DocumentRecord } from "@/lib/types";

const doc: DocumentRecord = {
  id: "1",
  schemaVersion: 1,
  type: "receipt",
  number: "RCT-0001",
  issueDate: "2026-10-01",
  dueDate: null,
  customer: { name: "Bisi Adeyemi", phone: "+2348031234567" },
  items: [{ id: "a", description: "Gown", quantity: 1, unitPriceKobo: 2_500_000 }],
  discount: null,
  deliveryKobo: 0,
  vatEnabled: false,
  status: "paid",
  amountPaidKobo: 0,
  method: "transfer",
  notes: "",
  templateId: "classic",
  createdAt: "",
  updatedAt: "",
};
const profile = { ...EMPTY_PROFILE, name: "Ada's Fashion", bankName: "GTBank", accountNumber: "0123456789", accountName: "Ada Ltd" };

describe("shareMessage", () => {
  it("greets the customer by first name and shows the total", () => {
    const m = shareMessage(doc, profile);
    expect(m).toContain("Hello Bisi, here is your receipt RCT-0001 from Ada's Fashion.");
    expect(m).toContain("Total: ₦25,000");
    expect(m).not.toContain("Pay to");
  });
  it("shows the balance for part payments", () => {
    const m = shareMessage({ ...doc, status: "part", amountPaidKobo: 1_000_000 }, profile);
    expect(m).toContain("Balance: ₦15,000");
  });
  it("invoices include amount due and bank details", () => {
    const m = shareMessage({ ...doc, type: "invoice", number: "INV-0002", status: "unpaid", dueDate: "2026-10-08" }, profile);
    expect(m).toContain("Amount due by 08/10/2026: ₦25,000");
    expect(m).toContain("Pay to: GTBank 0123456789 (Ada Ltd)");
  });
  it("works without a customer name", () => {
    expect(shareMessage({ ...doc, customer: { name: "", phone: "" } }, profile)).toMatch(/^Hello, here is/);
  });
});

describe("whatsappLink", () => {
  it("opens the customer's chat when we have their number", () => {
    expect(whatsappLink(doc, "hi there")).toBe("https://wa.me/2348031234567?text=hi%20there");
  });
  it("opens WhatsApp without a number otherwise", () => {
    expect(whatsappLink({ ...doc, customer: { name: "", phone: "" } }, "hi")).toBe("https://wa.me/?text=hi");
  });
});

describe("exportFileName", () => {
  it("is safe for any phone", () => {
    expect(exportFileName(doc, { ...profile, name: "Ada's / Fashion*" }, "png")).toBe("RCT-0001 Adas Fashion.png");
  });
});

describe("greetingName", () => {
  it.each([
    ["Bisi Adeyemi", "Bisi"],
    ["Mrs Bisi Adeyemi", "Mrs Bisi"],
    ["mrs. bisi", "mrs. bisi"],
    ["Chief Dr. Okafor Emeka", "Chief Dr. Okafor"],
    ["Alhaji Musa", "Alhaji Musa"],
    ["  ", ""],
    ["Oga", "Oga"],
  ])("%s → %s", (input, expected) => expect(greetingName(input)).toBe(expected));
});

describe("shareMessage with a Pay Now link", () => {
  it("adds the link when money is owed", () => {
    const m = shareMessage({ ...doc, type: "invoice", status: "unpaid" }, profile, "https://inceipt.app/pay?t=abc");
    expect(m).toContain("Pay online (card, transfer or USSD): https://inceipt.app/pay?t=abc");
  });
  it("leaves it out once paid", () => {
    expect(shareMessage(doc, profile, "https://inceipt.app/pay?t=abc")).not.toContain("Pay online");
  });
});
