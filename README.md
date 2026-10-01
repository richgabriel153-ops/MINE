# ReceiptNaija

Free, mobile-first receipt and invoice generator for small Nigerian businesses.
Everything is saved on the device (no login, no backend in v1).

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (money, totals, VAT, part payments, phone numbers)
npm run lint && npm run typecheck
```

Copy `.env.example` to `.env.local` and fill in the values.

## Notes

- All money is stored and calculated in kobo integers (`src/lib/money.ts`, `src/lib/totals.ts`).
- Dates use Africa/Lagos time and display as DD/MM/YYYY.
- shadcn/ui components live in `src/components/ui` (added manually; same source as the registry).
