#!/usr/bin/env node
/**
 * Remove blocked papers from the published citation data.
 *
 * Blocked covers two different reasons, and the log says which applies to each: a retracted paper,
 * whose finding has been withdrawn, and a correction notice, which is not a study at all and whose
 * right replacement is the article it corrects.
 *
 * Runs against src/data/citations.json and src/data/research.json rather than the
 * content files, because that is where citations actually live: the pages render from
 * these, so removing a paper here removes it everywhere it appears.
 *
 *   node scripts/drop-retracted.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadBlocklist, dropBlocked } from './lib/retractions.mjs';

const DRY = process.argv.includes('--dry-run');
const blocked = loadBlocklist();
console.log(`PMIDs on the do-not-cite blocklist: ${blocked.size}`);
if (!blocked.size) { console.log('nothing to do'); process.exit(0); }

const citPath = path.join('src', 'data', 'citations.json');
const cit = JSON.parse(fs.readFileSync(citPath, 'utf8'));

let removed = 0;
const emptied = [];
for (const [key, page] of Object.entries(cit.pages ?? {})) {
  const { kept, dropped } = dropBlocked(page.citations ?? []);
  if (!dropped.length) continue;
  removed += dropped.length;
  page.citations = kept;
  for (const d of dropped) {
    console.log(`  ${key}: dropped PMID ${d.pmid} [${d.blockedBecause}] — ${String(d.title).slice(0, 56)}`);
  }
  // A page whose evidence was entirely withdrawn should say so rather than look
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
