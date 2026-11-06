import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, asService, freshDb, makeUser, one, type TestUser } from "./harness";

const invoice = {
  type: "invoice", issueDate: "2026-10-01", dueDate: "2026-10-08", customer: { name: "Funke", phone: "" },
  items: [{ id: "a", description: "Braids", quantity: 1, unitPriceKobo: 4_500_000 }], discount: null,
  deliveryKobo: 0, vatEnabled: false, status: "unpaid", amountPaidKobo: 0, method: "transfer", notes: "", templateId: "classic",
};

describe("Pay Now links", () => {
  let db: PGlite;
  let owner: TestUser;
  let bid: string;
  let invId: string;

  beforeAll(async () => {
    db = await freshDb();
    owner = await makeUser(db, "kemi@hair.ng");
    await as(db, owner);
    bid = (await one<{ id: string }>(db, "select public.create_business('{\"name\":\"Kemi Hair\"}', 'Kemi') as id")).id;
    invId = (await one<{ d: { id: string } }>(db, "select public.create_document($1, $2, 4500000, 0) as d", [bid, JSON.stringify(invoice)])).d.id;
  }, 60_000);

  it("needs Pro", async () => {
    await as(db, owner);
    await expect(db.query("select public.create_pay_link($1)", [invId])).rejects.toThrow(/pro_required/);
  });

  it("needs a payout account", async () => {
    await asService(db);
    await db.query("update public.business_billing set comp = true where business_id = $1", [bid]);
    await as(db, owner);
    await expect(db.query("select public.create_pay_link($1)", [invId])).rejects.toThrow(/payouts_not_connected/);
    const access = await one<{ a: { payouts_connected: boolean } }>(db, "select public.my_access($1) as a", [bid]);
    expect(access.a.payouts_connected).toBe(false);
  });

  it("creates one stable link per invoice", async () => {
    await asService(db);
    await db.query(
      "insert into public.business_payouts (business_id, subaccount_code, bank_code, bank_name, account_number, account_name) values ($1, 'ACCT_x', '058', 'GTBank', '0123456789', 'KEMI HAIR')",
      [bid],
    );
    await as(db, owner);
    const a = await one<{ t: string }>(db, "select public.create_pay_link($1) as t", [invId]);
    const b = await one<{ t: string }>(db, "select public.create_pay_link($1) as t", [invId]);
    expect(a.t).toMatch(/^[a-f0-9]{14}$/);
    expect(b.t).toBe(a.t);
    const d = await one<{ tok: string }>(db, "select data->>'payToken' as tok from public.documents where id = $1", [invId]);
    expect(d.tok).toBe(a.t);
    expect((await one<{ a: { payouts_connected: boolean } }>(db, "select public.my_access($1) as a", [bid])).a.payouts_connected).toBe(true);
  });

  it("online payments mark the invoice part-paid then paid; a repeated webhook counts once", async () => {
    await asService(db);
    const pay = (ref: string, amount: number) =>
      db.query(
        "insert into public.payments (business_id, document_id, amount_kobo, method, paid_on, kind, source, reference) values ($1, $2, $3, 'online', '2026-10-02', 'payment', 'paystack', $4) on conflict (reference) do nothing",
        [bid, invId, amount, ref],
      );
    await pay("INC-1", 2_000_000);
    let d = await one<{ status: string; amount_paid_kobo: string }>(db, "select status, amount_paid_kobo from public.documents where id = $1", [invId]);
    expect(d.status).toBe("part");
    await pay("INC-1", 2_000_000); // same reference again
    await pay("INC-2", 2_500_000);
    d = await one(db, "select status, amount_paid_kobo from public.documents where id = $1", [invId]);
    expect(d.status).toBe("paid");
    expect(Number(d.amount_paid_kobo)).toBe(4_500_000);
  });

  it("fully paid invoices can't get a new link", async () => {
    await as(db, owner);
    const inv2 = (await one<{ d: { id: string } }>(db, "select public.create_document($1, $2, 1000, 1000) as d", [bid, JSON.stringify({ ...invoice, status: "paid" })])).d.id;
    await expect(db.query("select public.create_pay_link($1)", [inv2])).rejects.toThrow(/nothing_to_pay/);
  });

  it("customers can't read invoices directly (anonymous)", async () => {
    await as(db, null);
    await expect(db.query("select * from public.documents")).rejects.toThrow();
  });
});
