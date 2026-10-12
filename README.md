# Aether — AI Automation Agency Website

A dark, gradient-rich, 3D interactive landing page for an AI automation service.

## Features
- **WebGL hero**: an iridescent, noise-driven 3D orb (Three.js custom shaders) that reacts to the cursor, with a glow halo, orbit rings and a particle field. It drifts, re-colors and dims as you scroll.
- **Buttery smooth scroll** (Lenis) plus **scroll-driven animation** (GSAP ScrollTrigger): a staggered headline intro, a word-by-word lighting statement, and a pinned horizontal "Process" section with a progress bar.
- **Micro-interactions**: a custom cursor with labels, magnetic buttons, 3D tilt cards with a spotlight glow, and animated counters.
- **Interactive ROI calculator**, a pricing toggle (project/retainer), an animated FAQ accordion, and a contact form with validation.
- Fully responsive. Respects `prefers-reduced-motion`. No build step: libraries are vendored in `/vendor`.

## Run locally
Open `index.html` directly, or serve the folder:
```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Customize
- **Brand name / copy**: edit `index.html` ("Aether" is a placeholder).
- **Colors**: the CSS variables at the top of `styles.css` (`--violet`, `--cyan`, `--pink`, `--grad`, `--grad-btn`). For the 3D orb, change the `palette()` function in `main.js`.
- **Contact form**: set `FORM_ENDPOINT` in `main.js` (for example, a Formspree URL) to receive submissions.
- **Deploy**: any static host (GitHub Pages, Netlify, Vercel). Just upload the folder.
