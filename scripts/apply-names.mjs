#!/usr/bin/env node
/**
 * Build src/data/names.json, the only name file the site reads.
 *
 * Two sources, and they are not equal.
 *
 * The Ayurvedic Pharmacopoeia of India is the statutory reference: if it prints
 * "Hindi : Gokhru" under the Goksura monograph, that is the official name of the drug and
 * needs no second opinion. Its names go straight in, for every monograph whose SYNONYMS block
 * parsed exactly (`inline`) or whose labels and values aligned one-to-one (`positional`).
 * Blocks the parser could not align are excluded here and stay in the candidates file.
 *
 * Wikidata is crowd-sourced and demonstrably wrong in this dataset: it lists aśvattha, which
 * is Ficus religiosa, as a Sanskrit alias for both Adhatoda vasica and Aegle marmelos. Nothing
 * from it is published unless workflows/verify-names.js corroborated it against an independent
 * named source, and nothing marked confirmed without naming that source counts as confirmed.
 *
 * Rejections are kept, not dropped. A names table is exactly where a quiet bulk import would
 * be hardest to notice, so the count of what was thrown out and every name found to belong to
 * a different plant are written into the output alongside what was kept.
 *
 *   node scripts/apply-names.mjs                        # Pharmacopoeia only
 *   node scripts/apply-names.mjs --adjudicated <file.json>   # plus reconstructed alignments
 *   node scripts/apply-names.mjs --verdicts <file.json>      # plus corroborated Wikidata names
 *   node scripts/apply-names.mjs --dry
 */
import fs from 'node:fs';
import path from 'node:path';
import { toIAST, asciiKey, skeletonKey } from './lib/devanagari.mjs';

const API_IN = path.join('data', 'name-candidates-api.json');
const WD_IN = path.join('data', 'name-candidates.json');
const OUT = path.join('src', 'data', 'names.json');
const DRY = process.argv.includes('--dry');
const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
};
const VERDICTS = arg('--verdicts');
const ADJUDICATED = arg('--adjudicated');

/**
 * Display order, not alphabetical. Sanskrit first because it is the name the classical texts
 * and the Pharmacopoeia itself use, then the languages readers actually arrived searching in,
 * then the rest. The site renders in this order so the row a reader wants is near the top.
 */
const LANGS = [
  ['sa', 'Sanskrit'], ['hi', 'Hindi'], ['en', 'English'], ['ta', 'Tamil'],
  ['ml', 'Malayalam'], ['te', 'Telugu'], ['kn', 'Kannada'], ['mr', 'Marathi'],
  ['bn', 'Bengali'], ['gu', 'Gujarati'], ['ur', 'Urdu'], ['pa', 'Punjabi'],
  ['or', 'Oriya'], ['as', 'Assamese'], ['ks', 'Kashmiri'],
];
const LANG_NAME = Object.fromEntries(LANGS);
const ORDER = Object.fromEntries(LANGS.map(([c], i) => [c, i]));

const API_SOURCE = 'Ayurvedic Pharmacopoeia of India';

const pages = new Map();
const ensure = (kind, slug) => {
  const key = `${kind}/${slug}`;
  if (!pages.has(key)) pages.set(key, { kind, slug, names: {} });
  return pages.get(key);
};

const counts = { api: 0, apiRecords: 0, adjudicated: 0, adjudicatedRecords: 0, adjudicationDeclined: 0, corroborated: 0, discovered: 0, rejected: 0, duplicate: 0, variantsCollapsed: 0 };
const rejected = [];

/**
 * Add one name. Returns true if it created a new entry.
 *
 * The API prints several names per language on one line ("Amla, Aonla"), and some drugs have
 * two monographs (Arka Root and Arka Leaf) that both map to one page. So a name arriving
 * twice is normal and merges its sources rather than making a duplicate row.
 */
