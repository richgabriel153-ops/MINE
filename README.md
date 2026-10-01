# ReceiptNaija

Free, mobile-first receipt and invoice generator for small Nigerian businesses.
Everything is saved on the device (IndexedDB). No login and no database in v1.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (money, totals, VAT, part payments, phone numbers, backup, summary)
npm run lint && npm run typecheck
```

Copy `.env.example` to `.env.local` and fill in the values.

## Environment variables (set these in Vercel → Project → Settings → Environment Variables)

| Name | What it is |
| --- | --- |
| `NEXT_PUBLIC_PRO_PAYMENT_LINK` | Your Paystack payment page link, opened by "Upgrade to Pro". Must start with `https://`. |
| `PRO_UNLOCK_CODES` | Comma-separated unlock codes, e.g. `NAIJA-PRO-7K2Q,NAIJA-PRO-9XWP`. Checked only on the server (`/api/unlock`), never sent to phones. |

Redeploy after changing them (`NEXT_PUBLIC_…` values are built into the app).

### ⚠️ Temporary Pro unlock

Unlock codes are a stop-gap: a code can be shared and reused, and Pro status is stored on the
phone only. Replace with a proper backend (one code per buyer created by a Paystack webhook,
tied to the buyer's phone/email) before Pro sales grow. See `src/lib/unlock-codes.ts`.

## How it's built

- Next.js App Router (all pages static) + Tailwind + shadcn/ui (`src/components/ui`, added by hand)
- Money is stored and calculated in kobo integers (`src/lib/money.ts`, `src/lib/totals.ts`)
- Dates use Africa/Lagos time and display as DD/MM/YYYY (`src/lib/dates.ts`)
- Receipts are HTML templates (`src/components/templates`) turned into images with html-to-image;
  shared images are kept under 300 KB (`src/lib/export-image.ts`). PDFs use jsPDF, loaded on demand.
- Offline: `public/sw.js` saves all pages and their files; the app is installable (`src/app/manifest.ts`)
- Backup files are JSON (`src/lib/backup.ts`)
