# Aether — AI Automation Agency Website

A dark, gradient-rich, 3D interactive landing page for an AI automation service.

## Features
- **3D service showcase hero** inspired by a product-carousel design: each AI service is shown as a glossy, inflated 3D object (a chat bubble, gears, a microphone and a growth chart) rendered live with Three.js. The objects float over a soft contact shadow, follow the cursor, and can be dragged to spin.
- **Theme morphing**: every service has its own palette (orange, charcoal, crimson, silver). Switching services smoothly re-colors the entire site.
- **Carousel flow**: prev/next arrows, auto-advance with a progress line, a next-service 3D thumbnail, keyboard arrows and swipe on touch. Prices update with an "automations included" selector (1/3/5).
- **Buttery smooth scroll** (Lenis) plus **scroll animations** (GSAP ScrollTrigger): text reveals, a word-by-word statement and a pinned horizontal "Process" section.
- An ROI calculator, a pricing toggle, an animated FAQ, a contact form with validation, magnetic buttons and 3D tilt cards.
- Fully responsive. Respects `prefers-reduced-motion`. No build step: libraries are vendored in `/vendor`.

## Run locally
Open `index.html` directly, or serve the folder:
```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Pages
- `index.html`: homepage (services, portfolio, process, pricing, FAQ, contact)
- `work-inceipt.html`: InCeipt case study
- `privacy.html`, `terms.html`: legal pages (have them reviewed by a lawyer)
- `404.html`: not-found page (used automatically by Vercel)

## Customize
- **Brand name / copy**: edit `index.html` ("Aether" is a placeholder).
- **Contact details**: replace `hello@yourdomain.com`, the WhatsApp number `+234 000 000 0000` / `wa.me/2340000000000` and the Fiverr link `https://www.fiverr.com/` in every `.html` file.
- **Package prices**: the pricing cards in `index.html`, the budget options in the contact form, the `priceRange` in the JSON-LD block, and `prices` in `SLIDES` (`main.js`).
- **Services, colors and prices**: edit the `SLIDES` array at the top of `main.js` (copy, theme palette, 3D object colors and prices).
- **Contact form**: set `FORM_ENDPOINT` in `main.js` (for example, a Formspree URL) to receive submissions.
- **Deploy**: any static host (GitHub Pages, Netlify, Vercel). Just upload the folder.
