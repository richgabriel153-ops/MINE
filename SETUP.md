# InCeipt Pro: setup guide

Everything below is done once, in your own Supabase, Paystack and Vercel dashboards.
Never paste secret keys into the code or a chat. Put them only in **Vercel → Project → Settings → Environment Variables**.

InCeipt needs an account: every record is stored in Supabase, protected by row-level security so each
business only ever sees its own data. Real payments are **off** until you switch them on (section 3).

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
   7. `20261001000700_admin_assistant.sql` (assistant usage limits and the admin dashboard)
   8. `20261104000800_beta_hardening.sql` (server-side totals and checks, customers, beta codes, data export, rate limits)
   9. `20261104000900_lock_anon.sql` (logged-out visitors get no access at all; shows a small table: all `false`)

   To check privacy at any time, run `supabase/checks/rls_live_check.sql`: it undoes itself and ends with a red
   "TEST RESULT (rolled back)" message where every `B_…` number is 0 and everything else says `blocked`.

   (Or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.)
3. **Login (email + password, with 6-digit codes).** **Authentication → Sign In / Providers → Email**: Email on,
   **Confirm email** on, **Minimum password length 8**, **Password requirements: letters and digits**.
   Then **Authentication → Emails → Templates**: each of these must show the code `{{ .Token }}`:
   - **Confirm signup**: `<p>Your InCeipt code is: <strong>{{ .Token }}</strong></p>`
   - **Magic Link** (code login): `<p>Your InCeipt login code is: <strong>{{ .Token }}</strong></p>`
   - **Reset Password**: `<p>Your InCeipt password reset code is: <strong>{{ .Token }}</strong></p>`
4. **Authentication → URL Configuration**: set **Site URL** to your app's address (for now
   `https://mine-git-dev-jjjj-e73e.vercel.app`; change it when you add a domain).
5. **Email sending (required for testers).** Supabase's built-in email only sends to members of your Supabase team
   and only a few per hour. Add your own: **Authentication → Emails → SMTP Settings**. Easiest free option without a
   domain: Gmail (host `smtp.gmail.com`, port `587`, your Gmail address, and a Gmail *App password* from Google
   Account → Security → 2-Step Verification → App passwords; about 500 emails a day). Brevo (300/day) also works.
   **Authentication → Rate Limits**: keep the defaults (they slow down repeated logins and sign-ups).
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
| `PRO_UNLOCK_CODES` | Optional. Old early-supporter codes, comma separated (beta codes now live in Supabase, below) | **Yes** |
| `NEXT_PUBLIC_PAYMENTS_ENABLED` | Leave **unset** during the beta (no one can be charged; Pay Now links hidden). Set `on` when you're ready to take real payments | No |
| `NEXT_PUBLIC_PRICE_MONTHLY_NAIRA` | Optional. Monthly Pro price in whole naira. Default `3000`. Must match your Paystack monthly plan | No |
| `NEXT_PUBLIC_PRICE_YEARLY_NAIRA` | Optional. Yearly Pro price in whole naira. Default `28000`. Must match your Paystack yearly plan | No |
| `ADMIN_EMAILS` | Your email(s) for the admin dashboard, comma separated, e.g. `you@gmail.com` | Keep private |
| `ANTHROPIC_API_KEY` | <https://console.anthropic.com> → Settings → API Keys → Create key (add billing credit first) | **Yes** |
| `NEXT_PUBLIC_LEGAL_NAME` | Your registered business name, exactly as on CAC (e.g. `InCeipt Technologies Ltd`). Shown on Terms, Privacy and Refund pages | No (public) |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Support email shown on those pages (Paystack checks you have one) | No (public) |
| `NEXT_PUBLIC_SUPPORT_PHONE` | Optional support phone number | No (public) |
| `NEXT_PUBLIC_BUSINESS_ADDRESS` | Your business address (recommended for Paystack) | No (public) |
| `AGENT_DAILY_LIMIT` | Optional. Assistant messages per business per day. Default 40 | No |
| `AGENT_MODEL` | Optional. Claude model for the assistant. Default `claude-opus-5-5` | No |
| `AGENT_EFFORT` | Optional. `low` (default, cheapest), `medium` or `high` | No |
| `AGENT_FALLBACKS` | Optional. Default on. Set `off` only if you switch to a model that doesn't support refusal fallbacks | No |

