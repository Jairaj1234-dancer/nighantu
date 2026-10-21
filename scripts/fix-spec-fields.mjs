#!/usr/bin/env node
/**
 * Apply lib.mjs dropSpecFields to content/: the uncited manufacturing specifications in the
 * preparation block (bioavailability, standardized extract, quality parameters, analytical
 * methods, shelf life, extraction methods).
 *
 *   node scripts/fix-spec-fields.mjs            report what would change
 *   node scripts/fix-spec-fields.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk, dropSpecFields } from './lib.mjs';

const WRITE = process.argv.includes('--write');
let n = 0;
for (const rel of walk('content').filter((f) => f.endsWith('.md'))) {
  const f = path.join('content', rel);
  const before = fs.readFileSync(f, 'utf8');
  const after = dropSpecFields(before);
  if (after === before) continue;
  n += 1;
  if (WRITE) fs.writeFileSync(f, after);
}
console.log(`${WRITE ? 'fixed' : 'would fix'} ${n} file(s)`);
