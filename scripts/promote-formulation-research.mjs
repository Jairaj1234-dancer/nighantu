#!/usr/bin/env node
/**
 * Attach reviewed formulation literature to src/data/citations.json.
 *
 * Separate from scripts/formulation-research.mjs on purpose. That script asks PubMed and writes
 * nothing; this one writes, and only what a person has looked at. A formulation-name query can
 * match the wrong subject in a way a binomial query cannot, so the gap between finding a paper and
 * publishing it is where the review goes.
 *
 * EVERY SAFEGUARD HERE IS A SCAR. In one day this project found four separate places where a file
 * that accumulates measurements was rewritten from whatever the current run happened to produce:
 * the retraction blocklist would have shrunk from 14 entries to 4 and un-blocked ten retracted
 * papers; the manufacturer register lost 164 of 197 companies to a 32-row subset run; citations.json
 * itself emptied 31 live pages, including a herb page that went from 12 citations to 0, and the net
 * figure moved by only 70 because 61 other pages gained at the same time. So:
 *
 *   - it MERGES into the committed file, never replaces it
 *   - it REFUSES to run if any page would end up with fewer citations than it has now
 *   - it NEVER attaches a PMID on the cumulative retraction blocklist
 *   - it writes nothing without --write, and prints the full diff first
 *
 *   node scripts/promote-formulation-research.mjs --candidates FILE
 *   node scripts/promote-formulation-research.mjs --candidates FILE --write
 *   node scripts/promote-formulation-research.mjs --candidates FILE --only slug,slug --write
 */
import fs from 'node:fs';
import path from 'node:path';

const CITATIONS = path.join('src', 'data', 'citations.json');
const RETRACTIONS = path.join('data', 'retractions.json');
const PER_PAGE = 12;

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const CAND = argOf('--candidates', null);
const WRITE = process.argv.includes('--write');
const ONLY = (argOf('--only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);

if (!CAND || !fs.existsSync(CAND)) {
  console.error('Pass --candidates <file>, produced by scripts/formulation-research.mjs --json.');
  process.exit(1);
}

const doc = JSON.parse(fs.readFileSync(CITATIONS, 'utf8'));
const pages = doc.pages ?? {};
const cand = JSON.parse(fs.readFileSync(CAND, 'utf8'));

/** Cumulative and never re-attachable. The blocklist only grows, by design. */
const blocked = new Set();
if (fs.existsSync(RETRACTIONS)) {
  for (const f of JSON.parse(fs.readFileSync(RETRACTIONS, 'utf8')).flagged ?? []) {
    if (f.pmid) blocked.add(String(f.pmid));
  }
}

/** Counts before any change, so the no-shrink check has something real to compare against. */
const before = Object.fromEntries(
  Object.entries(pages).map(([k, v]) => [k, (v.citations ?? []).length]),
);

const added = [];
const refusedBlocked = [];
let pagesTouched = 0;

for (const [key, entry] of Object.entries(cand.pages ?? {})) {
  const slug = key.split('/')[1];
  if (ONLY.length && !ONLY.includes(slug)) continue;

  const target = pages[key];
  if (!target) {
    console.error(`${key} is not in ${CITATIONS}. Skipped rather than created: a page that the`);
    console.error('citation builder does not know about would be dropped on its next run.');
    continue;
  }

  const have = new Set((target.citations ?? []).map((c) => String(c.pmid)));
  const fresh = [];
  for (const c of entry.candidates ?? []) {
    const pmid = String(c.pmid);
    if (blocked.has(pmid)) { refusedBlocked.push(`${key} ${pmid}`); continue; }
    if (have.has(pmid)) continue;
    have.add(pmid);
    // matchedOn is kept: it records WHICH spelling matched, so any attachment can be audited
    // later without re-running the query.
    fresh.push({
      pmid,
      doi: c.doi ?? '',
      title: c.title ?? '',
      journal: c.journal ?? '',
      year: c.year ?? null,
      authors: Array.isArray(c.authors) ? c.authors : [],
      tier: c.tier ?? 'D',
      url: c.url ?? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      source: 'pubmed-formulation',
      matchedOn: c.matchedOn ?? null,
    });
  }
  if (!fresh.length) continue;

  target.citations = [...(target.citations ?? []), ...fresh].slice(0, PER_PAGE);
  pagesTouched += 1;
  for (const f of fresh) added.push({ key, pmid: f.pmid, year: f.year, title: f.title });
}

// -------------------------------------------------------------- the no-shrink gate
const shrunk = [];
for (const [k, n] of Object.entries(before)) {
  const now = (pages[k]?.citations ?? []).length;
  if (now < n) shrunk.push(`${k}: ${n} -> ${now}`);
}
if (shrunk.length) {
  console.error('REFUSING TO WRITE. These pages would lose citations:');
  for (const s of shrunk.slice(0, 20)) console.error(`  ${s}`);
  console.error('\nThis is the exact failure that emptied 31 live pages once before.');
  process.exit(1);
}

// -------------------------------------------------------------- report
console.log(`Candidates file: ${CAND}`);
console.log(`  prospected on   ${cand.prospectedOn ?? 'unknown'}`);
console.log(`  pages offered   ${Object.keys(cand.pages ?? {}).length}`);
if (ONLY.length) console.log(`  restricted to   ${ONLY.join(', ')}`);
console.log(`\nWould attach ${added.length} papers across ${pagesTouched} pages:\n`);

const byKey = {};
for (const a of added) (byKey[a.key] ??= []).push(a);
for (const [k, list] of Object.entries(byKey).sort()) {
  console.log(`  ${k}`);
  for (const a of list) {
    console.log(`     ${a.pmid}  ${a.year ?? '????'}  ${String(a.title).slice(0, 96)}`);
  }
}
if (refusedBlocked.length) {
  console.log(`\nRefused ${refusedBlocked.length} as retracted or corrected: ` +
    `${refusedBlocked.join(', ')}`);
}

const totalPages = Object.values(pages).filter((v) => (v.citations ?? []).length).length;
const formEmpty = Object.entries(pages)
  .filter(([k, v]) => k.startsWith('formulation/') && !(v.citations ?? []).length).length;
console.log(`\nAfter this: ${totalPages} pages carry citations; ` +
  `${formEmpty} formulation pages would still hold none.`);

if (!WRITE) {
  console.log('\nDry run. Nothing written. Re-run with --write to apply.');
  process.exit(0);
}

doc.pages = pages;
fs.writeFileSync(CITATIONS, `${JSON.stringify(doc, null, 1)}\n`);
console.log(`\nWrote ${CITATIONS}.`);
console.log('Run `npm run build` and the gate sweep before committing.');
