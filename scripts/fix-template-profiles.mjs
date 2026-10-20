#!/usr/bin/env node
/**
 * Apply lib.mjs dropContradictedProfile to content/: templated mineral profiles that the page
 * itself contradicts (the mercury template on herbal rasayanas and svarasas, and the listed pages).
 *
 *   node scripts/fix-template-profiles.mjs            report what would change
 *   node scripts/fix-template-profiles.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk, dropContradictedProfile } from './lib.mjs';

const WRITE = process.argv.includes('--write');
let n = 0;
for (const rel of walk('content').filter((f) => f.endsWith('.md'))) {
  const f = path.join('content', rel);
  const before = fs.readFileSync(f, 'utf8');
  const after = dropContradictedProfile(before, rel.replace(/\.md$/, ''));
  if (after === before) continue;
  n += 1;
  console.log(`${WRITE ? 'fixed' : 'would fix'} ${rel}`);
  if (WRITE) fs.writeFileSync(f, after);
}
console.log(`${n} file(s)`);
