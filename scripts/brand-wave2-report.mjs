#!/usr/bin/env node
/**
 * Read wave 2 against wave 1, and say whether the published comparison is still fair.
 *
 * Wave 1 read every product whose URL slug matched one of the 101 formulary entries transcribed
 * here: 210 pages. /choosing/who-publishes-the-composition/ states figures from it, such as
 * "Patanjali Ayurved published an ingredient list on 48 of 53". That sentence is true of the 53
 * pages it was measured on, and a reader will take it as a fact about the company. Wave 2 reads
 * the whole product range on each permitted host, which is the only way to find out whether those
 * two readings are the same thing.
 *
 * THREE QUESTIONS, and the third is the one that decides whether anything on the site changes.
 *
 *   1. FULL-RANGE DISCLOSURE. Of everything a company sells, how much does it document? Printed
 *      beside the formulary-name subset so the two can be compared directly.
 *
 *   2. MATCHER RECALL. A classical preparation whose URL spells its name a way the slug matcher
 *      does not reach is invisible to wave 1 and uncounted, and the size of that blind spot was
 *      never measured. So the matcher is re-run here against each page's OWN TITLE, which is a
 *      different spelling of the same name, on the pages wave 1 did not match. A hit is a page
 *      wave 1 should have had.
 *
 *   3. IS THE PUBLISHED FIGURE MISLEADING? A company whose classical range is documented far
 *      better than its proprietary range is a company about which "publishes a list on 48 of 53"
 *      invites the wrong conclusion. This prints the gap per company and says which way it runs.
 *      It changes nothing by itself: what to do about a gap is a judgement, and the page names
 *      companies, so it is not one to automate.
 *
 *   node scripts/brand-wave2-report.mjs            summary
 *   node scripts/brand-wave2-report.mjs --misses   also list the pages wave 1 missed
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildMatcher } from './lib/formulation-names.mjs';

const SURVEY = path.join('data', 'brands');
const SHOW_MISSES = process.argv.includes('--misses');

const read = (f) => {
  const p = path.join(SURVEY, f);
  if (!fs.existsSync(p)) {
    console.error(`${p} is absent. Run scripts/brand-catalogue.mjs${f.includes('wave2') ? ' --wave2' : ''} first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

const w1 = read('products.json');
const w2 = read('products-wave2.json');
const afi = JSON.parse(fs.readFileSync(path.join('src', 'data', 'composition.json'), 'utf8')).records;

const FORMULATIONS = Object.entries(afi).map(([slug, r]) => ({
  slug,
  names: [slug.replace(/-/g, ' '), r.entryHeading].filter(Boolean),
}));
const matchName = buildMatcher(FORMULATIONS);

/** The same reading the survey and the monitor make. */
const stateOf = (p) => {
  const s = (p.composition ?? {}).state;
  if (s !== 'found') return s === 'unreadable' ? 'unreadable' : 'neither';
  return p.quantityCount > 0 ? 'quantities' : 'list';
};

const tally = (rows) => {
  const t = { pages: rows.length, quantities: 0, list: 0, neither: 0, unreadable: 0 };
  for (const r of rows) t[stateOf(r)] += 1;
  return t;
};
const documented = (t) => (t.pages ? (t.quantities + t.list) / t.pages : 0);
const pc = (x) => `${Math.round(x * 100)}%`;
const pad = (s, n) => String(s).padEnd(n);

const w1Read = w1.products.filter((p) => p.outcome === 'read');
const w2Read = w2.products.filter((p) => p.outcome === 'read');
const brands = [...new Set(w2Read.map((p) => p.brand))];
const nameOf = (id) => (w2Read.find((p) => p.brand === id) ?? {}).brandName ?? id;

console.log(`wave 1   ${w1Read.length} pages read, matched to a formulary name by URL slug, on ${w1.collectedOn}`);
console.log(`wave 2   ${w2Read.length} pages read, the whole product range, on ${w2.collectedOn}`);
if (w2.perHostLimit) console.log(`         per-host limit ${w2.perHostLimit}, so this is not the whole range`);

