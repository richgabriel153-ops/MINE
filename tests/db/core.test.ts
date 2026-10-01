import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, asService, freshDb, makeUser, one, type TestUser } from "./harness";

const doc = (p: Record<string, unknown> = {}) => ({
  type: "receipt",
  issueDate: "2026-10-01",
  dueDate: null,
  customer: { name: "Bisi", phone: "" },
  items: [{ id: "a", description: "Gown", quantity: 1, unitPriceKobo: 5_000_000 }],
  discount: null,
  deliveryKobo: 0,
  vatEnabled: false,
  status: "paid",
  amountPaidKobo: 0,
  method: "transfer",
  notes: "",
  templateId: "classic",
  ...p,
});

describe("core schema", () => {
  let db: PGlite;
  let owner: TestUser, staff: TestUser, stranger: TestUser;
  let bid: string;

  beforeAll(async () => {
    db = await freshDb();
    owner = await makeUser(db, "ada@shop.ng");
    staff = await makeUser(db, "tolu@shop.ng");
    stranger = await makeUser(db, "x@else.ng");
    await as(db, owner);
    bid = (await one<{ id: string }>(db, "select public.create_business($1, 'Ada') as id", [JSON.stringify({ name: "Ada's Shop" })])).id;
  }, 60_000);

  it("owner creates numbered receipts; payments keep the status in step", async () => {
    await as(db, owner);
    const r1 = await one<{ d: { number: string; status: string; amount_paid_kobo: number } }>(
      db, "select public.create_document($1, $2, 5000000, 5000000) as d", [bid, JSON.stringify(doc())]);
    expect(r1.d.number).toBe("RCT-0001");
    expect(r1.d.status).toBe("paid");
    expect(Number(r1.d.amount_paid_kobo)).toBe(5_000_000);
    const inv = await one<{ d: { number: string; status: string } }>(
      db, "select public.create_document($1, $2, 5000000, 0) as d", [bid, JSON.stringify(doc({ type: "invoice", status: "unpaid" }))]);
    expect(inv.d.number).toBe("INV-0001");
    expect(inv.d.status).toBe("unpaid");
  });

  it("free businesses can't record part payments or quotes", async () => {
    await as(db, owner);
    await expect(db.query("select public.create_document($1, $2, 5000000, 1000000)", [bid, JSON.stringify(doc({ status: "part" }))])).rejects.toThrow(/pro_required/);
    await expect(db.query("select public.create_document($1, $2, 100, 0)", [bid, JSON.stringify(doc({ type: "quote" }))])).rejects.toThrow(/pro_required/);
  });

  it("strangers see nothing and can't write", async () => {
    await as(db, stranger);
    expect((await db.query("select * from public.documents")).rows).toHaveLength(0);
    expect((await db.query("select * from public.businesses")).rows).toHaveLength(0);
    await expect(db.query("select public.create_document($1, $2, 1, 1)", [bid, JSON.stringify(doc())])).rejects.toThrow(/not_member/);
    await expect(db.query("insert into public.documents (business_id, type, number, issue_date, status, data) values ($1, 'receipt', 'X', now(), 'paid', '{}')", [bid])).rejects.toThrow();
  });

  it("marking an invoice paid records the balance and makes a linked receipt", async () => {
    await as(db, owner);
    const inv = await one<{ id: string }>(db, "select id from public.documents where number = 'INV-0001'");
    const rct = await one<{ d: { number: string; data: { sourceInvoiceNumber: string } } }>(
      db, "select public.mark_invoice_paid($1, 'cash', '2026-10-02') as d", [inv.id]);
    expect(rct.d.number).toBe("RCT-0002");
    expect(rct.d.data.sourceInvoiceNumber).toBe("INV-0001");
    const after = await one<{ status: string; amount_paid_kobo: string; receipt: string }>(
      db, "select status, amount_paid_kobo, data->>'receiptId' as receipt from public.documents where id = $1", [inv.id]);
    expect(after.status).toBe("paid");
    expect(Number(after.amount_paid_kobo)).toBe(5_000_000);
    expect(after.receipt).toBeTruthy();
    // Money is counted once: the invoice's payment, not the receipt.
    const total = await one<{ s: string }>(db, "select sum(amount_kobo) as s from public.payments where business_id = $1", [bid]);
    expect(Number(total.s)).toBe(10_000_000);
  });

  it("importing phone records keeps ids, numbers and raises counters", async () => {
    await as(db, owner);
    const local = { ...doc({ status: "part", amountPaidKobo: 2_000_000 }), id: "11111111-1111-4111-8111-111111111111", number: "RCT-0009", createdAt: "2026-09-01T10:00:00Z" };
    const added = await one<{ n: number }>(db, "select public.import_local($1, $2, $3) as n", [
      bid, JSON.stringify([{ doc: local, total: 5_000_000, paid: 2_000_000 }]), JSON.stringify({ receipt: 9, invoice: 1 })]);
    expect(added.n).toBe(1);
    const d = await one<{ status: string; amount_paid_kobo: string }>(db, "select status, amount_paid_kobo from public.documents where number = 'RCT-0009'");
    expect(d.status).toBe("part");
    expect(Number(d.amount_paid_kobo)).toBe(2_000_000);
    const next = await one<{ d: { number: string } }>(db, "select public.create_document($1, $2, 100, 100) as d", [bid, JSON.stringify(doc())]);
    expect(next.d.number).toBe("RCT-0010");
  });

  it("owner can delete; deleting a receipt made from an invoice unlinks it", async () => {
    await as(db, owner);
    const rct = await one<{ id: string }>(db, "select id from public.documents where number = 'RCT-0002'");
    expect((await one<{ ok: boolean }>(db, "select public.delete_document($1) as ok", [rct.id])).ok).toBe(true);
    const inv = await one<{ receipt: string | null }>(db, "select data->>'receiptId' as receipt from public.documents where number = 'INV-0001'");
    expect(inv.receipt).toBeNull();
  });

  it("staff only count while the business is Pro", async () => {
    await asService(db);
    await db.query("insert into public.members (business_id, email, role, status) values ($1, 'tolu@shop.ng', 'staff', 'invited')", [bid]);
    await as(db, staff);
    const mine = await db.query("select * from public.my_businesses()");
    expect(mine.rows).toHaveLength(1); // invite linked to their account
    expect((await db.query("select * from public.documents")).rows).toHaveLength(0); // not Pro yet
    await asService(db);
    await db.query("update public.business_billing set status = 'active', plan = 'monthly', current_period_end = now() + interval '20 days' where business_id = $1", [bid]);
    await as(db, staff);
    expect((await db.query("select * from public.documents")).rows.length).toBeGreaterThan(0);
  });

  it("staff can create and record payments but not edit, delete or see revenue", async () => {
    await as(db, staff);
    const inv = await one<{ d: { id: string; created_by_name: string } }>(
      db, "select public.create_document($1, $2, 3000000, 0) as d", [bid, JSON.stringify(doc({ type: "invoice", status: "unpaid" }))]);
    const paid = await one<{ d: { status: string } }>(db, "select public.record_payment($1, 1000000, 'cash', '2026-10-03') as d", [inv.d.id]);
    expect(paid.d.status).toBe("part");
    await expect(db.query("select public.update_document($1, $2, 1, 0)", [inv.d.id, JSON.stringify(doc())])).rejects.toThrow(/owner_only/);
    expect((await one<{ ok: boolean }>(db, "select public.delete_document($1) as ok", [inv.d.id])).ok).toBe(false);
    expect((await db.query("select * from public.payments")).rows).toHaveLength(0);
    expect((await db.query("select * from public.activity_log")).rows).toHaveLength(0);
    await as(db, owner);
    const attempt = await one<{ actor_name: string; summary: string }>(
      db, "select actor_name, summary from public.activity_log where action = 'delete_attempt' order by id desc limit 1");
    expect(attempt.summary).toMatch(/Tried to delete INV-/);
    expect(attempt.actor_name).toBe("tolu@shop.ng");
  });

  it("Pro ends 3 days after the paid period ends", async () => {
    await asService(db);
    await db.query("update public.business_billing set current_period_end = now() - interval '2 days' where business_id = $1", [bid]);
    expect((await one<{ p: boolean }>(db, "select public.is_pro($1) as p", [bid])).p).toBe(true);
    await db.query("update public.business_billing set current_period_end = now() - interval '4 days' where business_id = $1", [bid]);
    expect((await one<{ p: boolean }>(db, "select public.is_pro($1) as p", [bid])).p).toBe(false);
  });
});
