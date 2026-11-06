import { describe, expect, it } from "vitest";
import { permissionsFor } from "@/lib/permissions";

describe("permissionsFor", () => {
  it("free owner: can manage their business but not Pro features", () => {
    const p = permissionsFor("owner", false);
    expect(p).toMatchObject({ trackDebts: false, quotes: false, expenses: false, manageStaff: false, payLinks: false });
    expect(p).toMatchObject({ viewRevenue: true, editRecords: true, manageBusiness: true });
  });
  it("Pro owner: everything", () => {
    expect(Object.values(permissionsFor("owner", true)).every(Boolean)).toBe(true);
  });
  it("Pro staff: create and record payments, but no revenue, edits, deletes, settings, expenses or staff", () => {
    const p = permissionsFor("staff", true);
    expect(p).toMatchObject({ trackDebts: true, quotes: true, payLinks: true });
    expect(p).toMatchObject({
      viewRevenue: false,
      editRecords: false,
      manageBusiness: false,
      expenses: false,
      manageStaff: false,
    });
  });
});
