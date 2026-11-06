import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, asService, freshDb, makeUser, one, type TestUser } from "./harness";

describe("assistant usage and admin dashboard", () => {
  let db: PGlite;
  let owner: TestUser, other: TestUser;
  let bid: string, bid2: string;

  beforeAll(async () => {
    db = await freshDb();
    owner = await makeUser(db, "ada@shop.ng");
    other = await makeUser(db, "bayo@shop.ng");
    await as(db, owner);
    bid = (await one<{ id: string }>(db, "select public.create_business('{\"name\":\"Ada Fabrics\"}', 'Ada') as id")).id;
    await as(db, other);
    bid2 = (await one<{ id: string }>(db, "select public.create_business('{\"name\":\"Bayo Foods\"}', 'Bayo') as id")).id;
    await asService(db);
    await db.query("update public.business_billing set plan = 'yearly', status = 'active', current_period_end = now() + interval '200 days' where business_id = $1", [bid]);
  }, 60_000);

  it("daily message limit", async () => {
    await asService(db);
    const take = async () => (await one<{ n: number }>(db, "select public.agent_take_message($1, 2) as n", [bid])).n;
    expect(await take()).toBe(1);
    expect(await take()).toBe(2);
    expect(await take()).toBe(-1);
    expect(await take()).toBe(-1);
    await db.query("select public.agent_add_tokens($1, 1000, 200)", [bid]);
    const u = await one<{ messages: number; input_tokens: string }>(db, "select messages, input_tokens from public.agent_usage where business_id = $1", [bid]);
    expect(u.messages).toBe(2);
    expect(Number(u.input_tokens)).toBe(1000);
  });

  it("users can't call the server-only functions", async () => {
    await as(db, owner);
    await expect(db.query("select public.agent_take_message($1, 1000)", [bid])).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.admin_overview()")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.admin_businesses()")).rejects.toThrow(/permission denied/);
  });

  it("owners can read their own usage only", async () => {
    await as(db, owner);
    expect((await db.query("select * from public.agent_usage")).rows).toHaveLength(1);
    await as(db, other);
    expect((await db.query("select * from public.agent_usage")).rows).toHaveLength(0);
  });

  it("overview totals", async () => {
    await asService(db);
    const o = (await one<{ o: Record<string, unknown> }>(db, "select public.admin_overview() as o")).o;
    expect(o).toMatchObject({ users: 2, businesses: 2, pro: 1, pro_yearly: 1, pro_monthly: 0, assistant_messages_today: 2 });
    expect(Array.isArray(o.signups_by_day)).toBe(true);
  });

  it("business list with search", async () => {
    await asService(db);
    const all = (await db.query<{ name: string; owner_email: string; is_pro: boolean; total_count: string }>("select * from public.admin_businesses()")).rows;
    expect(all).toHaveLength(2);
    expect(Number(all[0].total_count)).toBe(2);
    const found = (await db.query<{ id: string; name: string; owner_email: string; is_pro: boolean; plan: string; assistant_messages_30d: string }>(
      "select * from public.admin_businesses('ada')")).rows;
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: bid, name: "Ada Fabrics", owner_email: "ada@shop.ng", is_pro: true, plan: "yearly" });
    expect(Number(found[0].assistant_messages_30d)).toBe(2);
    const byEmail = (await db.query<{ id: string }>("select id from public.admin_businesses('BAYO@')")).rows;
    expect(byEmail.map((r) => r.id)).toEqual([bid2]);
  });
});
