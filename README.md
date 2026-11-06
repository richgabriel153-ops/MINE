# InCeipt

Free, mobile-first receipt and invoice generator for small Nigerian businesses.
Free users need no login: records are saved on the device (IndexedDB). Pro businesses sign in with an
email code and their records live in Supabase, shared with their staff.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (money, totals, VAT, part payments, phone numbers, backup, summary)
npm run lint && npm run typecheck
```

Copy `.env.example` to `.env.local` and fill in the values.

## Setup (accounts, subscriptions, Pay Now)

See **[SETUP.md](SETUP.md)** for the Supabase migrations, Paystack plans and webhook, and every
environment variable (and which are secret).

## Pro

Pro is a subscription (₦3,000/month or ₦28,000/year) on the business account, paid through Paystack.
Unlock codes from before subscriptions are still honoured (`PRO_UNLOCK_CODES`).

## How it's built

- Next.js App Router (all pages static) + Tailwind + shadcn/ui (`src/components/ui`, added by hand)
- Money is stored and calculated in kobo integers (`src/lib/money.ts`, `src/lib/totals.ts`)
- Dates use Africa/Lagos time and display as DD/MM/YYYY (`src/lib/dates.ts`)
- Receipts are HTML templates (`src/components/templates`) turned into images with html-to-image;
  shared images are kept under 300 KB (`src/lib/export-image.ts`). PDFs use jsPDF, loaded on demand.
- Offline: `public/sw.js` saves all pages and their files; the app is installable (`src/app/manifest.ts`)
- Backup files are JSON (`src/lib/backup.ts`)
- `src/lib/db.ts` sends each read/write to the phone (`local-db.ts`) or the account (`cloud/repo.ts`)
- Database: `supabase/migrations` (Row Level Security; all writes via checked functions), tested on PGlite in `tests/db`
- Server routes: `/api/billing`, `/api/paystack/webhook`, `/api/payouts`, `/api/pay`, `/api/unlock`
