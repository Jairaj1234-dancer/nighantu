#!/usr/bin/env node
/**
 * Compliance and safety gate. Runs before every build and in CI.
 * Exits non-zero on any violation, so a bad ingest can never be published.
 */
import fs from 'node:fs';
import path from 'node:path';
import { FORBIDDEN_STRINGS, DENY_PATH_FRAGMENTS } from './config.mjs';
import { walk, parseFrontmatter } from './lib.mjs';
import { validateRecord, HEAVY_METAL_REQUIRED } from './lib/safety.mjs';
import { checkSources } from './lib/sources.mjs';
import { validateIdentifiers } from './lib/identifiers.mjs';
import { loadRetracted } from './lib/retractions.mjs';

const failures = [];
const fail = (check, detail) => failures.push({ check, detail });

const CONTENT = 'content';
const DIST = 'dist';

// Terms that must never sit inside or adjacent to a product module.
const DISEASE_TERMS = [
  'cancer', 'diabetes', 'diabetic', 'arthritis', 'insomnia', 'anxiety', 'depression',
  'hypertension', 'asthma', 'adhd', 'obesity', 'ulcer', 'eczema', 'psoriasis',
  'migraine', 'alzheimer', 'parkinson', 'epilepsy', 'infertility', 'pcos',
  'sinusitis', 'constipation', 'colitis', 'dementia', 'tumour', 'tumor',
  'osteoarthritis', 'rheumatoid', 'hypothyroid', 'hyperthyroid', 'anaemia', 'anemia',
];
const CLAIM_VERBS = [
  'cures', 'cure ', 'treats', 'treat ', 'heals', 'remedy for',
  'relieves', 'prevents', 'reverses', 'eliminates',
];
// Heritage framing belongs on sales collateral, not on an editorial reference site.
const HERITAGE_TERMS = ['baidyanath', 'house of baidyanath', 'est. 1917', 'since 1917'];
// Names of traditions the site does not publish, used as a leak canary.
const LEAK_TERMS = ['jie geng', 'dang shen', 'kabasura', 'sowa-rigpa', 'kampo designation'];

function readContent() {
  if (!fs.existsSync(CONTENT)) {
    fail('content-exists', 'content/ is missing. Run `npm run ingest` first.');
    return [];
  }
  return walk(CONTENT).map((rel) => {
    const raw = fs.readFileSync(path.join(CONTENT, rel), 'utf8');
    const { data, body } = parseFrontmatter(raw);
    return { rel, raw, data, body, lower: raw.toLowerCase() };
  });
}

const files = readContent();

// 1. Nothing published may originate from a denied vault path.
for (const f of files) {
  const src = String(f.data.srcRel ?? '');
  const hit = DENY_PATH_FRAGMENTS.find((d) => ('/' + src).includes(d));
  if (hit) fail('denied-source', `${f.rel} came from a denied path (${hit}): ${src}`);
}

// 2. Commercial strings.
for (const f of files) {
  for (const s of FORBIDDEN_STRINGS) {
    if (f.raw.includes(s)) fail('forbidden-string', `${f.rel} contains "${s}"`);
  }
}

// 3. Cross-tradition leakage through hub pages.
for (const f of files) {
  for (const t of LEAK_TERMS) {
    if (f.lower.includes(t)) fail('tradition-leak', `${f.rel} mentions "${t}"`);
  }
}

// 4. Heritage framing.
for (const f of files) {
  for (const t of HERITAGE_TERMS) {
    if (f.lower.includes(t)) fail('heritage-framing', `${f.rel} contains "${t}"`);
  }
}

// 5. No wikilink syntax may survive into published content.
for (const f of files) {
  if (f.raw.includes('[[') || f.raw.includes(']]')) {
    fail('wikilink-artifact', `${f.rel} still contains wikilink brackets`);
  }
}

