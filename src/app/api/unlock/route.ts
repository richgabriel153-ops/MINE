import { isValidUnlockCode } from "@/lib/unlock-codes";
import { json, memberRole, requestUser, supabaseAdmin } from "@/lib/server/supabase-admin";

/**
 * Unlock codes from before subscriptions (honoured).
 *  - Without an account: confirms the code so this phone can switch on Pro.
 *  - Signed in as an owner (with businessId): also marks that business as Pro for good ("comp").
 */
export async function POST(request: Request) {
  let code = "";
  let businessId = "";
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null) {
      if ("code" in body && typeof body.code === "string") code = body.code;
      if ("businessId" in body && typeof body.businessId === "string") businessId = body.businessId;
    }
  } catch {
    // fall through to "invalid"
  }

  // A small pause makes guessing codes slow.
  await new Promise((r) => setTimeout(r, 400));

  if (!isValidUnlockCode(code, process.env.PRO_UNLOCK_CODES)) {
    return json({ ok: false, error: "That code didn't work. Check it and try again." }, 400);
  }

  if (businessId) {
    const user = await requestUser(request);
    if (!user || (await memberRole(user.id, businessId)) !== "owner") {
      return json({ ok: false, error: "Only the business owner can add a code to the account." }, 403);
    }
    const { error } = await supabaseAdmin()
      .from("business_billing")
      .update({ comp: true, comp_reason: "unlock_code", updated_at: new Date().toISOString() })
      .eq("business_id", businessId);
    if (error) return json({ ok: false, error: "Couldn't update your account. Please try again." }, 500);
  }
  return json({ ok: true });
}
