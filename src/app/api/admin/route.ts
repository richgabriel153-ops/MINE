import { isAdmin } from "@/lib/server/admin";
import { isServerCloudConfigured, json, requestUser, supabaseAdmin } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * Admin dashboard data (admins only, see ADMIN_EMAILS).
 * GET ?view=check                       → { admin: boolean }
 * GET ?view=overview                    → totals across all accounts
 * GET ?view=businesses&q=&offset=       → one row per business (no customer or document contents)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "overview";
  if (!isServerCloudConfigured()) return view === "check" ? json({ admin: false }) : json({ error: "Accounts aren't set up yet." }, 503);
  const user = await requestUser(request);
  const admin = isAdmin(user);
  if (view === "check") return json({ admin });
  if (!user) return json({ error: "Please sign in." }, 401);
  if (!admin) return json({ error: "Not allowed." }, 403);

  const db = supabaseAdmin();
  if (view === "overview") {
    const { data, error } = await db.rpc("admin_overview");
    if (error) return json({ error: error.message }, 500);
    return json({ overview: data, model: process.env.AGENT_MODEL || null });
  }
  if (view === "businesses") {
    const q = (url.searchParams.get("q") ?? "").slice(0, 100);
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const { data, error } = await db.rpc("admin_businesses", { p_search: q, p_limit: 50, p_offset: offset });
    if (error) return json({ error: error.message }, 500);
    return json({ businesses: data ?? [] });
  }
  return json({ error: "Bad request" }, 400);
}
