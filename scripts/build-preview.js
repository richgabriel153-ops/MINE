'use strict';

// Bundles the editor into one self-contained HTML file that runs entirely in the browser
// (LocalBackend: data in localStorage, no server). Usage: node scripts/build-preview.js [out.html]

const fs = require('node:fs');
const path = require('node:path');

const pub = path.join(__dirname, '..', 'public');
const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist', 'flowlite-preview.html'));
const read = (f) => fs.readFileSync(path.join(pub, f), 'utf8');
const script = (src) => `<script>\n${src.replace(/<\/script/gi, '<\\/script')}\n</script>`;

const html = [
  '<title>Flowlite Workflow Editor</title>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap">',
  `<style>\n${read('style.css')}\n</style>`,
  '<div id="app"></div>',
  script('window.FLOWLITE_LOCAL = true;'),
  ...['engine.js', 'icons.js', 'backend.js', 'canvas.js', 'ndv.js', 'app.js'].map((f) => script(read(f))),
].join('\n');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Wrote ${out} (${Math.round(html.length / 1024)} KB)`);
