import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { computeTotals } from "@/lib/totals";
import { as, asService, freshDb, makeUser, one, type TestUser } from "./harness";

const baseDoc = (over: Record<string, unknown> = {}) => ({
  type: "receipt", issueDate: "2026-11-02", dueDate: null, customer: { name: "Ada Okafor", phone: "+2348031234567" },
  items: [{ id: "a", description: "Rice (50kg)", quantity: 2, unitPriceKobo: 4_500_000 }], discount: null,
  deliveryKobo: 0, vatEnabled: false, status: "paid", amountPaidKobo: 0, method: "transfer", notes: "", templateId: "classic",
  ...over,
});

// Small deterministic random generator so failures can be reproduced.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

describe("beta hardening", () => {
  let db: PGlite;
  let owner: TestUser, staff: TestUser, other: TestUser;
  let bid: string, bid2: string;

  beforeAll(async () => {
    db = await freshDb();
    owner = await makeUser(db, "owner@shop.ng");
    staff = await makeUser(db, "staff@shop.ng");
    other = await makeUser(db, "other@shop.ng");
    await as(db, owner);
    bid = (await one<{ id: string }>(db, "select public.create_business('{\"name\":\"Ada Fabrics\"}', 'Ada') as id")).id;
    await as(db, other);
    bid2 = (await one<{ id: string }>(db, "select public.create_business('{\"name\":\"Other\"}', 'O') as id")).id;
    await asService(db);
    await db.query("update public.business_billing set comp = true where business_id = $1", [bid]);
    await db.query("insert into public.members (business_id, user_id, email, role, status) values ($1, $2, 'staff@shop.ng', 'staff', 'active')", [bid, staff.id]);
  }, 60_000);

  it("database totals match the app's totals to the kobo (300 random documents)", async () => {
    const r = rng(42);
    const int = (max: number) => Math.floor(r() * max);
    await asService(db);
    for (let i = 0; i < 300; i++) {
      const items = Array.from({ length: 1 + int(5) }, (_, j) => ({
        id: String(j),
        description: "x",
        quantity: Math.round((0.01 + r() * 50) * 100) / 100,
        unitPriceKobo: int(10_000_000) + (r() < 0.3 ? int(100) : 0),
      }));
      const discount = r() < 0.33 ? { type: "amount" as const, kobo: int(5_000_000) } : r() < 0.5 ? { type: "percent" as const, percent: Math.round(r() * 10000) / 100 } : null;
      const status = (["paid", "unpaid", "part"] as const)[int(3)];
      const doc = baseDoc({ items, discount, deliveryKobo: r() < 0.5 ? int(500_000) : 0, vatEnabled: r() < 0.5, status, amountPaidKobo: int(20_000_000) });
      const js = computeTotals(doc as never);
      const sql = await one<{ total_kobo: string; paid_kobo: string; subtotal_kobo: string }>(db, "select * from public._doc_totals($1)", [JSON.stringify(doc)]);
      expect({ i, sub: Number(sql.subtotal_kobo), total: Number(sql.total_kobo), paid: Number(sql.paid_kobo) }).toEqual({
        i, sub: js.subtotalKobo, total: js.totalKobo, paid: js.amountPaidKobo,
      });
    }
  });

  it("ignores totals sent by the phone and stores the real ones", async () => {
    await as(db, staff);
    const d = await one<{ d: { total_kobo: string; amount_paid_kobo: string; number: string } }>(
      db, "select public.create_document($1, $2, 1, 999999999) as d",
      [bid, JSON.stringify(baseDoc({ vatEnabled: true, discount: { type: "percent", percent: 10 }, deliveryKobo: 150_000 }))]);
    // 2 × ₦45,000 = ₦90,000; −10% = ₦81,000; +7.5% VAT = ₦87,075; + ₦1,500 delivery = ₦88,575
    expect(Number(d.d.total_kobo)).toBe(8_857_500);
    expect(Number(d.d.amount_paid_kobo)).toBe(8_857_500);
    expect(d.d.number).toBe("RCT-0001");
  });

  it("rejects bad input with a clear reason", async () => {
    await as(db, owner);
    const bad = async (over: Record<string, unknown>) =>
      db.query("select public.create_document($1, $2, 0, 0)", [bid, JSON.stringify(baseDoc(over))]);
    await expect(bad({ items: [] })).rejects.toThrow(/invalid_input:items/);
    await expect(bad({ items: [{ description: "", quantity: 1, unitPriceKobo: 100 }] })).rejects.toThrow(/item_description/);
    await expect(bad({ items: [{ description: "A", quantity: -1, unitPriceKobo: 100 }] })).rejects.toThrow(/item_quantity/);
    await expect(bad({ items: [{ description: "A", quantity: 1, unitPriceKobo: 10.5 }] })).rejects.toThrow(/item_price/);
    await expect(bad({ customer: { name: "A", phone: "12345" } })).rejects.toThrow(/customer_phone/);
    await expect(bad({ discount: { type: "percent", percent: 150 } })).rejects.toThrow(/discount/);
    await expect(bad({ status: "part", amountPaidKobo: 99_000_000 })).rejects.toThrow(/amount_paid/);
    await expect(bad({ method: "bitcoin" })).rejects.toThrow(/method/);
    await expect(bad({ issueDate: "2026-02-30" })).rejects.toThrow(/date/);
    await expect(bad({ type: "invoice", dueDate: "2026-01-01" })).rejects.toThrow(/due_date/);
    await expect(bad({ notes: "x".repeat(1001) })).rejects.toThrow(/notes/);
    await expect(bad({ templateId: "<script>" })).rejects.toThrow(/template/);
    await expect(bad({ notes: "y".repeat(900), items: Array.from({ length: 201 }, () => ({ description: "A", quantity: 1, unitPriceKobo: 1 })) })).rejects.toThrow(/items|too_large/);
  });

  it("business details are checked too", async () => {
    await as(db, owner);
    const save = (p: Record<string, unknown>) => db.query("select public.update_business_profile($1, $2)", [bid, JSON.stringify({ name: "Ada", ...p })]);
    await expect(save({ logo: "javascript:alert(1)" })).rejects.toThrow(/logo/);
    await expect(save({ brandColor: "red;background:url(x)" })).rejects.toThrow(/brand_color/);
    await expect(save({ accountNumber: "12" })).rejects.toThrow(/account_number/);
    await expect(save({ logo: "data:image/png;base64," + "A".repeat(500_000) })).rejects.toThrow(/logo_too_large/);
    await save({ logo: "data:image/webp;base64,AAAA", brandColor: "#1f6f4a", accountNumber: "0123456789" });
  });

  it("editing keeps the number, recalculates and keeps links; copies get the next number", async () => {
    await as(db, owner);
    const a = await one<{ d: { id: string; number: string } }>(db, "select public.create_document($1, $2, 0, 0) as d",
      [bid, JSON.stringify(baseDoc({ type: "invoice", status: "unpaid", dueDate: "2026-11-09" }))]);
    await asService(db);
    await db.query("update public.documents set data = data || '{\"payToken\":\"tok123\"}' where id = $1", [a.d.id]);
    await as(db, owner);
    const e = await one<{ d: { number: string; total_kobo: string; data: Record<string, unknown> } }>(
      db, "select public.update_document($1, $2, 5, 5) as d",
      [a.d.id, JSON.stringify(baseDoc({ type: "receipt", status: "unpaid", dueDate: "2026-11-09", payToken: "hacked", items: [{ description: "B", quantity: 3, unitPriceKobo: 100_000 }] }))]);
    expect(e.d.number).toBe(a.d.number);
    expect(e.d.data.type).toBe("invoice"); // type can't be changed by an edit
    expect(Number(e.d.total_kobo)).toBe(300_000);
    expect(e.d.data.payToken).toBe("tok123"); // links can't be overwritten
    const copy = await one<{ d: { number: string } }>(db, "select public.create_document($1, $2, 0, 0) as d",
      [bid, JSON.stringify(baseDoc({ type: "invoice", status: "unpaid", dueDate: "2026-11-09", number: "INV-0001", id: a.d.id }))]);
    expect(copy.d.number).toBe("INV-0002");
  });

  it("numbers stay unique when many saves happen", async () => {
    await as(db, owner);
    const nums: string[] = [];
    for (let i = 0; i < 25; i++) {
      nums.push((await one<{ n: string }>(db, "select (public.create_document($1, $2, 0, 0)) ->> 'number' as n", [bid, JSON.stringify(baseDoc())])).n);
    }
    expect(new Set(nums).size).toBe(25);
    const dup = await one<{ c: string }>(db, "select count(*) - count(distinct number) as c from public.documents where business_id = $1", [bid]);
    expect(Number(dup.c)).toBe(0);
  });

  it("customers: one per phone, linked to documents, private to the business", async () => {
    await as(db, owner);
    const c = await db.query<{ name: string; phone: string }>("select name, phone from public.customers where business_id = $1", [bid]);
    expect(c.rows).toEqual([{ name: "Ada Okafor", phone: "+2348031234567" }]);
    const linked = await one<{ n: string }>(db, "select count(*) as n from public.documents where business_id = $1 and customer_id is null", [bid]);
    expect(Number(linked.n)).toBe(0);
    await as(db, other);
    expect((await db.query("select * from public.customers")).rows).toHaveLength(0);
    await expect(db.query("select public.save_customer($1, null, 'Sneaky', '')", [bid])).rejects.toThrow(/not_member/);
    await expect(db.query("insert into public.customers (business_id, name) values ($1, 'x')", [bid])).rejects.toThrow(/permission denied|row-level/);
    await as(db, staff);
    const id = (await one<{ id: string }>(db, "select public.save_customer($1, null, 'Tunde', '+2348091112233') as id", [bid])).id;
    await expect(db.query("select public.delete_customer($1)", [id])).rejects.toThrow(/owner_only/);
  });

  it("home totals come from the database, owner only", async () => {
    await as(db, owner);
    const s = (await one<{ s: Record<string, number> }>(db, "select public.business_summary($1, '2026-11-04') as s", [bid])).s;
    // Unpaid: INV-0001 (₦3,000 after the edit) and its copy INV-0002 (₦90,000).
    expect(Number(s.owing_kobo)).toBe(9_300_000);
    expect(Number(s.owing_count)).toBe(2);
    expect(Number(s.week_kobo)).toBeGreaterThan(0);
    await as(db, staff);
    await expect(db.query("select public.business_summary($1, '2026-11-04')", [bid])).rejects.toThrow(/owner_only/);
  });

  it("beta codes give Pro, once per business, within limits", async () => {
    const redeem = async (b: string, code: string) =>
      (await one<{ r: string }>(db, "select public.redeem_beta_code($1, $2) as r", [b, code])).r;
    await asService(db);
    await db.query("insert into public.beta_codes (code, max_uses) values ('BETA-TEN', 1)");
    await as(db, other);
    await expect(db.query("select * from public.beta_codes")).rejects.toThrow(/permission denied/);
    expect(await redeem(bid2, "NOPE")).toBe("invalid_code");
    expect(await redeem(bid2, " beta-ten ")).toBe("ok");
    expect((await one<{ p: boolean }>(db, "select public.is_pro($1) as p", [bid2])).p).toBe(true);
    expect(await redeem(bid2, "BETA-TEN")).toBe("ok"); // same business again: fine, not counted twice
    await as(db, owner);
    expect(await redeem(bid, "BETA-TEN")).toBe("code_used_up");
    await expect(db.query("select public.redeem_beta_code($1, 'X')", [bid2])).rejects.toThrow(/owner_only|not_member/);
    // 10 tries an hour per person (1 used above): the 11th is refused, even with a right code.
    for (let i = 0; i < 9; i++) expect(await redeem(bid, "WRONG" + i)).toBe("invalid_code");
    expect(await redeem(bid, "BETA-TEN")).toBe("rate_limited");
  });

  it("export my data, consent, and account deletion (server only)", async () => {
    await as(db, owner);
    await db.query("select public.record_consent('2026-11-04')");
    const x = (await one<{ x: { businesses: { documents: unknown[]; customers: unknown[] }[]; consents: unknown[]; account: { email: string } } }>(
      db, "select public.export_my_data() as x")).x;
    expect(x.account.email).toBe("owner@shop.ng");
    expect(x.consents).toHaveLength(2);
    expect(x.businesses[0].documents.length).toBeGreaterThan(25);
    expect(x.businesses[0].customers.length).toBeGreaterThan(0);
    await expect(db.query("select public.delete_account_data($1)", [owner.id])).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.rate_limit_hit('x', 60, 5)")).rejects.toThrow(/permission denied/);
    await asService(db);
    const del = (await one<{ r: { deleted_businesses: string[] } }>(db, "select public.delete_account_data($1) as r", [owner.id])).r;
    expect(del.deleted_businesses).toEqual([bid]);
    const left = await one<{ n: string }>(db, "select count(*) as n from public.documents where business_id = $1", [bid]);
    expect(Number(left.n)).toBe(0);
    const still = await one<{ n: string }>(db, "select count(*) as n from public.businesses where id = $1", [bid2]);
    expect(Number(still.n)).toBe(1);
  });

  it("logged-out visitors have no access at all", async () => {
    await as(db, null);
    for (const t of ["documents", "businesses", "customers", "payments", "members", "business_billing", "expenses", "beta_codes"]) {
      await expect(db.query(`select count(*) from public.${t}`)).rejects.toThrow(/permission denied/);
    }
    await expect(db.query("select public.export_my_data()")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.member_role(gen_random_uuid())")).rejects.toThrow(/permission denied/);
  });
});
