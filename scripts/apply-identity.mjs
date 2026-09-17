#!/usr/bin/env node
/**
 * Apply the second botanical-identity pass: Pharmacopoeia-anchored binomials, and substance
 * classes for the pages that are not plants at all.
 *
 *   node scripts/apply-identity.mjs <workflow-result.json> [--dry-run]
 *
 * Two inputs:
 *  1. Folder class, deterministic. A page filed under Mineral-Metal-Preparations, Rasa-Shastra,
 *     Salts-Minerals-Metals or Animal-Derived-Products is not a plant, and a blank botanical
 *     row on it reads as "unknown" when the truth is "not applicable".
 *  2. The workflow's identify + verify records for pages filed as single herbs.
 *
 * Nothing from the workflow is trusted as handed over. A binomial is written only when:
 *  - the independent verifier said accept, category plant;
 *  - the API monograph sentence it quotes is found in the API text (whitespace folded);
 *  - GBIF, re-queried here, returns an EXACT match for the name;
 *  - normaliseBinomial accepts it and the page exists;
 *  - the page has no binomial already (an earlier verified name is never overwritten).
 * Every refusal is counted and recorded in data/runs/binomial-pass2.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normaliseBinomial, parseFrontmatter } from './lib.mjs';

const DRY = process.argv.includes('--dry-run');
const IN = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!IN || !fs.existsSync(IN)) { console.error('usage: node scripts/apply-identity.mjs <workflow-result.json> [--dry-run]'); process.exit(1); }

const API_TEXT = path.join('sources-private', 'api-all.txt');
if (!fs.existsSync(API_TEXT)) { console.error(`missing ${API_TEXT} (see scripts/api-index.mjs)`); process.exit(1); }
const apiFolded = fs.readFileSync(API_TEXT, 'utf8').replace(/\s+/g, ' ').toLowerCase();

/** Monograph heading -> volume, straight from the pattern-extracted API index. */
const normHeading = (h) => String(h ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
const API_VOLUME_BY_HEADING = new Map(
  (JSON.parse(fs.readFileSync(path.join('data', 'sources', 'api-botanicals.json'), 'utf8')).records ?? [])
    .filter((r) => r.heading)
    .map((r) => [normHeading(r.heading), r.volume]),
);
const foldQuote = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

const FOLDER_CLASS = [
  [/^Mineral-Metal-Preparations/, 'mineral'],
  [/^Salts-Minerals-Metals/, 'salt'],
  [/^Rasa-Shastra-Alchemical-Preparations/, 'rasa-preparation'],
  [/^Animal-Derived-Products/, 'animal'],
];
// 'uncertain' is a publishable state, not a failure. Several of these pages describe a
// drug the sources genuinely disagree about (Agnijara is read as ambergris, as amber and
// as a mineral), and a page that says the identity is unsettled tells a reader more than
// a blank botanical row, which reads as "we did not look".
const AGENT_CLASS = new Set(['formulation', 'compound-or-isolate', 'plant-product-mixture', 'mineral', 'animal', 'uncertain']);

const pages = new Map();
for (const f of fs.readdirSync(path.join('content', 'herb'))) {
  const { data } = parseFrontmatter(fs.readFileSync(path.join('content', 'herb', f), 'utf8'));
  pages.set(f.replace(/\.md$/, ''), data);
}

const binFile = path.join('data', 'binomials.json');
const bins = JSON.parse(fs.readFileSync(binFile, 'utf8'));
/**
 * Existing records are kept, not rebuilt.
 *
 * A page whose binomial is already published is refused here ("page already has a
 * binomial"), which is correct: it stops a second pass quietly overwriting a verified
 * identification. But the first version rebuilt identity.json from the input alone, so
 * re-running it after a repair pass silently deleted the Pharmacopoeia citation from all
 * 46 pages that had one. Load what is published and merge into it.
 */
const identityFile = path.join('src', 'data', 'identity.json');
const existing = fs.existsSync(identityFile)
  ? JSON.parse(fs.readFileSync(identityFile, 'utf8')).records ?? {}
  : {};
const identity = { note: '', records: { ...existing } };
const ledger = { run: 'botanical-identity-pass-2', examined: 0, accepted: [], rejected: [], classified: [] };

// ---------------------------------------------------------------- 1. folder classes
for (const [slug, d] of pages) {
  if (normaliseBinomial(d.botanical ?? '') || bins.binomials[slug]) continue;
  const hit = FOLDER_CLASS.find(([rx]) => rx.test(d.subcategory ?? ''));
  if (!hit) continue;
  identity.records[slug] = { substanceClass: hit[1], basis: `filed under ${d.subcategory}` };
  ledger.classified.push({ slug, substanceClass: hit[1], basis: 'folder' });
}

// ---------------------------------------------------------------- 2. workflow records
async function gbifExact(name) {
  const url = `https://api.gbif.org/v1/species/match?strict=true&name=${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GBIF HTTP ${res.status}`);
  const j = await res.json();
  return { exact: j.matchType === 'EXACT' && j.rank === 'SPECIES', status: j.status, key: j.usageKey ?? null };
}

const raw = JSON.parse(fs.readFileSync(IN, 'utf8'));
const done = raw.done ?? raw.result?.done ?? [];
const refuse = (slug, why, extra = {}) => ledger.rejected.push({ slug, why, ...extra });

