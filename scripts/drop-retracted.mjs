#!/usr/bin/env node
/**
 * Remove retracted papers from the published citation data.
 *
 * Runs against src/data/citations.json and src/data/research.json rather than the
 * content files, because that is where citations actually live: the pages render from
 * these, so removing a paper here removes it everywhere it appears.
 *
 *   node scripts/drop-retracted.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadRetracted, dropRetracted } from './lib/retractions.mjs';

const DRY = process.argv.includes('--dry-run');
const retracted = loadRetracted();
console.log(`retracted PMIDs on the blocklist: ${retracted.size}`);
if (!retracted.size) { console.log('nothing to do'); process.exit(0); }

const citPath = path.join('src', 'data', 'citations.json');
const cit = JSON.parse(fs.readFileSync(citPath, 'utf8'));

let removed = 0;
const emptied = [];
for (const [key, page] of Object.entries(cit.pages ?? {})) {
  const { kept, dropped } = dropRetracted(page.citations ?? []);
  if (!dropped.length) continue;
  removed += dropped.length;
  page.citations = kept;
  for (const d of dropped) console.log(`  ${key}: dropped PMID ${d.pmid} — ${String(d.title).slice(0, 60)}`);
  // A page whose evidence was entirely retracted should say so rather than look
  // as though it was never researched.
  if (!kept.length) emptied.push(key);
}

console.log(`\nremoved ${removed} citation instance(s)`);
if (emptied.length) {
  console.log(`${emptied.length} page(s) now have no citations at all: ${emptied.join(', ')}`);
}

if (DRY) { console.log('\nDry run: nothing written.'); process.exit(0); }
fs.writeFileSync(citPath, JSON.stringify(cit, null, 1));
console.log(`\nwrote ${citPath}. Re-run scripts/research-index.mjs to rebuild the paper-keyed view.`);
