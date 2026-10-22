#!/usr/bin/env node
/**
 * Apply src/data/disclosure-exclusions.json to the committed disclosure measurement.
 *
 * scripts/brand-disclosure.mjs now drops excluded pages before it aggregates, so a full re-run
 * honours the list. This applies the same exclusions to the measurement already committed,
 * recomputing only what those pages contribute to: each company's formulary-name page counts and
 * preparations sold, and each preparation's per-company state. It uses the generator's own rules
 * (best state, the count in that state, the three-company floor for a preparation row) and the
 * per-page states in the gitignored survey, data/brands/products.json, so it runs locally only.
 * The whole-range figures (wave 2) are a separate population and are not touched.
 *
 *   node scripts/apply-disclosure-exclusions.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join('src', 'data', 'brand-disclosure.json');
const SURVEY = process.env.BRANDS_DIR ?? path.join('data', 'brands');
const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const EXCLUDED = new Set(JSON.parse(fs.readFileSync(path.join('src', 'data', 'disclosure-exclusions.json'), 'utf8'))
  .excluded.map((x) => x.url));
const all = JSON.parse(fs.readFileSync(path.join(SURVEY, 'products.json'), 'utf8')).products;
const kept = all.filter((p) => !EXCLUDED.has(p.url));
const hit = all.length - kept.length;
if (hit !== EXCLUDED.size) {
  console.error(`FAIL: ${EXCLUDED.size} exclusions but ${hit} survey pages matched them`);
  process.exit(1);
}

const stateOf = (p) => {
  const s = (p.composition ?? {}).state;
  if (s !== 'found') return s === 'unreadable' ? 'unreadable' : 'neither';
  return p.quantityCount > 0 ? 'quantities' : 'list';
};
const RANK = { quantities: 3, list: 2, neither: 1, unreadable: 0 };
const MIN = data.minCompaniesForAPreparationRow ?? 3;

for (const c of data.companies) {
  const mine = kept.filter((p) => p.brand === c.id);
  c.pagesMeasured = mine.length;
  c.pagesWithQuantities = mine.filter((p) => stateOf(p) === 'quantities').length;
  c.pagesWithListOnly = mine.filter((p) => stateOf(p) === 'list').length;
  c.pagesWithNeither = mine.filter((p) => stateOf(p) === 'neither').length;
  c.pagesUnreadable = mine.filter((p) => stateOf(p) === 'unreadable').length;
  c.preparationsSold = new Set(mine.map((p) => p.formulation)).size;
}

let dropped = 0;
data.preparations = data.preparations.filter((prep) => {
  const companies = {};
  for (const id of Object.keys(prep.companies).sort()) {
    const pages = kept.filter((p) => p.brand === id && p.formulation === prep.slug);
    if (!pages.length) continue;
    const best = pages.map(stateOf).sort((x, y) => RANK[y] - RANK[x])[0];
    companies[id] = {
      state: best,
      pages: pages.length,
      pagesInThatState: pages.filter((p) => stateOf(p) === best).length,
      urls: pages.map((p) => p.url),
      readOn: pages.map((p) => String(p.fetchedAt ?? '').slice(0, 10)).sort()[0] ?? null,
    };
  }
  prep.companies = companies;
  if (Object.keys(companies).length < MIN) { dropped += 1; return false; }
  return true;
}).sort((a, b) => Object.keys(b.companies).length - Object.keys(a.companies).length || a.slug.localeCompare(b.slug));

data.exclusions = { file: 'src/data/disclosure-exclusions.json', pagesExcluded: EXCLUDED.size };
fs.writeFileSync(OUT, `${JSON.stringify(data, null, 2)}\n`);
console.log(`excluded ${EXCLUDED.size} pages; ${data.preparations.length} preparation rows (${dropped} fell below ${MIN} companies)`);