for (const item of done) {
  const { slug, identify: id, verify: v } = item;
  ledger.examined += 1;
  if (!pages.has(slug)) { refuse(slug, 'unknown slug'); continue; }
  if (!v) { refuse(slug, 'no verifier record'); continue; }

  if (v.category !== 'plant') {
    if (v.verdict === 'accept' && AGENT_CLASS.has(v.category)) {
      identity.records[slug] = { substanceClass: v.category, basis: v.reasons.slice(0, 300) };
      ledger.classified.push({ slug, substanceClass: v.category, basis: 'verified' });
    } else {
      refuse(slug, `category ${v.category}, verdict ${v.verdict}`, { reasons: v.reasons.slice(0, 400) });
    }
    continue;
  }
  if (v.verdict !== 'accept') { refuse(slug, 'verifier rejected', { reasons: v.reasons.slice(0, 600) }); continue; }
  if (normaliseBinomial(pages.get(slug).botanical ?? '') || bins.binomials[slug]) { refuse(slug, 'page already has a binomial'); continue; }

  const binomial = normaliseBinomial(v.binomial ?? '');
  if (!binomial) { refuse(slug, `not a binomial: ${v.binomial}`); continue; }

  const sentence = id?.apiMonograph?.verbatimSentence;
  const anchored = Boolean(sentence && v.apiSentenceFoundVerbatim);
  if (anchored) {
    // The quote must actually be in the book. Compare the first 60 characters, which is
    // the "X consists of <part> of <Genus species>" clause; OCR line breaks are folded.
    const probe = foldQuote(sentence).slice(0, 60);
    if (!apiFolded.includes(probe)) { refuse(slug, 'API quote not found in the API text', { probe }); continue; }
  } else if ((v.otherAttributions ?? []).some((a) => normaliseBinomial(a.binomial) && normaliseBinomial(a.binomial) !== binomial)) {
    // Without the Pharmacopoeia to anchor it, a name with rival attributions is exactly the
    // contested case the first pass rightly refused.
    refuse(slug, 'no Pharmacopoeia anchor and identity contested', { reasons: v.reasons.slice(0, 400) });
    continue;
  }

  let g;
  try { g = await gbifExact(binomial); } catch (e) { refuse(slug, `GBIF unavailable: ${e.message}`); continue; }
  if (!g.exact) { refuse(slug, `GBIF not EXACT for ${binomial}`); continue; }

  /**
   * Verifiers wrote the volume three ways: "III", "Volume III", and the whole citation
   * again ("API Part I, Volume II: SANKHAPUSP"). Rendered into "Part I, Vol. {volume}"
   * the last two produce "Vol. Volume III" and a truncated heading, so the roman numeral
   * is taken out of whatever was written.
   */
  //  - the API index is the authority where the monograph heading matches it;
  //  - failing that, the numeral that FOLLOWS "Vol"/"Volume", because "API Part I, Volume II"
  //    contains Part I's numeral first and a first-match rule published four wrong citations.
  const written = String(v.apiVolume ?? '');
  const volume = API_VOLUME_BY_HEADING.get(normHeading(v.apiHeading))
    ?? (written.match(/\bVol(?:ume)?\.?\s*([IVX]{1,5})\b/i) ?? [])[1]
    ?? (written.match(/\b([IVX]{1,5})\b/) ?? [])[1]
    ?? written.trim();

  bins.binomials[slug] = {
    binomial,
    note: (anchored
      ? `Ayurvedic Pharmacopoeia of India, Part I, Vol. ${volume}: ${v.apiHeading}`
      : `No API monograph; identity uncontested across sources and GBIF EXACT. ${v.reasons}`).slice(0, 300),
    source: anchored ? 'api' : 'uncontested',
  };
  identity.records[slug] = {
    api: anchored ? { volume, heading: v.apiHeading, sentence: sentence.replace(/\s+/g, ' ').slice(0, 300) } : null,
    otherAttributions: (v.otherAttributions ?? []).filter((a) => normaliseBinomial(a.binomial) && normaliseBinomial(a.binomial) !== binomial).slice(0, 6),
    gbif: { status: g.status, key: g.key },
  };
  ledger.accepted.push({ slug, binomial, api: anchored ? `${volume}: ${v.apiHeading}` : null, gbifStatus: g.status });
}

// ---------------------------------------------------------------- write
bins.binomials = Object.fromEntries(Object.entries(bins.binomials).sort(([a], [b]) => a.localeCompare(b)));
bins.count = Object.keys(bins.binomials).length;
bins.updatedAt = new Date().toISOString().slice(0, 10);
identity.note = 'Substance classes and Pharmacopoeia-anchored identities. Written by scripts/apply-identity.mjs; never edit by hand.';
identity.records = Object.fromEntries(Object.entries(identity.records).sort(([a], [b]) => a.localeCompare(b)));
ledger.summary = {
  examined: ledger.examined, binomialsAccepted: ledger.accepted.length,
  classifiedNotPlant: ledger.classified.length, rejected: ledger.rejected.length,
};

console.log(JSON.stringify(ledger.summary));
const why = ledger.rejected.reduce((a, r) => ({ ...a, [r.why.replace(/:.*/, '')]: (a[r.why.replace(/:.*/, '')] ?? 0) + 1 }), {});
console.log('rejections', why);
if (DRY) process.exit(0);

fs.writeFileSync(binFile, `${JSON.stringify(bins, null, 1)}\n`);
fs.writeFileSync(identityFile, `${JSON.stringify(identity, null, 1)}\n`);
fs.writeFileSync(path.join('data', 'runs', 'binomial-pass2.json'), `${JSON.stringify(ledger, null, 1)}\n`);
console.log('wrote data/binomials.json, src/data/identity.json, data/runs/binomial-pass2.json');