// 6. Every page needs an answer block, which is the point of the exercise.
for (const f of files) {
  const a = String(f.data.answer ?? '');
  const words = (a.match(/\S+/g) || []).length;
  if (words < 10) fail('answer-block', `${f.rel} answer block is only ${words} words`);
  if (words > 75) fail('answer-block', `${f.rel} answer block is ${words} words (too long)`);
}

// 7. Chyawanprash facts are unresolved (herb count 45 vs 50 vs 18; Bhasma in
//    pregnancy). Those pages ship without a count until the source is settled.
const CP = /chyawanprash|chyavanprash/i;
// Same-line, not a character window: on long index pages an unrelated
// Chyawanprash mention elsewhere in the list produced false positives.
const onSameLine = (text, a, b) => text
  .split('\n')
  .find((line) => a.test(line) && b.test(line)) ?? null;
for (const f of files) {
  if (!CP.test(f.raw)) continue;
  // Only a herb count stated ABOUT Chyawanprash is a problem. "37 herbs" on a
  // Rasayana overview page about something else is not.
  const count = onSameLine(f.body, /\b\d{2}\s*(?:classical\s+)?herbs?\b/i, CP);
  if (count) fail('chyawanprash-herb-count', `${f.rel} states a herb count near a Chyawanprash mention while the source is contested`);
  const preg = onSameLine(f.body, /pregnan\w*/i, /bhasma|makardhwaj|makaradhwaj/i);
  if (preg && CP.test(preg)) {
    fail('chyawanprash-pregnancy', `${f.rel} pairs Bhasma/Makardhwaj with pregnancy guidance near Chyawanprash`);
  }
}

// 8. Post-build: no disease term or claim verb inside a product module.
//
// Product NAMES are fixed and are never changed to make a claim easier to write
// (ADHD Ease, Acid Relief and Natural Sleep Aid all carry a claim word in the
// name itself). Renaming is a packaging and licensing decision, not a copy edit.
// So the exact product titles are removed before scanning, and everything else
// in the module is held to the full standard.
const PRODUCT_TITLES = (() => {
  try {
    const data = JSON.parse(fs.readFileSync('src/data/products.json', 'utf8'));
    return Object.values(data.products).map((p) => String(p.title).toLowerCase());
  } catch { return []; }
})();

if (fs.existsSync(DIST)) {
  const htmlFiles = [];
  const walkDist = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walkDist(p);
      else if (e.name.endsWith('.html')) htmlFiles.push(p);
    }
  };
  walkDist(DIST);
  const MODULE = /<section[^>]*data-product-module[^>]*>([\s\S]*?)<\/section>/g;
  for (const p of htmlFiles) {
    const html = fs.readFileSync(p, 'utf8');
    for (const m of html.matchAll(MODULE)) {
      let text = m[1].replace(/<[^>]+>/g, ' ').toLowerCase();
      for (const t of PRODUCT_TITLES) text = text.split(t).join(' ');
      for (const t of DISEASE_TERMS) {
        if (new RegExp(`\\b${t}\\b`).test(text)) fail('product-claim', `${p} product module mentions "${t}"`);
      }
      for (const v of CLAIM_VERBS) {
        if (text.includes(v)) fail('product-claim', `${p} product module uses claim verb "${v.trim()}"`);
      }
    }
  }
  console.log(`audited ${htmlFiles.length} built pages`);
}

