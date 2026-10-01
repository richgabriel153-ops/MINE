import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, asService, freshDb, makeUser, one, type TestUser } from "./harness";

const quote = {
  type: "quote", issueDate: "2026-10-01", dueDate: "2026-10-15", customer: { name: "Tunde", phone: "" },
  items: [{ id: "a", description: "Bags", quantity: 10, unitPriceKobo: 120_000 }], discount: null,
  deliveryKobo: 0, vatEnabled: false, status: "unpaid", amountPaidKobo: 0, method: "transfer", notes: "", templateId: "classic",
  quoteTitle: "proforma", quoteStatus: "draft",
};

describe("quotations", () => {
  let db: PGlite;
  let owner: TestUser, staff: TestUser;
  let bid: string;
  let qid: string;

  beforeAll(async () => {
    db = await freshDb();
    owner = await makeUser(db, "o@q.ng");
    staff = await makeUser(db, "s@q.ng");
    await as(db, owner);
    bid = (await one<{ id: string }>(db, "select public.create_business('{\"name\":\"Q\"}', 'O') as id")).id;
    await asService(db);
    await db.query("update public.business_billing set comp = true where business_id = $1", [bid]);
    await db.query("insert into public.members (business_id, user_id, email, role, status) values ($1, $2, 's@q.ng', 'staff', 'active')", [bid, staff.id]);
  }, 60_000);

  it("quotes get their own numbers", async () => {
    await as(db, staff);
    const q = await one<{ d: { id: string; number: string; status: string } }>(db, "select public.create_document($1, $2, 1200000, 0) as d", [bid, JSON.stringify(quote)]);
    expect(q.d.number).toBe("QUO-0001");
    qid = q.d.id;
  });

  it("status changes (staff allowed) and quotes never carry payments", async () => {
    await as(db, staff);
    const q = await one<{ d: { data: { quoteStatus: string }; amount_paid_kobo: string } }>(db, "select public.set_quote_status($1, 'sent') as d", [qid]);
    expect(q.d.data.quoteStatus).toBe("sent");
    await expect(db.query("select public.record_payment($1, 100, 'cash', '2026-10-02')", [qid])).rejects.toThrow(/bad_type|bad_amount/);
    await expect(db.query("select public.set_quote_status($1, 'paid')", [qid])).rejects.toThrow(/bad_status/);
  });

  it("convert to invoice copies everything and links both ways", async () => {
    await as(db, staff);
    const inv = await one<{ d: { id: string; number: string; total_kobo: string; status: string; data: Record<string, unknown> } }>(
      db, "select public.convert_quote($1, '2026-10-05', 7) as d", [qid]);
    expect(inv.d.number).toBe("INV-0001");
    expect(inv.d.status).toBe("unpaid");
    expect(Number(inv.d.total_kobo)).toBe(1_200_000);
    expect(inv.d.data).toMatchObject({ type: "invoice", issueDate: "2026-10-05", dueDate: "2026-10-12", sourceQuoteNumber: "QUO-0001" });
    expect(inv.d.data.quoteTitle).toBeUndefined();
    const q = await one<{ inv: string; st: string }>(db, "select data->>'invoiceNumber' as inv, data->>'quoteStatus' as st from public.documents where id = $1", [qid]);
    expect(q).toEqual({ inv: "INV-0001", st: "accepted" });
    await expect(db.query("select public.convert_quote($1, '2026-10-05', 7)", [qid])).rejects.toThrow(/already_converted/);
  });

  it("owner edits keep links (merge, not replace)", async () => {
    await as(db, owner);
    const q = await one<{ d: { data: Record<string, unknown> } }>(db, "select public.update_document($1, $2, 1300000, 0) as d", [qid, JSON.stringify({ ...quote, notes: "Updated" })]);
    expect(q.d.data).toMatchObject({ notes: "Updated", invoiceNumber: "INV-0001" });
  });

  it("free businesses can't make or convert quotes", async () => {
    await asService(db);
    await db.query("update public.business_billing set comp = false where business_id = $1", [bid]);
    await as(db, owner);
    await expect(db.query("select public.create_document($1, $2, 1, 0)", [bid, JSON.stringify(quote)])).rejects.toThrow(/pro_required/);
    await expect(db.query("select public.set_quote_status($1, 'sent')", [qid])).rejects.toThrow(/pro_required/);
  });
});
