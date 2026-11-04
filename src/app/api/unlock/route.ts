import { createClient } from "@supabase/supabase-js";

import { isValidUnlockCode } from "@/lib/unlock-codes";
import { clientIp, rateLimit, tooMany } from "@/lib/server/rate-limit";
import { json, memberRole, requestUser, supabaseAdmin } from "@/lib/server/supabase-admin";

const MESSAGES: Record<string, string> = {
  invalid_code: "That code didn't work. Check it and try again.",
  code_used_up: "That code has already been used. Ask for a new one.",
  rate_limited: "Too many tries. Please wait an hour and try again.",
};

/**
 * Give a business Pro with a code (owner only, signed in).
 *  1. Beta codes managed in Supabase (table beta_codes): each has a number of uses and an optional expiry.
 *  2. Early-supporter codes from the PRO_UNLOCK_CODES setting (honoured from before subscriptions).
 * POST { businessId, code } with "Authorization: Bearer <access token>".
 */
export async function POST(request: Request) {
  let code = "";
  let businessId = "";
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null) {
      if ("code" in body && typeof body.code === "string") code = body.code.slice(0, 60);
      if ("businessId" in body && typeof body.businessId === "string") businessId = body.businessId;
    }
  } catch {
    return json({ ok: false, error: "Bad request" }, 400);
  }
  if (!code.trim() || !/^[0-9a-f-]{36}$/i.test(businessId)) return json({ ok: false, error: "Enter your code." }, 400);

  const user = await requestUser(request);
  if (!user) return json({ ok: false, error: "Please log in again." }, 401);
  // Codes are worth guessing, so refuse if the limiter can't be checked.
  if (!(await rateLimit(`unlock-ip:${clientIp(request)}`, 3600, 30, { failOpen: false }))) return tooMany();
  if ((await memberRole(user.id, businessId)) !== "owner") {
    return json({ ok: false, error: "Only the business owner can add a code." }, 403);
  }

  // Beta codes: run as the user, so the database checks ownership and counts the attempt.
  const token = (request.headers.get("authorization") ?? "").slice(7);
  const asUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: result, error } = await asUser.rpc("redeem_beta_code", { bid: businessId, p_code: code });
  if (error) return json({ ok: false, error: "Couldn't check the code. Please try again." }, 500);
  if (result === "ok") return json({ ok: true });
  if (result !== "invalid_code") return json({ ok: false, error: MESSAGES[String(result)] ?? MESSAGES.invalid_code }, 400);

  // Early-supporter codes (counted by the same limiter above).
  if (!isValidUnlockCode(code, process.env.PRO_UNLOCK_CODES)) return json({ ok: false, error: MESSAGES.invalid_code }, 400);
  const { error: updateError } = await supabaseAdmin()
    .from("business_billing")
    .update({ comp: true, comp_reason: "unlock_code", updated_at: new Date().toISOString() })
    .eq("business_id", businessId);
  if (updateError) return json({ ok: false, error: "Couldn't update your account. Please try again." }, 500);
  return json({ ok: true });
}
