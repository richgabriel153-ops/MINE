import { describe, expect, it } from "vitest";
import { BackupError, parseBackup, planImport, type BackupFile } from "@/lib/backup";
import { EMPTY_PROFILE, type DocumentRecord } from "@/lib/types";

function doc(id: string, number: string, updatedAt = "2026-10-01T10:00:00Z"): DocumentRecord {
  return {
    id,
    schemaVersion: 1,
    type: number.startsWith("INV") ? "invoice" : "receipt",
    number,
    issueDate: "2026-10-01",
    dueDate: null,
    customer: { name: "", phone: "" },
    items: [{ id: "i", description: "Item", quantity: 1, unitPriceKobo: 100 }],
    discount: null,
    deliveryKobo: 0,
    vatEnabled: false,
    status: "paid",
    amountPaidKobo: 0,
    method: "cash",
    notes: "",
    templateId: "classic",
    createdAt: updatedAt,
    updatedAt,
  };
}

const backup: BackupFile = {
  app: "inceipt",
  version: 1,
  exportedAt: "2026-10-01T12:00:00Z",
  profile: { ...EMPTY_PROFILE, name: "Old Phone Shop" },
  counters: { receipt: 3, invoice: 1 },
  settings: {},
  documents: [doc("a", "RCT-0001"), doc("b", "RCT-0003"), doc("c", "INV-0001")],
};

describe("parseBackup", () => {
  it("reads a valid backup", () => {
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.documents).toHaveLength(3);
    expect(parsed.profile.name).toBe("Old Phone Shop");
  });
  it("still reads backups made under the old name (ReceiptNaija)", () => {
    expect(parseBackup(JSON.stringify({ ...backup, app: "receiptnaija" })).documents).toHaveLength(3);
  });
  it.each([
    ["not json", "hello"],
    ["another app", JSON.stringify({ app: "other", documents: [] })],
    ["damaged record", JSON.stringify({ ...backup, documents: [{ id: 1 }] })],
    ["newer version", JSON.stringify({ ...backup, version: 99 })],
  ])("rejects %s with a friendly message", (_, text) => {
    expect(() => parseBackup(text)).toThrow(BackupError);
  });
});

describe("planImport", () => {
  const empty = { documents: [], counters: { receipt: 0, invoice: 0 }, profile: EMPTY_PROFILE };

  it("restores everything onto a new phone", () => {
    const plan = planImport(backup, empty, "merge");
    expect(plan.documents).toHaveLength(3);
    expect(plan.profile.name).toBe("Old Phone Shop");
    expect(plan.counters).toEqual({ receipt: 3, invoice: 1 });
  });
  it("merging keeps this phone's records and the newer copy of each", () => {
    const current = {
      documents: [doc("a", "RCT-0001", "2026-10-02T00:00:00Z"), doc("z", "RCT-0007")],
      counters: { receipt: 7, invoice: 0 },
      profile: { ...EMPTY_PROFILE, name: "New Phone Shop" },
    };
    const plan = planImport(backup, current, "merge");
    expect(plan.documents.map((d) => d.id).sort()).toEqual(["a", "b", "c", "z"]);
    expect(plan.documents.find((d) => d.id === "a")?.updatedAt).toBe("2026-10-02T00:00:00Z");
    expect(plan.added).toBe(2);
    expect(plan.updated).toBe(0);
    expect(plan.profile.name).toBe("New Phone Shop");
    expect(plan.counters).toEqual({ receipt: 7, invoice: 1 });
  });
  it("replace uses only the backup", () => {
    const plan = planImport(backup, { ...empty, documents: [doc("z", "RCT-0009")] }, "replace");
    expect(plan.documents.map((d) => d.id)).toEqual(["a", "b", "c"]);
  });
  it("counters never fall below numbers in use", () => {
    const plan = planImport({ ...backup, counters: { receipt: 0, invoice: 0 } }, empty, "merge");
    expect(plan.counters).toEqual({ receipt: 3, invoice: 1 });
  });
});