// ------------------------------------------------------------ 1. full range vs formulary subset
console.log('');
console.log('FULL RANGE AGAINST THE FORMULARY-NAME SUBSET');
console.log('"documented" means the page carried an ingredient list, with or without quantities.');
console.log('');
console.log(`${pad('company', 24)}${pad('full range', 30)}${pad('formulary names only', 30)}gap`);
const gaps = [];
for (const b of brands) {
  const full = tally(w2Read.filter((p) => p.brand === b));
  const sub = tally(w1Read.filter((p) => p.brand === b));
  const gap = documented(full) - documented(sub);
  gaps.push({ b, full, sub, gap });
  console.log(`${pad(nameOf(b), 24)}`
    + `${pad(`${full.quantities + full.list} of ${full.pages} (${pc(documented(full))})`, 30)}`
    + `${pad(sub.pages ? `${sub.quantities + sub.list} of ${sub.pages} (${pc(documented(sub))})` : 'none in wave 1', 30)}`
    + `${sub.pages ? `${gap >= 0 ? '+' : ''}${Math.round(gap * 100)} pts` : ''}`);
}

console.log('');
console.log('Quantities, which are the rarer thing and the only state in which a product can be');
console.log('checked against the formulary at all:');
console.log('');
console.log(`${pad('company', 24)}${pad('full range', 26)}formulary names only`);
for (const { b, full, sub } of gaps) {
  console.log(`${pad(nameOf(b), 24)}`
    + `${pad(`${full.quantities} of ${full.pages} (${pc(full.pages ? full.quantities / full.pages : 0)})`, 26)}`
    + `${sub.pages ? `${sub.quantities} of ${sub.pages} (${pc(sub.quantities / sub.pages)})` : 'none in wave 1'}`);
}

// ------------------------------------------------------------------------- 2. matcher recall
/**
 * Re-run the matcher on the page's own title, for pages the URL slug did not match.
 *
 * This is not a second chance at the same test. The slug and the title are different spellings
 * written by different people at the same company, so a title hit on a slug miss is evidence the
 * matcher's recall is limited by the spelling it was given rather than by the product range.
 */
const unmatched = w2Read.filter((p) => !p.matchedByName);
const misses = [];
for (const p of unmatched) {
  const hits = matchName(String(p.productName ?? ''));
  if (hits.length) misses.push({ p, hits });
}

console.log('');
console.log('WHAT THE SLUG MATCHER MISSED');
console.log(`${unmatched.length} pages carried no formulary name in their URL slug. Running the same matcher`);
console.log('against each page\'s own title instead finds a formulary name on:');
console.log('');
const missBy = {};
for (const m of misses) (missBy[m.p.brand] ??= []).push(m);
for (const b of brands) {
  const n = (missBy[b] ?? []).length;
  const pool = unmatched.filter((p) => p.brand === b).length;
  console.log(`${pad(nameOf(b), 24)}${pad(`${n} of ${pool}`, 14)}`
    + (n ? `${pc(n / pool)} of its unmatched pages name a formulary preparation in the title` : ''));
}
console.log('');
console.log(`total ${misses.length} page(s) wave 1 should have had, across `
  + `${new Set(misses.map((m) => m.hits[0].slug)).size} formulation(s).`);

if (SHOW_MISSES && misses.length) {
  console.log('');
  for (const m of misses.slice(0, 60)) {
    console.log(`  ${pad(m.p.brand, 14)}${pad(m.hits.map((h) => h.slug).join(','), 26)}${stateOf(m.p)}`);
    console.log(`  ${' '.repeat(14)}${String(m.p.productName ?? '').slice(0, 90)}`);
  }
  if (misses.length > 60) console.log(`  and ${misses.length - 60} more`);
}

// --------------------------------------------------------- 3. is the published figure misleading
console.log('');
console.log('DOES THE PUBLISHED PAGE NEED RESTATING?');
console.log('A figure measured on the classical range reads as a fact about the company. Where the');
console.log('two differ by more than 15 points, saying "on 48 of 53 pages" without saying which 53');
console.log('invites a conclusion the measurement does not support.');
console.log('');
const material = gaps.filter((g) => g.sub.pages > 0 && Math.abs(g.gap) > 0.15);
if (!material.length) {
  console.log('No company differs by more than 15 points. The published figures read the same way on');
  console.log('either population, and the page needs no restatement on this account.');
} else {
  for (const g of material) {
    const better = g.gap < 0 ? 'its classical range is documented better than the rest of what it sells'
      : 'the rest of what it sells is documented better than its classical range';
    console.log(`  ${nameOf(g.b)}: ${Math.abs(Math.round(g.gap * 100))} points, ${better}.`);
  }
  console.log('');
  console.log('These are the companies whose row on /choosing/who-publishes-the-composition/ should');
  console.log('say which population it was measured on, or carry both figures. The page names real');
  console.log('companies, so which of those to do is a judgement and is not made here.');
}