function add(kind, slug, code, raw, source, preferred) {
  if (!LANG_NAME[code]) return false;
  const page = ensure(kind, slug);
  if (!page.names[code]) page.names[code] = [];
  let created = false;

  for (const part of String(raw).split(/\s*,\s*/)) {
    const name = part.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 60) continue;
    const iast = toIAST(name);
    /**
     * The dedup key falls back to the name itself for scripts with no ASCII form.
     *
     * asciiKey strips Devanagari (which toIAST has already converted) but every other
     * non-Latin script is left for the final [^a-z0-9] pass to remove, so a Tamil name
     * reduced to an empty key and was silently skipped. That dropped all 148 verified Tamil
     * names on the floor and the only symptom was a Tamil count that looked too low.
     */
    const key = asciiKey(iast || name) || name.normalize('NFC');
    if (!key) continue;

    const existing = page.names[code].find((n) => (asciiKey(n.iast || n.name) || n.name.normalize('NFC')) === key);
    if (existing) {
      if (preferred) existing.preferred = true;
      if (source && !existing.sources.includes(source)) existing.sources.push(source);
      /**
       * Same name, two scripts: show it in its own script.
       *
       * The Pharmacopoeia romanises everything ("Tuvari") and Wikidata gives Devanagari
       * ("तुवरी"), so the same Sanskrit name arrives twice and merges on one key. Whichever
       * landed first used to win, which meant the Pharmacopoeia pass always buried the
       * Devanagari, and a Sanskrit row read "Tuvari" to a reader who can read the script it
       * is actually written in. The native script is the better display form; the romanised
       * one survives as the IAST beside it.
       */
      if (/[ऀ-ॿ]/.test(name) && !/[ऀ-ॿ]/.test(existing.name)) {
        if (!existing.iast) existing.iast = existing.name;
        existing.name = name;
        const better = toIAST(name);
        if (better) existing.iast = better;
      }
      counts.duplicate += 1;
      continue;
    }
    page.names[code].push({
      name,
      ...(iast ? { iast } : {}),
      ...(preferred ? { preferred: true } : {}),
      sources: source ? [source] : [],
    });
    created = true;
  }
  return created;
}

// ---- 1. The Pharmacopoeia, published directly ----------------------------------------

if (fs.existsSync(API_IN)) {
  const api = JSON.parse(fs.readFileSync(API_IN, 'utf8'));
  for (const r of api.records) {
    if (!r.page) continue;
    if (r.alignment !== 'inline' && r.alignment !== 'positional') continue;
    counts.apiRecords += 1;
    for (const n of r.names ?? []) {
      if (add(r.page.kind, r.page.slug, n.code, n.value, API_SOURCE, false)) counts.api += 1;
    }
  }
  console.log(`Pharmacopoeia  ${counts.apiRecords} aligned monographs`);
} else {
  console.log(`Pharmacopoeia  ${API_IN} not found, skipping`);
}

// ---- 1b. Pharmacopoeia blocks whose alignment was adjudicated ------------------------

/**
 * Names from blocks where OCR left the labels and values in separate columns of unequal
 * length, with the gap placed by workflows/adjudicate-names.js.
 *
 * These are still Pharmacopoeia names and the source credit says so, with a note that the
 * label-to-name alignment was reconstructed rather than read directly. That distinction
 * belongs on the page: the name is the Pharmacopoeia's, the decision that it is the Malayalam
 * one rather than the Kashmiri one is ours.
 *
 * Only alignments the workflow marked `accepted` are used. It checks its own arithmetic
 * first: the languages called blank plus the names placed have to account for every label,
 * so an agent that claims alignment while placing ten names against fifteen labels is
 * dropped before it reaches here.
 */
