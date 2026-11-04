import { isPaystackConfigured, paystack } from "@/lib/server/paystack";
import { clientIp, rateLimit, tooMany } from "@/lib/server/rate-limit";
import { json, requestUser, supabaseAdmin } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

const PHOTO_BUCKET = "expense-photos";

/**
 * Delete my account (NDPA right to erasure).
 * DELETE { confirm: "DELETE" } with "Authorization: Bearer <access token>".
 *  1. Stops any Pro subscription with Paystack, so nobody is charged again.
 *  2. Deletes every business the person owns, with all its records and expense photos.
 *  3. Removes them from businesses where they're staff (those businesses' records stay with their owners).
 *  4. Deletes the login itself.
 */
export async function DELETE(request: Request) {
  const user = await requestUser(request);
  if (!user) return json({ error: "Please log in again." }, 401);
  if (!(await rateLimit(`delete:${user.id}`, 3600, 5)) || !(await rateLimit(`delete-ip:${clientIp(request)}`, 3600, 10))) return tooMany();
  let body: { confirm?: string } = {};
  try {
    body = await request.json();
  } catch {
    // fall through
  }
  if (body.confirm !== "DELETE") return json({ error: 'Type DELETE to confirm.' }, 400);

  const db = supabaseAdmin();
  const { data: owned, error: ownedError } = await db.from("businesses").select("id").eq("owner_id", user.id);
  if (ownedError) return json({ error: "Couldn't delete your account. Please try again." }, 500);
  const businessIds = (owned ?? []).map((b: { id: string }) => b.id);

  // 1. Stop subscriptions first. If Paystack can't be reached, stop here so no one keeps paying for a deleted account.
  if (businessIds.length) {
    const { data: billing } = await db
      .from("business_billing")
      .select("business_id, status, paystack_subscription_code, paystack_email_token, paystack_pending_subscription_code")
      .in("business_id", businessIds);
    for (const b of billing ?? []) {
      const live = b.paystack_subscription_code && b.paystack_email_token && ["active", "attention", "non_renewing"].includes(b.status);
      if (!live) continue;
      if (!isPaystackConfigured()) return json({ error: "Please cancel your Pro plan first (More → InCeipt Pro), then try again." }, 409);
      try {
        await paystack("/subscription/disable", { body: { code: b.paystack_subscription_code, token: b.paystack_email_token } });
      } catch {
        return json({ error: "We couldn't stop your Pro subscription with Paystack. Please try again in a few minutes." }, 502);
      }
    }
  }

  // 2. Expense photos (stored files aren't removed by the database).
  for (const bid of businessIds) {
    const { data: files } = await db.storage.from(PHOTO_BUCKET).list(bid, { limit: 1000 });
    const paths = (files ?? []).map((f) => `${bid}/${f.name}`);
    for (let i = 0; i < paths.length; i += 100) await db.storage.from(PHOTO_BUCKET).remove(paths.slice(i, i + 100));
  }

  // 3. Businesses, records and memberships.
  const { error: dataError } = await db.rpc("delete_account_data", { p_user: user.id });
  if (dataError) {
    console.error("delete_account_data failed", dataError);
    return json({ error: "Couldn't delete your account. Please try again." }, 500);
  }

  // 4. The login.
  const { error: authError } = await db.auth.admin.deleteUser(user.id);
  if (authError) {
    console.error("deleteUser failed", authError);
    return json({ error: "Your records were deleted, but we couldn't remove your login. Please contact us." }, 500);
  }
  return json({ ok: true, deletedBusinesses: businessIds.length });
}
