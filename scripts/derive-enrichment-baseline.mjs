#!/usr/bin/env node
/**
 * Re-derive data/enrichment-baseline.json from the current build, and record that it was.
 *
 * That file holds four counts, and audit.mjs fails the deploy if any of them falls below the
 * recorded figure. It is the ratchet that catches an enrichment regression: taxa losing their GBIF
 * resolution, compounds losing their PubChem CIDs. It had no provenance at all, so a reader could
 * not tell when it was taken, from what, or whether the build it came from was trustworthy.
 *
 * THAT TURNED OUT TO MATTER. compounds.mjs read a file derived from its own output, so
 * build-downloads.sh never converged: consecutive builds on byte-identical content alternated
 * between 838 compounds with 466 resolved and 849 with 455, and compoundsResolved's baseline is
 * pinned at 455. The ratchet was being compared against a number that moved by eleven depending on
 * how many times the build had run. The loop is fixed, four consecutive builds now agree, and the
 * baseline turns out to have been correct for the converged state, but nothing in the file said so.
 *
 * SO THIS REFUSES TO LOWER A FIGURE. A baseline is a ratchet, and a tool that silently rewrites it
 * downwards converts every future regression into a new baseline, which is the one thing it must
 * never do. A drop means either a real regression to investigate or a build that has not converged,
 * and both want a human, not a rewrite. Pass --force only when the drop is understood and intended.
 *
 * Before trusting any figure from here, check the build converges: run ./scripts/build-downloads.sh
 * twice and confirm the counts do not move.
 *
 *   node scripts/derive-enrichment-baseline.mjs            report the comparison
 *   node scripts/derive-enrichment-baseline.mjs --write    write it if nothing fell
 *   node scripts/derive-enrichment-baseline.mjs --write --force   write it even if something fell
 */
import fs from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');
const FORCE = process.argv.includes('--force');
const BASE = path.join('data', 'enrichment-baseline.json');

const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const tax = read(path.join('src', 'data', 'taxonomy.json'));
const chem = read(path.join('src', 'data', 'chemistry.json'));
if (!tax || !chem) {
  console.error('src/data/taxonomy.json and src/data/chemistry.json must both exist.');
  console.error('Run ./scripts/build-downloads.sh first, twice, and check the counts agree.');
  process.exit(1);
}

/** The same four expressions audit.mjs uses, so the baseline cannot drift from what checks it. */
const now = {
  taxaResolved: (tax.taxa ?? []).filter((t) => t.status === 'ok').length,
  withWikidata: (tax.taxa ?? []).filter((t) => t.wikidata).length,
  withNcbiTaxid: (tax.taxa ?? []).filter((t) => t.ncbiTaxid).length,
  compoundsResolved: (chem.compounds ?? []).filter((c) => c.cid).length,
};

const prev = read(BASE) ?? {};
const fell = [];
console.log(`${'field'.padEnd(20)} ${'baseline'.padStart(9)} ${'now'.padStart(6)}`);
for (const [k, v] of Object.entries(now)) {
  const was = prev[k] ?? 0;
  if (v < was) fell.push(`${k} ${was} -> ${v}`);
  const mark = v === was ? '' : (v > was ? `  +${v - was}` : `  ${v - was}  FELL`);
  console.log(`${k.padEnd(20)} ${String(was).padStart(9)} ${String(v).padStart(6)}${mark}`);
}

if (fell.length && !FORCE) {
  console.error(`\nREFUSING TO WRITE. ${fell.length} figure(s) fell: ${fell.join('; ')}`);
  console.error('A baseline is a ratchet. Lowering it would turn this regression into the new');
  console.error('normal and every future one after it. Either find what regressed, or confirm the');
  console.error('build has converged by running ./scripts/build-downloads.sh twice, then pass');
  console.error('--force if the drop is understood and intended.');
  process.exit(1);
}

const payload = {
  _note: 'Ratchet for audit.mjs: it fails the deploy if any figure falls below these. Re-derive '
    + 'with scripts/derive-enrichment-baseline.mjs, and only from a build that converges: run '
    + './scripts/build-downloads.sh twice and confirm the counts do not move. compounds.mjs used '
    + 'to read a file derived from its own output, which made the build alternate between 455 and '
    + '466 resolved compounds on nothing but build parity.',
  derivedAt: new Date().toISOString().slice(0, 10),
  ...now,
};

if (!WRITE) {
  console.log(`\nNothing fell. Dry run; re-run with --write to stamp ${BASE}.`);
  process.exit(0);
}
fs.writeFileSync(BASE, `${JSON.stringify(payload, null, 1)}\n`);
console.log(`\nwrote ${BASE}${fell.length ? ' (forced over a drop)' : ''}`);