if (ADJUDICATED) {
  if (!fs.existsSync(ADJUDICATED)) {
    console.error(`Adjudication file not found: ${ADJUDICATED}`);
    process.exit(1);
  }
  const labelToCode = Object.fromEntries(LANGS.map(([c, label]) => [label.toLowerCase(), c]));
  // The Pharmacopoeia's own spelling, which differs from the display label.
  labelToCode.gujrati = 'gu';

  const pageFor = new Map();
  if (fs.existsSync(API_IN)) {
    for (const r of JSON.parse(fs.readFileSync(API_IN, 'utf8')).records) {
      if (r.page) pageFor.set(r.page.slug, r.page);
    }
  }

  const adj = JSON.parse(fs.readFileSync(ADJUDICATED, 'utf8'));
  let placed = 0;
  let declined = 0;
  for (const r of adj.accepted ?? []) {
    const page = pageFor.get(r.slug);
    if (!page) continue;
    for (const a of r.assignments ?? []) {
      const code = labelToCode[String(a.lang ?? '').trim().toLowerCase()];
      if (!code) continue;
      if (add(page.kind, page.slug, code, a.value, `${API_SOURCE} (column alignment reconstructed)`, false)) placed += 1;
    }
    counts.adjudicatedRecords += 1;
  }
  for (const r of adj.records ?? []) if (!r.aligned) declined += 1;
  counts.adjudicated = placed;
  counts.adjudicationDeclined = declined;
  console.log(`Adjudicated    ${counts.adjudicatedRecords} monographs aligned, ${placed} names, ${declined} declined as ambiguous`);
} else {
  console.log('Adjudicated    no --adjudicated given, unaligned blocks stay unpublished');
}

// ---- 2. Wikidata, only where corroborated --------------------------------------------

if (VERDICTS) {
  if (!fs.existsSync(VERDICTS)) {
    console.error(`Verdicts file not found: ${VERDICTS}`);
    process.exit(1);
  }
  // Verdicts carry a slug but not the page kind; recover it from the harvest rather than
  // assume 'herb', because a name attached to the wrong page is the failure being avoided.
  const kindFor = new Map();
  if (fs.existsSync(WD_IN)) {
    for (const c of JSON.parse(fs.readFileSync(WD_IN, 'utf8')).candidates) kindFor.set(c.slug, c.kind);
  }

  const result = JSON.parse(fs.readFileSync(VERDICTS, 'utf8'));
  for (const v of result.verdicts ?? []) {
    const kind = kindFor.get(v.slug);
    if (!kind) continue;
    if (v.confirmed && v.corroboratingSource) {
      if (add(kind, v.slug, v.lang, v.name, v.corroboratingSource, v.preferred)) counts.corroborated += 1;
    } else {
      counts.rejected += 1;
      if (v.denotesInstead) {
        rejected.push({ slug: v.slug, lang: v.lang, name: v.name, denotesInstead: v.denotesInstead, reason: v.reason ?? '' });
      } else if (v.confirmed) {
        rejected.push({ slug: v.slug, lang: v.lang, name: v.name, denotesInstead: '', reason: 'marked confirmed with no source named, so not published' });
      }
    }
  }
  for (const d of result.discovered ?? []) {
    const kind = kindFor.get(d.slug);
    if (!kind || !d.source) continue;   // the source is the whole justification
    if (add(kind, d.slug, d.lang, d.name, d.source, false)) counts.discovered += 1;
  }
  console.log(`Wikidata       ${counts.corroborated} corroborated, ${counts.rejected} rejected, ${counts.discovered} found directly in a source`);
} else {
  console.log('Wikidata       no --verdicts given, nothing from the unverified harvest');
}

// ---- 3. Order, prune, write -----------------------------------------------------------

/**
 * Collapse romanisation variants of one name, within one language on one page.
 *
 * Without this, Adhaki's Tamil row reads "துவரை, Adagi Tuvari, Thovarai, Thovary, Thuvarai,
 * Tovarai, Tuvarai, ஆடகி": eight entries for two names, because the Pharmacopoeia prints
 * every romanisation it holds and Wikidata adds the native script. A reader scanning for the
 * Tamil name cannot tell which to use.
 *
 * The survivor is chosen, not arbitrary: native script first, since that is the name as
 * written; otherwise the shortest spelling, which is the one least loaded with a
 * transliterator's conventions. Dropped variants hand their sources to the survivor, so the
 * attribution stays complete.
 */