// 9-12. Safety layer.
//
// Coverage is enforced as a RATCHET rather than a fixed target. A hard "all 66
// bhasma pages must have heavy-metal data" gate would fail the build for as long as
// the work is in progress, which means it would get commented out, which means it
// would never fire. A ratchet fails only when coverage drops below what has already
// been earned, so it protects finished work without blocking unfinished work.
{
  const SAFETY = path.join('data', 'safety.json');
  const BASELINE = path.join('data', 'safety-baseline.json');

  const readJson = (f) => {
    if (!fs.existsSync(f)) return null;
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) { fail('safety-unreadable', `${f}: ${e.message}`); return null; }
  };

  const safety = readJson(SAFETY);
  const records = safety?.records ?? {};
  const slugs = Object.keys(records);

  if (slugs.length) {
    const pageOf = new Map(files.filter((f) => f.rel.startsWith('herb/'))
      .map((f) => [f.data.slug || path.basename(f.rel, '.md'), f.data]));

    // 9. Every stored record must still validate. A record that was written by a
    //    passing panel can still be broken later by a hand edit or a schema change.
    for (const slug of slugs) {
      const page = pageOf.get(slug);
      if (!page) { fail('safety-orphan', `data/safety.json has "${slug}" but no such herb page`); continue; }
      const v = validateRecord(records[slug], page);
      if (!v.ok) fail('safety-invalid', `${slug}: ${v.errors.join('; ')}`);
    }

    // 10. Sources must all be on the allowlist. validateRecord checks this too;
    //     repeating it here means the gate survives someone loosening the schema.
    for (const slug of slugs) {
      const bad = checkSources(records[slug].sources ?? []);
      if (!bad.ok) fail('safety-source', `${slug}: off-allowlist source ${bad.rejected.join(', ')}`);
    }

    // 11. Heavy metals on the kinds that require them.
    for (const slug of slugs) {
      const page = pageOf.get(slug);
      if (!page || !HEAVY_METAL_REQUIRED.has(page.subcategory || '')) continue;
      const rec = records[slug];
      const hasHm = rec.heavyMetals && String(rec.heavyMetals.text || '').trim();
      if (!hasHm && !rec.insufficientData) {
        fail('safety-heavy-metal', `${slug} (${page.subcategory}) has a record but no heavy-metal statement`);
      }
    }
  }

  // 12. The ratchet.
  const baseline = readJson(BASELINE) ?? { covered: 0, heavyMetalCovered: 0 };
  const heavyCovered = slugs.filter((s) => {
    const rec = records[s];
    return rec.heavyMetals && String(rec.heavyMetals.text || '').trim();
  }).length;

  if (slugs.length < (baseline.covered ?? 0)) {
    fail('safety-regression',
      `safety coverage fell from ${baseline.covered} to ${slugs.length} pages`);
  }
  if (heavyCovered < (baseline.heavyMetalCovered ?? 0)) {
    fail('safety-regression',
      `heavy-metal coverage fell from ${baseline.heavyMetalCovered} to ${heavyCovered} pages`);
  }
  console.log(`safety: ${slugs.length} records, ${heavyCovered} with heavy-metal data `
    + `(baseline ${baseline.covered ?? 0}/${baseline.heavyMetalCovered ?? 0})`);
}

