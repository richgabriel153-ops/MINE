import { isPaystackConfigured, paystack, PaystackError } from "@/lib/server/paystack";
import { json, memberRole, requestUser, supabaseAdmin } from "@/lib/server/supabase-admin";

interface Bank {
  name: string;
  code: string;
  active: boolean;
}

let bankCache: { at: number; banks: { name: string; code: string }[] } | null = null;

async function nigerianBanks() {
  if (!bankCache || Date.now() - bankCache.at > 6 * 3600_000) {
    const banks = await paystack<Bank[]>("/bank?country=nigeria&currency=NGN&perPage=200");
    bankCache = {
      at: Date.now(),
      banks: banks
        .filter((b) => b.active)
        .map((b) => ({ name: b.name, code: b.code }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
  return bankCache.banks;
}

/**
 * Pay Now payouts (owner only). Each business is a Paystack *subaccount* tied to its own bank
 * account, so customers' payments settle straight to the business. No business keys are stored.
 * POST { action, businessId, bankCode?, accountNumber? }
 *   banks    → list of Nigerian banks
 *   resolve  → account name for an account number (so the owner can confirm it)
 *   connect  → create/update the subaccount
 *   status   → current payout account
 */
export async function POST(request: Request) {
  let body: { action?: string; businessId?: string; bankCode?: string; accountNumber?: string } = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const { action, businessId } = body;
  if (!businessId) return json({ error: "Bad request" }, 400);
  const user = await requestUser(request);
  if (!user) return json({ error: "Please sign in again." }, 401);
  if ((await memberRole(user.id, businessId)) !== "owner") return json({ error: "Only the business owner can set up payouts." }, 403);

  const db = supabaseAdmin();
  if (action === "status") {
    const { data } = await db.from("business_payouts").select("*").eq("business_id", businessId).maybeSingle();
    return json({ payouts: data ? publicPayouts(data) : null, available: isPaystackConfigured() });
  }
  if (!isPaystackConfigured()) return json({ error: "Online payments aren't set up yet. Please try again later." }, 503);

  const validAccount = /^\d{10}$/.test(body.accountNumber ?? "") && Boolean(body.bankCode);
  try {
    switch (action) {
      case "banks":
        return json({ banks: await nigerianBanks() });

      case "resolve": {
        if (!validAccount) return json({ error: "Enter a 10-digit account number and choose a bank." }, 400);
        const r = await paystack<{ account_name: string }>(
          `/bank/resolve?account_number=${body.accountNumber}&bank_code=${encodeURIComponent(body.bankCode!)}`,
        );
        return json({ accountName: r.account_name });
      }

      case "connect": {
        if (!validAccount) return json({ error: "Enter a 10-digit account number and choose a bank." }, 400);
        const resolved = await paystack<{ account_name: string }>(
          `/bank/resolve?account_number=${body.accountNumber}&bank_code=${encodeURIComponent(body.bankCode!)}`,
        );
        const { data: business } = await db.from("businesses").select("profile").eq("id", businessId).single();
        const businessName = ((business?.profile ?? {}) as { name?: string }).name || resolved.account_name;
        const bankName = (await nigerianBanks()).find((b) => b.code === body.bankCode)?.name ?? body.bankCode!;
        const fee = Number(process.env.PAYSTACK_PLATFORM_FEE_PERCENT ?? "0") || 0;
        const { data: existing } = await db.from("business_payouts").select("subaccount_code").eq("business_id", businessId).maybeSingle();
        const payload = {
          business_name: businessName.slice(0, 100),
          settlement_bank: body.bankCode,
          account_number: body.accountNumber,
          percentage_charge: fee,
          primary_contact_email: user.email,
          description: `InCeipt business ${businessId}`,
        };
        const sub = existing?.subaccount_code
          ? await paystack<{ subaccount_code?: string }>(`/subaccount/${existing.subaccount_code}`, { method: "PUT", body: payload })
          : await paystack<{ subaccount_code: string }>("/subaccount", { body: payload });
        const row = {
          business_id: businessId,
          subaccount_code: sub.subaccount_code ?? existing!.subaccount_code,
          bank_code: body.bankCode!,
          bank_name: bankName,
          account_number: body.accountNumber!,
          account_name: resolved.account_name,
          updated_at: new Date().toISOString(),
        };
        const { error } = await db.from("business_payouts").upsert(row);
        if (error) throw error;
        await db.from("activity_log").insert({
          business_id: businessId,
          actor_id: user.id,
          actor_name: user.email ?? "",
          action: "settings",
          entity_type: "payouts",
          summary: `Set the payout account to ${bankName} ••••${row.account_number.slice(-4)}`,
        });
        return json({ payouts: publicPayouts(row) });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    console.error("payouts", action, err);
    return json({ error: err instanceof PaystackError ? err.message : "Something went wrong. Please try again." }, 502);
  }
}

function publicPayouts(p: { bank_name: string; account_number: string; account_name: string }) {
  return { bankName: p.bank_name, accountName: p.account_name, accountLast4: p.account_number.slice(-4) };
}
