#!/usr/bin/env node
/**
 * Drop the "Derived from constituent herbs" placeholder from formulation pages that carry the
 * formulary recipe.
 *
 * The vault's formulation template fills "Key Active Markers" with two lines that say nothing:
 * "Derived from constituent herbs (see individual herb profiles)" and "Standardized on primary
 * bioactive markers". On a page that now shows the formulary recipe at the top, they stand where a
 * reader expects the composition and point away from it. Pages without a formulary record keep
 * them, because there the line is at least a pointer. A heading left with nothing under it goes too.
 *
 *   node scripts/fix-marker-placeholder.mjs            report
 *   node scripts/fix-marker-placeholder.mjs --write    apply
 */
import fs from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');
const records = JSON.parse(fs.readFileSync(path.join('src', 'data', 'composition.json'), 'utf8')).records;
const FILLER = /^- (Derived from constituent herbs \(see individual herb profiles\)|Standardized on primary bioactive markers)\s*$\n?/gm;
let changed = 0;
for (const slug of Object.keys(records)) {
  const f = path.join('content', 'formulation', `${slug}.md`);
  if (!fs.existsSync(f)) continue;
  const before = fs.readFileSync(f, 'utf8');
  let after = before.replace(FILLER, '');
  // A level-3 heading followed directly by another heading or the end of the file is now empty.
  after = after.replace(/^### Key Active Markers\n+(?=#{2,3} |\s*$)/m, '');
  // And a "What is it made of?" section left empty points to the recipe instead of saying nothing.
  after = after.replace(/^## What is it made of\?\n+(?=## |\s*$)/m,
    '## What is it made of?\n\nThe Ayurvedic Formulary of India recipe, every ingredient with its part and quantity, is in the composition table near the top of this page.\n\n');
  if (after !== before) {
    changed += 1;
    if (WRITE) fs.writeFileSync(f, after);
  }
}
console.log(`${changed} formulation page(s) ${WRITE ? 'updated' : 'would change'}`);
