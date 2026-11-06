# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Market and shop owners in Nigeria: traders, food sellers, fashion designers and tailors, phone and gadget shops. They are busy and on the move, often serving a customer while typing with one hand, mostly on low-cost Android phones, often outdoors or in bright light, on patchy mobile data. They sell in person and on WhatsApp. Their job in InCeipt: give a customer a neat receipt or invoice fast, and know who still owes them money. Some invite one or two staff to make receipts for them.

## Product Purpose
InCeipt replaces handwritten receipt books and screenshot "receipts". A seller makes a professional receipt, invoice or quotation on their phone, sends it on WhatsApp (or as an image/PDF), records full or part payments, and sees what each customer still owes. Success: a receipt sent in under 30 seconds, no money forgotten, and the seller looks like a serious brand to their customers.

## Positioning
- **WhatsApp in seconds:** the fastest path from "customer paid" to "receipt on their WhatsApp".
- **Know who owes you:** part payments and balances are tracked automatically, per customer.
- **Look like a big brand:** the seller's own logo, colour and bank details on every document.

## Operating Context
- Typical moment: customer waiting at the stall or on a chat; seller opens the app, taps New, types items and price, taps Send.
- Payment methods: bank transfer, POS, cash. Amounts in naira (₦), stored in kobo. VAT 7.5% optional, off by default.
- Documents: receipts (RCT-0001), invoices (INV-), quotations/proforma (QUO-). Numbering is automatic and never repeats.
- Network can drop; the app keeps a read-only offline copy and says clearly when it can't save.
- Beta: about 20 testers; Pro is free with a beta code; real payments are switched off.

## Capabilities and Constraints
- Account required (email + password); records live in Supabase; owner and staff roles.
- Free plan: receipts and invoices, 3 templates, latest 50 records visible, "Made with InCeipt" line.
- Pro: quotations, debt tracking and part payments, expenses and profit, tax estimates, staff, 5 templates, AI assistant (needs an API key), Pay Now links (off during beta).
- Customers list, History with search and paging, data export and account deletion.
- Stack: Next.js 16 App Router, TypeScript, Tailwind v4, Supabase, Vercel. Mobile-first PWA.

## Brand Commitments
- Name: InCeipt. Personality: bold and energetic, confident and punchy; it should make a small seller feel like a big brand.
- Colour palette chosen by the owner: "Lagoon" (deep teal #0B5F5A primary, coral #E86A33 accent). No indigo/purple.
- Font: Rubik (chosen by the owner: friendly, chunky numbers, plain zero); ₦ glyph from a small Inter subset. Atkinson Hyperlegible was dropped because of its slashed zero.
- Avoid the generic AI look: no purple gradients, glassy cards, emoji icons, or a centred hero with three boxes.

## Evidence on Hand
- No real testimonials, customer counts or press. Do not invent any.
- Sample data in the app is illustrative only (Mama Chi Kitchen, Ada Okafor etc.).

## Product Principles
1. Speed first: the receipt-to-WhatsApp path is never more than a few taps.
2. Money must be unmistakable: amounts, balances and paid/owing status are the loudest things on screen.
3. Built for a cheap phone in the sun: high contrast, big tap targets, light pages, works on bad network.
4. Make the seller look bigger: their brand on their documents, never ours over theirs.
5. Never lose or confuse money: clear errors, no silent failures, no duplicate saves.

## Accessibility & Inclusion
High contrast for outdoor use (WCAG AA minimum, AAA for amounts where possible), 48px tap targets, 16px+ inputs, works with large system font sizes, respects reduced motion, plain English for users with varied literacy.
