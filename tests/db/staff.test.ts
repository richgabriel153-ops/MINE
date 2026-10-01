import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, asService, freshDb, makeUser, one, type TestUser } from "./harness";

const receipt = {
  type: "receipt", issueDate: "2026-10-01", dueDate: null, customer: { name: "A", phone: "" },
  items: [{ id: "a", description: "Phone case", quantity: 1, unitPriceKobo: 500_000 }], discount: null,
  deliveryKobo: 0, vatEnabled: false, status: "paid", amountPaidKobo: 0, method: "cash", notes: "", templateId: "classic",
};

describe("staff accounts", () => {
  let db: PGlite;
  let owner: TestUser, staff: TestUser, other: TestUser;
  let bid: string;
  let memberId: string;

  beforeAll(async () => {
    db = await freshDb();
    owner = await makeUser(db, "tunde@gadgets.ng");
    staff = await makeUser(db, "sade@gadgets.ng");
    other = await makeUser(db, "x@y.ng");
    await as(db, owner);
    bid = (await one<{ id: string }>(db, "select public.create_business('{\"name\":\"Tunde Gadgets\"}', 'Tunde') as id")).id;
  }, 60_000);

  it("inviting staff is Pro-only", async () => {
    await as(db, owner);
    await expect(db.query("select public.invite_staff($1, 'sade@gadgets.ng', 'Sade')", [bid])).rejects.toThrow(/pro_required/);
  });

  it("owner invites; staff joins by signing in with that email", async () => {
    await asService(db);
    await db.query("update public.business_billing set status='active', plan='yearly', current_period_end = now() + interval '200 days' where business_id = $1", [bid]);
    await as(db, owner);
    memberId = (await one<{ id: string }>(db, "select public.invite_staff($1, ' Sade@Gadgets.ng ', 'Sade') as id", [bid])).id;
    await as(db, staff);
    const mine = await db.query<{ role: string; status: string }>("select * from public.my_businesses()");
    expect(mine.rows[0]).toMatchObject({ role: "staff", status: "active" });
  });

  it("only the owner can invite or turn access off", async () => {
    await as(db, staff);
    await expect(db.query("select public.invite_staff($1, 'z@z.ng', 'Z')", [bid])).rejects.toThrow(/owner_only/);
    await expect(db.query("select public.set_staff_active($1, false)", [memberId])).rejects.toThrow(/owner_only/);
    await as(db, other);
    await expect(db.query("select public.invite_staff($1, 'z@z.ng', 'Z')", [bid])).rejects.toThrow(/owner_only/);
  });

  it("records show who created them", async () => {
    await as(db, staff);
    const d = await one<{ d: { created_by_name: string; data: { createdByName: string } } }>(
      db, "select public.create_document($1, $2, 500000, 500000) as d", [bid, JSON.stringify(receipt)]);
    expect(d.d.created_by_name).toBe("Sade");
    expect(d.d.data.createdByName).toBe("Sade");
  });

  it("deactivated staff lose access at once; their records stay", async () => {
    await as(db, owner);
    await db.query("select public.set_staff_active($1, false)", [memberId]);
    await as(db, staff);
    expect((await db.query("select * from public.documents")).rows).toHaveLength(0);
    await expect(db.query("select public.create_document($1, $2, 1, 1)", [bid, JSON.stringify(receipt)])).rejects.toThrow(/not_member/);
    await as(db, owner);
    const kept = await db.query("select * from public.documents where created_by_name = 'Sade'");
    expect(kept.rows).toHaveLength(1);
    const log = await db.query<{ action: string }>("select action from public.activity_log where business_id = $1 order by id", [bid]);
    expect(log.rows.map((r) => r.action)).toEqual(expect.arrayContaining(["staff_invite", "create", "staff_deactivate"]));
  });

  it("reactivating restores access", async () => {
    await as(db, owner);
    await db.query("select public.set_staff_active($1, true)", [memberId]);
    await as(db, staff);
    expect((await db.query("select * from public.documents")).rows.length).toBeGreaterThan(0);
  });

  it("the owner can't be deactivated", async () => {
    await as(db, owner);
    const ownerMember = await one<{ id: string }>(db, "select id from public.members where role = 'owner'");
    await expect(db.query("select public.set_staff_active($1, false)", [ownerMember.id])).rejects.toThrow(/is_owner/);
  });

  it("payment history is owner-only", async () => {
    await as(db, owner);
    const doc = await one<{ id: string }>(db, "select id from public.documents limit 1");
    expect((await db.query("select * from public.document_payments($1)", [doc.id])).rows.length).toBe(1);
    await as(db, staff);
    expect((await db.query("select * from public.document_payments($1)", [doc.id])).rows.length).toBe(0);
  });
});
