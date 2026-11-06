import { isPreviewMode } from "@/lib/server/preview";
import { json, memberRole, requestUser, supabaseAdmin } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

/** Whether this deployment offers the Pro preview (test links only), and whether the AI key is added. */
export async function GET() {
  const enabled = isPreviewMode();
  return json({ enabled, assistantReady: enabled && Boolean(process.env.ANTHROPIC_API_KEY) });
}

/**
 * Pro preview on test links: POST { businessId, on: boolean } switches Pro on or off for the caller's
 * own business. Refused on the live app (VERCEL_ENV=production), so nobody gets Pro for free there.
 */
export async function POST(request: Request) {
  if (!isPreviewMode()) return json({ error: "Not available." }, 404);
  const user = await requestUser(request);
  if (!user) return json({ error: "Please log in again." }, 401);
  let body: { businessId?: string; on?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  if (!body.businessId || (await memberRole(user.id, body.businessId)) !== "owner") return json({ error: "Owner only." }, 403);
  const db = supabaseAdmin();
  const update = body.on
    ? db.from("business_billing").update({ comp: true, comp_reason: "preview", updated_at: new Date().toISOString() }).eq("business_id", body.businessId)
    : db.from("business_billing").update({ comp: false, comp_reason: null, updated_at: new Date().toISOString() }).eq("business_id", body.businessId).eq("comp_reason", "preview");
  const { error } = await update;
  if (error) return json({ error: "Couldn't change Pro. Please try again." }, 500);
  return json({ ok: true });
}
