#!/usr/bin/env node
/**
 * The reworded research lines in data/research-rewrites.json, applied to content/.
 *
 * Ingest applies the same file (lib/rewrites.mjs), so this is for pages already written. Body
 * lines and the answer and whoStatus front-matter lines are matched as a reader sees them; see
 * lib/rewrites.mjs for why.
 *
 *   node scripts/fix-research-claims.mjs            report what would change
 *   node scripts/fix-research-claims.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk } from './lib.mjs';
import { applyRewrites, loadRewrites, plainKey } from './lib/rewrites.mjs';

const WRITE = process.argv.includes('--write');
const rows = loadRewrites();
let pages = 0;
let lines = 0;
const missing = [];
for (const rel of walk('content').filter((f) => f.endsWith('.md'))) {
  const page = rel.replace(/\.md$/, '');
  if (!rows.has(page)) continue;
  const f = path.join('content', rel);
  const before = fs.readFileSync(f, 'utf8');
  const { text, changed } = applyRewrites(page, before);
  // A row counts as found if its original was rewritten now or its rewrite is already there.
  const present = new Set(before.split('\n').map(plainKey));
  const already = [...rows.get(page).values()].filter((to) => present.has(plainKey(to))).length;
  if (changed + already < rows.get(page).size) missing.push(`${page}: ${changed + already} of ${rows.get(page).size} found`);
  if (text === before) continue;
  pages += 1;
  lines += changed;
  if (WRITE) fs.writeFileSync(f, text);
}
console.log(`${WRITE ? 'rewrote' : 'would rewrite'} ${lines} line(s) on ${pages} page(s)`);
for (const m of missing) console.log('  not all matched:', m);
