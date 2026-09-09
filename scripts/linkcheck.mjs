#!/usr/bin/env node
/** Verify every internal link in dist/ resolves, and no wikilink artifacts survive. */
import fs from 'node:fs';
import path from 'node:path';

const DIST = 'dist';
const BASE = (process.env.ATLAS_BASE || '/ayurveda-atlas').replace(/\/$/, '');

const html = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) html.push(p);
  }
};
walk(DIST);

const exists = (urlPath) => {
  // An absolute link that does not carry the configured base is broken in
  // production even though the file exists at the dist root. Catch it here.
  if (BASE && !urlPath.startsWith(`${BASE}/`) && urlPath !== BASE) return false;
  const rel = urlPath.replace(new RegExp(`^${BASE}`), '') || '/';
  const candidates = [
    path.join(DIST, rel),
    path.join(DIST, rel, 'index.html'),
    path.join(DIST, `${rel.replace(/\/$/, '')}.html`),
  ];
  return candidates.some((c) => fs.existsSync(c));
};

const broken = new Map();
let artifacts = 0;
let checked = 0;

for (const file of html) {
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes('[[') || /\]\]/.test(src)) artifacts++;
  for (const m of src.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const raw = m[1];
    if (/^(?:[a-z]+:|\/\/|#|mailto:|data:)/i.test(raw)) continue;

    let clean = raw.split('#')[0].split('?')[0];
    if (!clean) continue;

    if (!clean.startsWith('/')) {
      // Resolve a relative link against the page's own directory.
      const dir = '/' + path.relative(DIST, path.dirname(file)).split(path.sep).join('/');
      clean = new URL(clean, `http://x${BASE}${dir === '/' ? '' : dir}/`).pathname;
    }

    checked++;
    if (!exists(clean)) {
      if (!broken.has(clean)) broken.set(clean, []);
      broken.get(clean).push(file);
    }
  }
}

console.log(`checked ${checked} internal links across ${html.length} pages`);
console.log(`pages with wikilink artifacts: ${artifacts}`);
if (broken.size) {
  console.error(`\nFAIL: ${broken.size} broken internal target(s)`);
  for (const [target, from] of [...broken].slice(0, 25)) {
    console.error(`  ${target}  (from ${from.length} page(s), e.g. ${from[0]})`);
  }
  process.exit(1);
}
if (artifacts) { console.error('FAIL: wikilink artifacts present'); process.exit(1); }
console.log('PASS: no broken internal links, no wikilink artifacts');
