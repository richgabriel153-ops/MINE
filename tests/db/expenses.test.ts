import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, asService, freshDb, makeUser, one, type TestUser } from "./harness";

describe("expenses", () => {
  let db: PGlite;
  let owner: TestUser, staff: TestUser;
  let bid: string;

  beforeAll(async () => {
    db = await freshDb();
    owner = await makeUser(db, "chi@food.ng");
    staff = await makeUser(db, "ike@food.ng");
    await as(db, owner);
    bid = (await one<{ id: string }>(db, "select public.create_business('{\"name\":\"Chi Foods\"}', 'Chi') as id")).id;
  }, 60_000);

  const add = (amount = 250_000, category = "Fuel") =>
    db.query("insert into public.expenses (business_id, amount_kobo, category, spent_on, created_by_name) values ($1, $2, $3, '2026-10-01', 'Chi') returning id", [bid, amount, category]);

  it("needs Pro to add", async () => {
    await as(db, owner);
    await expect(add()).rejects.toThrow();
  });

  it("owner on Pro adds, edits and deletes; each is logged", async () => {
    await asService(db);
    await db.query("update public.business_billing set comp = true where business_id = $1", [bid]);
    await db.query("insert into public.members (business_id, user_id, email, role, status) values ($1, $2, 'ike@food.ng', 'staff', 'active')", [bid, staff.id]);
    await as(db, owner);
    const id = (await add()).rows[0] as { id: string };
    await db.query("update public.expenses set amount_kobo = 300000 where id = $1", [id.id]);
    const e = await one<{ amount_kobo: string }>(db, "select amount_kobo from public.expenses where id = $1", [id.id]);
    expect(Number(e.amount_kobo)).toBe(300_000);
    await add(1_000_000, "Stock");
    await db.query("delete from public.expenses where id = $1", [id.id]);
    const log = await db.query<{ action: string; summary: string }>("select action, summary from public.activity_log where entity_type = 'expense' order by id");
    expect(log.rows.map((r) => r.action)).toEqual(["expense_create", "expense_edit", "expense_create", "expense_delete"]);
    expect(log.rows[0].summary).toBe("Logged an expense of ₦2,500.00 (Fuel)");
  });

  it("staff can't see or add expenses", async () => {
    await as(db, staff);
    expect((await db.query("select * from public.expenses")).rows).toHaveLength(0);
    await expect(add()).rejects.toThrow();
  });

  it("after Pro ends the owner can still read expenses but not add", async () => {
    await asService(db);
    await db.query("update public.business_billing set comp = false where business_id = $1", [bid]);
    await as(db, owner);
    expect((await db.query("select * from public.expenses")).rows).toHaveLength(1);
    await expect(add()).rejects.toThrow();
  });

  it("custom categories are owner-only", async () => {
    await as(db, owner);
    await db.query("select public.set_expense_categories($1, '[\"Packaging\"]')", [bid]);
    const s = await one<{ c: string[] }>(db, "select settings->'expenseCategories' as c from public.businesses where id = $1", [bid]);
    expect(s.c).toEqual(["Packaging"]);
    await asService(db);
    await db.query("update public.business_billing set comp = true where business_id = $1", [bid]);
    await as(db, staff);
    await expect(db.query("select public.set_expense_categories($1, '[]')", [bid])).rejects.toThrow(/owner_only/);
  });

  it("photos: owner of that business only", async () => {
    await as(db, owner);
    await db.query("insert into storage.objects (bucket_id, name) values ('expense-photos', $1)", [`${bid}/x.jpg`]);
    await as(db, staff);
    await expect(db.query("insert into storage.objects (bucket_id, name) values ('expense-photos', $1)", [`${bid}/y.jpg`])).rejects.toThrow();
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(0);
  });
});
