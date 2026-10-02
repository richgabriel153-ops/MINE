import { PLANS, type Plan } from "@/lib/billing";
import { getBilling, syncBusinessBilling, type BillingRow } from "@/lib/server/billing-sync";
import { appOrigin, isPaystackConfigured, paystack, PaystackError, planCodes } from "@/lib/server/paystack";
import { json, memberRole, requestUser, supabaseAdmin } from "@/lib/server/supabase-admin";

/**
 * Pro subscriptions (owner only). POST { action, businessId, plan? }
 *   checkout  → start paying for a plan; returns Paystack's payment page URL
 *   sync      → re-read the plan from Paystack (after returning from payment)
 *   switch    → change plan from the next renewal
 *   cancel    → stop renewing; Pro stays until the end of the paid period
 *   resume    → undo cancel before the period ends
 *   card      → link to update the card used for renewals
 */
export async function POST(request: Request) {
  let body: { action?: string; businessId?: string; plan?: string } = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const { action, businessId } = body;
  if (!businessId) return json({ error: "Bad request" }, 400);

  const user = await requestUser(request);
  if (!user) return json({ error: "Please sign in again." }, 401);
  if ((await memberRole(user.id, businessId)) !== "owner") return json({ error: "Only the business owner can manage the plan." }, 403);
  if (!isPaystackConfigured()) return json({ error: "Payments aren't set up yet. Please try again later." }, 503);

  const plan = body.plan === "monthly" || body.plan === "yearly" ? (body.plan as Plan) : null;
  const codes = planCodes();

  try {
    let billing = await getBilling(businessId);
    if (!billing) return json({ error: "Business not found." }, 404);

    switch (action) {
      case "checkout": {
        if (!plan || !codes[plan]) return json({ error: "Choose a plan." }, 400);
        billing = await syncBusinessBilling(businessId);
        if (billing && ["active", "attention"].includes(billing.status))
          return json({ error: "You already have Pro. Use “Switch plan” instead." }, 409);
        const customerCode = await ensureCustomer(billing!, user.email ?? "", businessId);
        const init = await paystack<{ authorization_url: string; reference: string }>("/transaction/initialize", {
          body: {
            email: user.email,
            amount: PLANS[plan].kobo,
            plan: codes[plan],
            callback_url: `${appOrigin(request)}/pro?checkout=done`,
            metadata: { kind: "subscription", business_id: businessId, plan, customer_code: customerCode },
          },
        });
        return json({ url: init.authorization_url });
      }

      case "sync":
        return json({ billing: publicBilling(await syncBusinessBilling(businessId)) });

      case "switch": {
        if (!plan || !codes[plan]) return json({ error: "Choose a plan." }, 400);
        billing = await syncBusinessBilling(businessId);
        if (!billing?.paystack_subscription_code || !billing.paystack_email_token || !billing.current_period_end)
          return json({ error: "You don't have a plan to switch yet." }, 409);
        // Switching back to the current plan while a switch is waiting: cancel the waiting one.
        if (billing.plan === plan) {
          if (billing.paystack_pending_subscription_code) {
            await disablePending(billing);
            await paystack("/subscription/enable", { body: { code: billing.paystack_subscription_code, token: billing.paystack_email_token } });
          }
          return json({ billing: publicBilling(await syncBusinessBilling(businessId)) });
        }
        if (billing.pending_plan === plan) return json({ billing: publicBilling(billing) });
        // Current plan stops renewing; the new plan starts when it ends, using the same card.
        await paystack("/subscription/disable", { body: { code: billing.paystack_subscription_code, token: billing.paystack_email_token } });
        try {
          await paystack("/subscription", {
            body: { customer: billing.paystack_customer_code, plan: codes[plan], start_date: billing.current_period_end },
          });
        } catch (err) {
          await paystack("/subscription/enable", { body: { code: billing.paystack_subscription_code, token: billing.paystack_email_token } }).catch(() => undefined);
          throw err;
        }
        await supabaseAdmin().from("business_billing").update({ pending_plan: plan }).eq("business_id", businessId);
        return json({ billing: publicBilling(await syncBusinessBilling(businessId)) });
      }

      case "cancel": {
        billing = await syncBusinessBilling(businessId);
        if (!billing?.paystack_subscription_code || !billing.paystack_email_token) return json({ error: "You don't have a plan to cancel." }, 409);
        await disablePending(billing);
        if (billing.status !== "non_renewing")
          await paystack("/subscription/disable", { body: { code: billing.paystack_subscription_code, token: billing.paystack_email_token } });
        return json({ billing: publicBilling(await syncBusinessBilling(businessId)) });
      }

      case "resume": {
        billing = await syncBusinessBilling(businessId);
        if (!billing?.paystack_subscription_code || !billing.paystack_email_token || billing.status !== "non_renewing")
          return json({ error: "There's nothing to resume." }, 409);
        await paystack("/subscription/enable", { body: { code: billing.paystack_subscription_code, token: billing.paystack_email_token } });
        return json({ billing: publicBilling(await syncBusinessBilling(businessId)) });
      }

      case "card": {
        if (!billing.paystack_subscription_code) return json({ error: "You don't have a plan yet." }, 409);
        const link = await paystack<{ link: string }>(`/subscription/${billing.paystack_subscription_code}/manage/link`);
        return json({ url: link.link });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    const message = err instanceof PaystackError ? err.message : "Something went wrong. Please try again.";
    console.error("billing", action, err);
    return json({ error: message }, 502);
  }
}

async function ensureCustomer(billing: BillingRow, email: string, businessId: string): Promise<string> {
  if (billing.paystack_customer_code) return billing.paystack_customer_code;
  const customer = await paystack<{ customer_code: string; id: number }>("/customer", {
    body: { email, metadata: { business_id: businessId } },
  });
  await supabaseAdmin()
    .from("business_billing")
    .update({ paystack_customer_code: customer.customer_code, paystack_customer_id: customer.id })
    .eq("business_id", businessId);
  return customer.customer_code;
}

async function disablePending(billing: BillingRow) {
  if (!billing.paystack_pending_subscription_code) return;
  const pending = await paystack<{ email_token: string }>(`/subscription/${billing.paystack_pending_subscription_code}`);
  await paystack("/subscription/disable", { body: { code: billing.paystack_pending_subscription_code, token: pending.email_token } });
  await supabaseAdmin().from("business_billing").update({ pending_plan: null }).eq("business_id", billing.business_id);
}

function publicBilling(b: BillingRow | null) {
  return b && { plan: b.plan, status: b.status, current_period_end: b.current_period_end, pending_plan: b.pending_plan };
}
