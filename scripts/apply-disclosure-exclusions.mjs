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
 * The whole range (wave 2) loses only the exclusions marked for it, the blog articles: the other
 * two kinds are real products that each company sells, filed under the wrong preparation.
 *
 *   node scripts/apply-disclosure-exclusions.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildMatcher } from './lib/formulation-names.mjs';

const OUT = path.join('src', 'data', 'brand-disclosure.json');
const SURVEY = process.env.BRANDS_DIR ?? path.join('data', 'brands');
const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const EXCLUSIONS = JSON.parse(fs.readFileSync(path.join('src', 'data', 'disclosure-exclusions.json'), 'utf8')).excluded;
const EXCLUDED = new Set(EXCLUSIONS.map((x) => x.url));
const EXCLUDED_FROM_RANGE = new Set(EXCLUSIONS.filter((x) => x.appliesTo.includes('whole-range')).map((x) => x.url));
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

// ---------------------------------------------------------------- the whole range (wave 2)
const w2 = JSON.parse(fs.readFileSync(path.join(SURVEY, 'products-wave2.json'), 'utf8')).products
  .filter((p) => !EXCLUDED_FROM_RANGE.has(p.url));
const read = (p) => p.outcome === 'read';
const isListingPath = (u) => {
  try {
    const segs = String(u).replace(/^https?:\/\/[^/]+/, '').split('?')[0].split('/').filter(Boolean);
    return segs.length <= 1 && (!segs.length || /^(products?|shop|collections?|catalogue|catalog)$/i.test(segs[0]));
  } catch { return false; }
};
for (const c of data.companies) {
  if (!c.range) continue;
  const w2All = w2.filter((p) => p.brand === c.id);
  const w2Product = w2All.filter(read).filter((p) => !isListingPath(p.url));
  Object.assign(c.range, {
    pagesRead: w2Product.length,
    pagesAttempted: w2All.length,
    pagesWithQuantities: w2Product.filter((p) => stateOf(p) === 'quantities').length,
    pagesWithListOnly: w2Product.filter((p) => stateOf(p) === 'list').length,
    pagesWithNeither: w2Product.filter((p) => stateOf(p) === 'neither').length,
    pagesUnreadable: w2Product.filter((p) => stateOf(p) === 'unreadable').length,
    pagesStatingADose: w2Product.filter((p) => (p.dose ?? {}).state === 'found').length,
    pagesCitingTheFormulary: w2Product.filter((p) => (p.authorities ?? []).some((a) => a.id === 'afi')).length,
    pagesCitingAnyAuthority: w2Product.filter((p) => (p.authorities ?? []).length > 0).length,
  });
}
const afi = JSON.parse(fs.readFileSync(path.join('src', 'data', 'composition.json'), 'utf8')).records;
const match = buildMatcher(Object.entries(afi).map(([slug, r]) => ({ slug, names: [slug.replace(/-/g, ' '), r.entryHeading].filter(Boolean) })));
Object.assign(data.wholeRange, {
  pagesAttempted: w2.length,
  pagesRead: w2.filter(read).length,
  pagesThatCouldNotBeRead: w2.filter((p) => !read(p)).length,
  pagesRenderingClientSide: w2.filter((p) => read(p) && stateOf(p) === 'unreadable').length,
  pagesStatingADose: w2.filter((p) => read(p) && (p.dose ?? {}).state === 'found').length,
  pagesStatingADoseQuantity: w2.filter((p) => read(p) && (p.dose ?? {}).states === 'quantity').length,
  pagesGivingADirectionWithNoQuantity: w2.filter((p) => read(p) && (p.dose ?? {}).states === 'instruction').length,
  pagesNamingIngredients: w2.filter((p) => read(p) && (p.composition ?? {}).state === 'found').length,
  pagesStatingNeitherQuantityNorIngredients: w2.filter((p) => read(p)
    && (p.dose ?? {}).states !== 'quantity' && (p.composition ?? {}).state !== 'found').length,
  pagesCitingTheFormulary: w2.filter((p) => read(p) && (p.authorities ?? []).some((a) => a.id === 'afi')).length,
  pagesCitingAnyAuthority: w2.filter((p) => read(p) && (p.authorities ?? []).length > 0).length,
  slugMatcherMissesFoundByTitle: w2.filter((p) => read(p) && !p.matchedByName && match(String(p.productName ?? '')).length).length,
  pagesWithNoFormularyNameInTheSlug: w2.filter((p) => read(p) && !p.matchedByName).length,
});

data.exclusions = {
  file: 'src/data/disclosure-exclusions.json',
  pagesExcludedFromFormularyNamePages: EXCLUDED.size,
  pagesExcludedFromWholeRange: EXCLUDED_FROM_RANGE.size,
};
fs.writeFileSync(OUT, `${JSON.stringify(data, null, 2)}\n`);
console.log(`excluded ${EXCLUDED.size} formulary-name pages and ${EXCLUDED_FROM_RANGE.size} whole-range pages; ${data.preparations.length} preparation rows (${dropped} fell below ${MIN} companies)`);