function collapseVariants(forms) {
  const groups = new Map();
  for (const f of forms) {
    const k = skeletonKey(f.iast || f.name) || f.name.normalize('NFC');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const out = [];
  for (const group of groups.values()) {
    if (group.length === 1) { out.push(group[0]); continue; }
    const native = group.filter((f) => !/^[\x20-\x7E]*$/.test(f.name));
    const pool = native.length ? native : group;
    const winner = pool.reduce((a, b) => (b.name.length < a.name.length ? b : a));
    for (const f of group) {
      if (f === winner) continue;
      for (const s of f.sources ?? []) if (!winner.sources.includes(s)) winner.sources.push(s);
      if (f.preferred) winner.preferred = true;
      if (!winner.iast && f.iast) winner.iast = f.iast;
    }
    counts.variantsCollapsed += group.length - 1;
    out.push(winner);
  }
  return out;
}

for (const page of pages.values()) {
  for (const code of Object.keys(page.names)) {
    page.names[code] = collapseVariants(page.names[code]);
    if (!page.names[code].length) { delete page.names[code]; continue; }
    const pref = page.names[code].filter((n) => n.preferred);
    pref.slice(1).forEach((n) => { delete n.preferred; });
    page.names[code].sort((a, b) => (b.preferred ? 1 : 0) - (a.preferred ? 1 : 0)
      || (a.iast || a.name).localeCompare(b.iast || b.name));
  }
}

const withNames = [...pages.values()].filter((p) => Object.keys(p.names).length);
if (!withNames.length) {
  console.error('\nNothing to publish. Refusing to overwrite the name file with nothing.');
  process.exit(1);
}

const byPage = Object.fromEntries(
  withNames
    .map((p) => [`${p.kind}/${p.slug}`, Object.fromEntries(
      Object.entries(p.names).sort(([a], [b]) => (ORDER[a] ?? 99) - (ORDER[b] ?? 99)),
    )])
    .sort(([a], [b]) => a.localeCompare(b)),
);

const total = withNames.reduce((a, p) => a + Object.values(p.names).reduce((x, n) => x + n.length, 0), 0);
const byLanguage = Object.fromEntries(LANGS
  .map(([c, label]) => [label, withNames.reduce((a, p) => a + (p.names[c]?.length ?? 0), 0)])
  .filter(([, n]) => n));

const payload = {
  _note: 'Published name forms, keyed by kind/slug. Every entry names its source. The '
    + 'Ayurvedic Pharmacopoeia of India is published directly as the statutory reference; '
    + 'anything from Wikidata appears only where an independent named source corroborated it, '
    + 'and `rejected` records what was thrown out. Regenerate with scripts/apply-names.mjs; '
    + 'do not hand-edit.',
  languages: LANG_NAME,
  languageOrder: LANGS.map(([c]) => c),
  summary: {
    pages: withNames.length,
    names: total,
    fromPharmacopoeia: counts.api,
    fromPharmacopoeiaAdjudicated: counts.adjudicated,
    adjudicatedMonographs: counts.adjudicatedRecords,
    adjudicationDeclined: counts.adjudicationDeclined,
    fromWikidataCorroborated: counts.corroborated,
    foundDirectlyInASource: counts.discovered,
    wikidataRejected: counts.rejected,
    misattributedToAnotherPlant: rejected.filter((r) => r.denotesInstead).length,
    duplicatesMerged: counts.duplicate,
    romanisationVariantsCollapsed: counts.variantsCollapsed,
    byLanguage,
  },
  rejected: rejected.sort((a, b) => a.slug.localeCompare(b.slug)),
  pages: byPage,
};

console.log(`\npages          ${withNames.length}`);
console.log(`names          ${total}`);
console.log(`by language    ${Object.entries(byLanguage).map(([l, n]) => `${l} ${n}`).join(', ')}`);

if (DRY) {
  console.log('\n--dry: nothing written.');
  process.exit(0);
}
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`\nwrote ${OUT}`);
