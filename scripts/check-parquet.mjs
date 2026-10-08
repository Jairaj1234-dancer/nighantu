#!/usr/bin/env node
/**
 * Does the committed Parquet still match the source it was built from?
 *
 * public/parquet/composition.parquet is committed rather than generated in CI, because converting
 * it needs Python and pyarrow and the file changes a few times a year. That trade is only
 * defensible with this check: a committed derived file with no freshness test is a file that will
 * eventually state something the source no longer says, and on this site a stale quantity is
 * exactly the kind of error the whole project exists to avoid.
 *
 * The check is a hash comparison, not a Parquet read, so it needs nothing but Node. The generator
 * records the sha256 of src/data/composition.json beside the file; if the source has moved, the
 * build fails and names the command to run.
 *
 * The other four Parquet files have no such record. They are checked only for existence here,
 * which is honest about what is and is not verified rather than implying all five are guarded.
 *
 *   node scripts/check-parquet.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = path.join('public', 'parquet');
const GUARDED = [
  { parquet: 'composition.parquet', sidecar: 'composition.parquet.json', source: path.join('src', 'data', 'composition.json'), rebuild: 'python3 scripts/composition-parquet.py' },
];
const EXPECTED = ['dravyaguna.parquet', 'compounds.parquet', 'research.parquet', 'taxonomy.parquet'];

const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };

for (const g of GUARDED) {
  const p = path.join(DIR, g.parquet);
  const s = path.join(DIR, g.sidecar);
  if (!fs.existsSync(p)) { fail(`${p} is missing. Run: ${g.rebuild}`); continue; }
  if (!fs.existsSync(s)) { fail(`${s} is missing, so ${g.parquet} cannot be checked. Run: ${g.rebuild}`); continue; }

  let side;
  try { side = JSON.parse(fs.readFileSync(s, 'utf8')); } catch { fail(`${s} is not valid JSON`); continue; }
  const actual = crypto.createHash('sha256').update(fs.readFileSync(g.source)).digest('hex');
  if (side.sourceSha256 !== actual) {
    fail(`${g.parquet} is stale: it was built from a different ${g.source}.`);
    console.error(`  recorded ${side.sourceSha256}`);
    console.error(`  current  ${actual}`);
    console.error(`  Run: ${g.rebuild}`);
    continue;
  }
  console.log(`${g.parquet.padEnd(22)} current, ${side.rows} rows from ${side.formulations} formulations`);
}

for (const f of EXPECTED) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) fail(`${p} is missing`);
  else console.log(`${f.padEnd(22)} present (no freshness record, existence only)`);
}

if (process.exitCode) process.exit(1);
console.log('\nPASS: every advertised Parquet distribution exists, and the guarded one is current.');
