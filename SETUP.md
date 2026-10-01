# InCeipt Pro: setup guide

Everything below is done once, in your own Supabase, Paystack and Vercel dashboards.
Never paste secret keys into the code or a chat. Put them only in **Vercel → Project → Settings → Environment Variables**.

Until these are set, the app still works as before (records on the phone, unlock codes). Accounts,
subscriptions, Pay Now links and staff switch on once the keys are added and the app is redeployed.

---

## 1. Supabase (accounts and online records)

1. Create a project at <https://supabase.com> (region: closest to Nigeria, e.g. *eu-west* or *af-south* if offered).
2. **Run the database migrations, in order.** Open **SQL Editor → New query**, paste each file from
   `supabase/migrations/` and click **Run**, one at a time, in name order:
   1. `20261001000100_core.sql`
   2. `20261001000200_billing.sql`
   3. `20261001000300_pay_links.sql`
   4. `20261001000400_staff.sql`
   5. `20261001000500_expenses.sql` (also creates the private `expense-photos` storage bucket)
   6. `20261001000600_quotes.sql`

   (Or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.)
3. **Email sign-in with a 6-digit code.** Go to **Authentication → Sign In / Providers → Email**: keep Email on,
   turn **Confirm email** on. Then **Authentication → Emails → Magic Link** template: make sure the email shows the
   code, for example:

   ```html
   <h2>Your InCeipt code</h2>
   <p>Enter this code to sign in: <strong>{{ .Token }}</strong></p>
   ```

   Do the same for the **Confirm signup** template (new users get this one first).
4. **Authentication → URL Configuration**: set **Site URL** to your live address (e.g. `https://inceipt.app`)
   and add your preview address (`https://mine-git-dev-jjjj-e73e.vercel.app`) under **Redirect URLs**.
5. Supabase's built-in email is limited to a few emails per hour. Before launch, add your own SMTP
   (Authentication → Emails → SMTP Settings), e.g. Resend, Brevo or Zoho.
6. Copy the keys from **Project Settings → API** into Vercel (table below).

## 2. Paystack (subscriptions and Pay Now)

Your Paystack business must be **fully activated (live)** for subaccounts and subscriptions.

1. **Create two plans**: Paystack Dashboard → **Products → Plans → Create plan**:
   | Name | Amount | Interval |
   | --- | --- | --- |
   | InCeipt Pro Monthly | ₦3,000 | Monthly |
   | InCeipt Pro Yearly | ₦28,000 | Annually |

   Copy each plan code (`PLN_…`) into Vercel.
2. **Webhook**: Settings → **API Keys & Webhooks** → **Live Webhook URL**:
   `https://<your-live-domain>/api/paystack/webhook`
   (Use the Test Webhook URL with your preview address while testing with test keys.)
3. Copy your **Secret Key** (`sk_live_…`, or `sk_test_…` for testing) into Vercel.

How Pay Now money flows: each business that turns on "Get paid online" becomes a **Paystack subaccount**
linked to its own bank account. Customers pay on Paystack's page; Paystack settles the money **directly to that
business's bank account** (usually the next working day) and takes its normal fee from the payment.
InCeipt never holds the money and never stores any business's own keys. Optionally you can take a
percentage of each payment with `PAYSTACK_PLATFORM_FEE_PERCENT`.

## 3. Vercel environment variables

Add each one under **Settings → Environment Variables**, tick **Production** and **Preview**, then
**Redeploy** (Deployments → latest → ⋯ → Redeploy).

| Name | Where to find it | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | No (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` / publishable key | No (public; database rules protect data) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key | **Yes**: server only, never share |
| `PAYSTACK_SECRET_KEY` | Paystack → Settings → API Keys & Webhooks | **Yes** |
| `PAYSTACK_PLAN_MONTHLY` | Paystack → Plans → InCeipt Pro Monthly → plan code `PLN_…` | No |
| `PAYSTACK_PLAN_YEARLY` | Paystack → Plans → InCeipt Pro Yearly → plan code `PLN_…` | No |
| `NEXT_PUBLIC_APP_URL` | Optional. Your live address, e.g. `https://inceipt.app` (used for Paystack return links) | No |
| `PAYSTACK_PLATFORM_FEE_PERCENT` | Optional. Your cut of Pay Now payments, e.g. `1` for 1%. Default 0 | No |
| `PRO_UNLOCK_CODES` | Keep your existing early-supporter codes so they stay honoured | **Yes** |

You can remove `NEXT_PUBLIC_PRO_PAYMENT_LINK` and `NEXT_PUBLIC_PRO_PRICE_LABEL`; they're no longer used.

## 4. Check it works (test mode first)

1. Use Paystack **test** keys and test plans, redeploy the preview.
2. More → Account → sign in with your email → code → **Create my business account** (your phone's records are copied).
3. More → InCeipt Pro → Yearly → pay with a Paystack test card. You return to InCeipt as Pro.
4. More → Get paid online → choose bank → account number → confirm the name.
5. Make an invoice → **Add Pay Now link** → open the link on another phone → pay part with a test card →
   the invoice shows Part paid and the balance drops.
6. More → Staff → invite a second email → sign in with it on another phone → check it can't edit/delete or see totals.
7. Check **Paystack → Webhooks** shows successful (200) deliveries, and the Supabase table `paystack_events`
   has rows with `processed_at` set.

Then switch to live keys/plans, update the webhook URL, redeploy, and reply **"approved for production"**.
