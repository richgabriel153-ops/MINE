# Design: "Shop signboard"

The seller's shop sign in their pocket. Inspired by Nigerian hand-painted shop signs: bold teal fields, ink outlines, a light inner keyline, chunky lettering. Applied as an app shell; layout, navigation and controls stay standard mobile patterns.

## Colour (Lagoon)

| Token | Value | Use |
|---|---|---|
| `--sign` / `--primary` | #0B5F5A | Signboards, headers, primary buttons, active tab |
| `--sign-deep` | #084A46 | Pressed primary |
| `--highlight` (coral) | #E86A33 | Only the money action: New receipt, the New tab, the app mark. Ink text on it, never white |
| `--ink` | #0E1D1C | Text, 2px outlines on signboards and buttons |
| `--background` | #EEF4F3 | Page ground (pale lagoon) |
| `--card` | #FFFFFF | Panels, list groups, inputs |
| `--on-sign-muted` | #BFE0DA | Secondary text on teal (5.4:1) |
| `--on-sign-warm` | #FFB38F | "Owed to you" amount on teal |
| paid / part / unpaid | #11764A / #8A5300 / #B42318 | Status stamps and balances |
| WhatsApp | #1B7F4C | Send on WhatsApp only |

## Type

Rubik (variable, self-hosted, Latin) for everything, including documents; ₦ from a 1 KB Inter subset. Amounts use tabular figures (`.amount`). Names and amounts at 800 weight; titles 1.35–1.6rem; body 16px; inputs never below 16px.

## Signature

- **Signboard** (`components/brand/signboard.tsx`): teal field, 2px ink frame, 1px white/25 keyline inset 5px, 22px radius. Home opens with the seller's logo and name on it, plus money in and owed.
- **Page header** (`components/layout/page-header.tsx`): the same sign as a compact strip on every screen.
- **Stamps** (`Stamp` in `document-card.tsx`): uppercase, 1.5px border in the status colour, light tint.
- **App mark** (`components/brand/brand-mark.tsx`, `app/icon.svg`): coral receipt with a white tick on ink, tilted −7°, in a teal sign frame.

## Components

- Buttons: 2px ink outline (primary teal, outline white), rounded-xl, bold, ≥48px tall.
- Lists: one white panel with hairline dividers; cards only for standalone items.
- Press feedback: scale 0.97 over 140ms ease-out; reduced motion respected.
- One authored motion: "In this week" counts up once on Home.
- Selection, caret and focus ring themed from coral/teal.

## Don'ts

No gradients, glass, hard offset shadows, emoji icons, eyebrow labels above headings, or coral on anything that isn't the money action.