// 13-15. Enrichment layer.
{
  const readJson = (f) => {
    if (!fs.existsSync(f)) return null;
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) { fail('enrich-unreadable', `${f}: ${e.message}`); return null; }
  };

  // 13. Every published identifier must match its own grammar. A malformed one is worse
  //     than a gap: it renders as a link, looks authoritative and resolves to nothing.
  const tax = readJson(path.join('src', 'data', 'taxonomy.json'));
  if (tax) {
    const r = validateIdentifiers(tax.taxa ?? [],
      { gbifKey: 'gbifKey', acceptedKey: 'gbifKey', wikidata: 'wikidata', ncbiTaxid: 'ncbiTaxid' },
      { label: 'taxonomy' });
    r.errors.forEach((e) => fail('bad-identifier', e));
  }
  const chem = readJson(path.join('src', 'data', 'chemistry.json'));
  if (chem) {
    const r = validateIdentifiers(chem.compounds ?? [],
      { cid: 'cid', inchikey: 'inchikey', formula: 'formula' }, { label: 'chemistry' });
    r.errors.forEach((e) => fail('bad-identifier', e));
  }

  // 14. Enrichment adds fields; it never edits what the verified passes produced. If a
  //     taxonomy run has quietly rewritten a botanical to GBIF's preferred spelling, the
  //     published name and the taxonomy record will have diverged from the decision that
  //     they should be shown side by side.
  if (tax) {
    const published = new Map();
    for (const f of files) {
      const b = String(f.data.botanical ?? '').trim();
      if (b) published.set(f.data.slug || path.basename(f.rel, '.md'), b);
    }
    for (const t of tax.taxa ?? []) {
      for (const pg of t.pages ?? []) {
        const cur = published.get(pg.slug);
        if (cur && pg.asPublished && cur !== pg.asPublished) {
          fail('botanical-overwritten',
            `${pg.slug}: taxonomy recorded "${pg.asPublished}" but the page now says "${cur}"`);
        }
      }
    }
  }

  // 15. Coverage ratchet, same shape as the safety one. A throttled or half-finished
  //     enrichment run must not be able to quietly delete resolutions already earned.
  const BASE = path.join('data', 'enrichment-baseline.json');
  const baseline = readJson(BASE) ?? {};
  const now = {
    taxaResolved: (tax?.taxa ?? []).filter((t) => t.status === 'ok').length,
    withWikidata: (tax?.taxa ?? []).filter((t) => t.wikidata).length,
    withNcbiTaxid: (tax?.taxa ?? []).filter((t) => t.ncbiTaxid).length,
    compoundsResolved: (chem?.compounds ?? []).filter((c) => c.cid).length,
  };
  for (const [k, v] of Object.entries(now)) {
    const was = baseline[k] ?? 0;
    if (v < was) fail('enrich-regression', `${k} fell from ${was} to ${v}`);
  }
  if (tax || chem) {
    console.log(`enrichment: ${now.taxaResolved} taxa, ${now.withWikidata} wikidata, `
      + `${now.withNcbiTaxid} ncbi, ${now.compoundsResolved} compounds `
      + `(baseline ${baseline.taxaResolved ?? 0}/${baseline.withWikidata ?? 0}/`
      + `${baseline.withNcbiTaxid ?? 0}/${baseline.compoundsResolved ?? 0})`);
  }
}

// 16. No published citation may be a retracted paper.
//
// A retracted citation is worse than a fabricated one. The fabricated one fails the
// moment anyone follows it; the retracted one resolves, looks completely normal, and
// lends a real journal's authority to a finding that has been withdrawn. 14 were found
// across 2,906 cited papers the first time anyone asked, and two pages were citing both
// a retracted paper and its own retraction notice.
{
  const retracted = loadRetracted();
  if (retracted.size) {
    const cits = (() => {
      const f = path.join('src', 'data', 'citations.json');
      if (!fs.existsSync(f)) return null;
      try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
      catch (e) { fail('citations-unreadable', e.message); return null; }
    })();
    if (cits) {
      let bad = 0;
      for (const [key, page] of Object.entries(cits.pages ?? {})) {
        for (const c of page.citations ?? []) {
          if (retracted.has(String(c.pmid))) {
            bad += 1;
            fail('retracted-citation', `${key} cites retracted PMID ${c.pmid}`);
          }
        }
      }
      console.log(`retractions: ${retracted.size} on the blocklist, ${bad} still cited`);
    }
  } else {
    // Silence here would mean the filter is off, which is indistinguishable from
    // there being nothing to filter. Say which it is.
    console.log('retractions: blocklist empty; run scripts/check-retractions.mjs');
  }
}

// ------------------------------------------------------------------ report
const byCheck = {};
for (const f of failures) (byCheck[f.check] ??= []).push(f.detail);

console.log(`audited ${files.length} content files`);
if (!failures.length) {
  console.log('PASS: no compliance violations');
  process.exit(0);
}
console.error(`\nFAIL: ${failures.length} violation(s)\n`);
for (const [check, details] of Object.entries(byCheck)) {
  console.error(`  ${check} (${details.length})`);
  details.slice(0, 8).forEach((d) => console.error(`    - ${d}`));
  if (details.length > 8) console.error(`    ... and ${details.length - 8} more`);
}
process.exit(1);
