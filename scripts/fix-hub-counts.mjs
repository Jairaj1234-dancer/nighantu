#!/usr/bin/env node
/**
 * Apply lib.mjs recountHub to the hub pages in content/reference, front matter included.
 *
 *   node scripts/fix-hub-counts.mjs            report what would change
 *   node scripts/fix-hub-counts.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';
import { recountHub } from './lib.mjs';

const WRITE = process.argv.includes('--write');
let n = 0;
for (const name of fs.readdirSync(path.join('content', 'reference'))) {
  const f = path.join('content', 'reference', name);
  const before = fs.readFileSync(f, 'utf8');
  const after = recountHub(before);
  if (after === before) continue;
  n += 1;
  if (WRITE) fs.writeFileSync(f, after);
}
console.log(`${WRITE ? 'fixed' : 'would fix'} ${n} hub page(s)`);