You can remove `NEXT_PUBLIC_PRO_PAYMENT_LINK` and `NEXT_PUBLIC_PRO_PRICE_LABEL`; they're no longer used.

### Giving beta testers Pro

Two ways, both in Supabase → **Table Editor**:

1. **Invite codes** (table `beta_codes`): **Insert row** → `code` e.g. `BETA-LAGOS` (capital letters, 4–40
   characters), `max_uses` e.g. `25`, optionally `expires_at`, and a `note` for yourself. Testers enter it on the
   Pro page (or when creating their business). `used_count` shows how many used it; untick `active` to stop a code.
   Each person gets 10 tries an hour.
2. **A switch for one business** (table `business_billing`): find the business, set `comp` to `true` (and
   `comp_reason` to e.g. `beta`). Set it back to `false` to remove Pro.

## 4. Policy pages (needed for Paystack activation)

The app has **/terms**, **/privacy** and **/refunds** pages, linked from the landing page, sign-in, the Pro
page, the customer payment page and More. Set the four `NEXT_PUBLIC_LEGAL_*` / `SUPPORT_*` / `BUSINESS_ADDRESS`
values above so your business name and contact details appear, then give Paystack these links during activation:
`https://<your-domain>/terms`, `/privacy` and `/refunds`. Have a lawyer review them before launch.

### Before taking real payments: what needs a Nigerian lawyer

The pages are written in plain English to match how the app works, but they are not legal advice. Before turning
`NEXT_PUBLIC_PAYMENTS_ENABLED` on, have a lawyer check:

1. **Who the operator is.** Register the business with CAC (business name or limited company) and put that exact name,
   address and support email in `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_BUSINESS_ADDRESS`, `NEXT_PUBLIC_SUPPORT_EMAIL`.
   Paystack asks for this too.
2. **NDPA duties.** Whether you must register with the NDPC as a data controller/processor (it depends on how many
   people's data you handle), whether you need a Data Protection Officer, and whether a yearly data-protection audit
   applies. Also a written data-processing agreement with each business (InCeipt processes their customers' details).
3. **Data stored abroad.** Supabase stores data in Frankfurt (Germany); Vercel and Anthropic are US-based. Confirm the
   NDPA transfer safeguards described in the Privacy Policy are enough.
4. **Subscriptions.** Auto-renewal wording, cancellation and refunds under the Federal Competition and Consumer
   Protection Act (FCCPA 2018), and how VAT applies to the Pro price.
5. **Pay Now links.** Whether collecting payments for businesses through Paystack subaccounts needs anything beyond
   Paystack's own licence (CBN rules), and the platform-fee wording.
6. **Limits of responsibility.** The liability cap and the "estimates, not tax advice" wording on the Tax page.
7. **Document rules.** Whether VAT invoices made in the app meet FIRS/NRS requirements (seller TIN — now an optional
   field in Business details — date, VAT amount shown separately).

## 5. Admin dashboard and AI assistant

- **Admin dashboard**: sign in to InCeipt with an email listed in `ADMIN_EMAILS`. More → **Admin dashboard**
  (or go to `/admin`). It shows revenue (MRR), Pro plans, sign-ups, active businesses, usage, Paystack webhook
  errors and a searchable business list. It never shows customers or document contents. Phone-only users
  (no account) keep everything on their phone, so they can't be counted.
- **InCeipt Assistant** (Pro, needs an account): More → **Assistant (AI)**. It uses Claude through your
  Anthropic API key. Anything that changes records is shown as a card and only saved when the user taps
  **Confirm**. Each business gets `AGENT_DAILY_LIMIT` typed messages a day. Watch the cost on the admin
  dashboard and in the Anthropic console (Usage). Set a monthly spend limit in the Anthropic console.
  If Claude declines a request, it is retried on Anthropic's recommended fallback model.

## 6. Check it works (test mode first)

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
