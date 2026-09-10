#!/usr/bin/env node
/**
 * Turn the verification workflow's output into data/binomials.json.
 *
 *   node scripts/apply-binomials.mjs <accepted.json>
 *
 * Input is the workflow's `accepted` array: [{slug, binomial, note}].
 * Everything is re-validated here rather than trusted, because this file becomes a
 * factual claim on a published page and in its structured data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normaliseBinomial, walk } from './lib.mjs';

const IN = process.argv[2];
if (!IN || !fs.existsSync(IN)) {
  console.error('usage: node scripts/apply-binomials.mjs <accepted.json>');
  process.exit(1);
}

const accepted = JSON.parse(fs.readFileSync(IN, 'utf8'));
const list = Array.isArray(accepted) ? accepted : (accepted.accepted ?? []);

// Only slugs that actually exist as herb pages, so a hallucinated slug cannot create
// a phantom entry.
const known = new Set(
  walk('content')
    .filter((r) => r.startsWith('herb'))
    .map((r) => path.basename(r, '.md')),
);

const out = {};
const skipped = { unknownSlug: 0, notBinomial: 0, duplicate: 0 };

for (const e of list) {
  if (!known.has(e.slug)) { skipped.unknownSlug += 1; continue; }
  const clean = normaliseBinomial(e.binomial ?? '');
  if (!clean) { skipped.notBinomial += 1; continue; }
  if (out[e.slug]) { skipped.duplicate += 1; continue; }
  out[e.slug] = { binomial: clean, note: (e.note ?? '').slice(0, 300) };
}

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));

fs.writeFileSync(path.join('data', 'binomials.json'), `${JSON.stringify({
  note: 'Identified then independently verified against authoritative botanical sources. '
    + 'Contested identities were rejected rather than resolved. See scripts/lib/binomials.mjs.',
  updatedAt: new Date().toISOString().slice(0, 10),
  count: Object.keys(sorted).length,
  binomials: sorted,
}, null, 1)}\n`);

console.log(`accepted in    ${list.length}`);
console.log(`written        ${Object.keys(sorted).length}`);
console.log(`skipped        ${JSON.stringify(skipped)}`);
