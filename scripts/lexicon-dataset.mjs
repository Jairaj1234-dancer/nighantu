#!/usr/bin/env node
/**
 * Publish the terminology lexicon as a dataset.
 *
 * TWO FILES, TWO SHAPES, for two different questions.
 *
 * lexicon.json keeps the record structure: a term, its renderings, its classical citations, what
 * it must not be confused with. That is the shape for anyone reading about a term.
 *
 * lexicon.csv is ONE ROW PER RENDERING, which is the shape for the question the lexicon exists to
 * answer: who translates this term how, and does the translation hold. A term with seven
 * renderings is seven rows, each carrying the term, the English, the source, and our assessment.
 * Flattening to one row per term would put the interesting column inside a JSON blob.
 *
 * WHAT IS NOT IN EITHER, AND WHY THAT IS NOT OPTIONAL.
 *
 * These files are offered under CC BY 4.0, which invites modification. Some of what the PAGES may
 * show cannot be offered on those terms, and this is where the two part company. It is the same
 * split LICENSES.md already records for WHO ICD-11: reproduced on the page unaltered, attributed
 * and linked, which a NoDerivs licence permits, and absent from every download, which it does not.
 *
 *   withheld quotations        already absent from the source bundle, nothing to do here
 *   nd-attribution renderings  595 of them, from the WHO standard terminologies, the WHO-APW
 *                              draft, ICD-11 and the Government of India NAMASTE lists. The
 *                              English equivalent and the source are FACTS about usage and stay;
 *                              a definition-length span from them is dropped.
 *   restricted renderings      300, from journals, modern textbooks and commercial sites. Already
 *                              scrubbed upstream; the equivalent stays, the definition does not.
 *
 * Each dropped field is replaced by a note naming the reason, so a reader of the dataset can see
 * that something was removed and can go to the page for it. A silent omission would be worse than
 * the omission.
 *
 *   node scripts/lexicon-dataset.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry-run');
const SRC = path.join('src', 'data', 'lexicon.json');
const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const records = data.records ?? [];

const SITE = 'https://nighantu.ageayurveda.com';

/**
 * A rendering as the DOWNLOAD may carry it.
 *
 * `downloadable` is set per rendering by the exporter's licence classifier. Where it is false, the
 * long fields are dropped and the short equivalent stays, because which English word a standard
 * uses for a term is a fact about that standard and not its expression.
 */
const SPAN_WORDS = 12;
const words = (v) => String(v ?? '').trim().split(/\s+/).filter(Boolean).length;
let fieldsDropped = 0;

/**
 * A locator reduced to its POINTER.
 *
 * `ITA-9.8.7; description: 'Rejuvenation therapy which promotes...'` is an identifier followed by
 * the source's own definition, and `NAMC code ACB-23 — SItAgnitA (agnimAndyam) / शीताग्निता` is an
 * identifier followed by the source's own term in two scripts. The identifier is a pointer and
 * belongs in a dataset; what follows it is the source's expression and does not. The length test
 * alone missed the second of those, at ten words.
 *
 * So the locator is truncated at the first separator that introduces content. If nothing is left,
 * the field is dropped.
 */
const pointerOnly = (v) => {
  const raw = String(v ?? '').trim();
  // A URL is a pointer and survives whole. Splitting on ":" first turned one into "https".
  const url = raw.match(/^<?(https?:\/\/[^\s,;)>'"]+)/);
  if (url) return url[1];
  // The separator is sometimes a comma, which an earlier version did not split on, so
  // "ITA-5.54.11, Sanskrit headword āgantujavraṇaḥ (आगनतुजव्रणः), description: ..." came through
  // as a six-word "pointer" carrying the source's headword in two scripts. Thirteen did.
  const head = String(v ?? '').split(/\s*[,:;—–(]\s*|\s+['"'"]/)[0].trim();
  if (!/[A-Za-z0-9]/.test(head)) return null;
  // A pointer is an identifier: a few tokens, no Devanagari, no prose.
  if (words(head) > 3 || /[ऀ-ॿ]/.test(head)) return null;
  return head;
};

const forDownload = (x) => {
  if (x.downloadable !== false) return x;
  const out = { ...x };
  if (words(out.english) > SPAN_WORDS) { out.english = null; out.englishOnPageOnly = x.licenceNote; fieldsDropped += 1; }
  const pointer = pointerOnly(out.locator);
  if (out.locator && pointer !== out.locator) {
    out.locator = pointer;
    out.locatorOnPageOnly = x.licenceNote;
    fieldsDropped += 1;
  }
  return out;
};

const entries = records.map((r) => ({
  slug: r.slug,
  page: `/lexicon/${r.slug}/`,
  iast: r.iast ?? null,
  devanagari: r.devanagari ?? null,
  alternates: r.alternates ?? [],
  category: r.category ?? null,
  family: r.family ?? null,
  renderings: (r.renderings ?? []).map(forDownload),
  classical: r.classical ?? [],
  distinguishFrom: r.distinguishFrom ?? [],
  mistranslations: r.mistranslations ?? [],
  openQuestions: r.openQuestions ?? [],
  nameAttestation: r.nameAttestation ?? undefined,
  citationsChecked: r.verifiedOn ?? null,
}));

const summary = {
  terms: entries.length,
  renderings: entries.reduce((a, r) => a + r.renderings.length, 0),
  classicalCitations: entries.reduce((a, r) => a + r.classical.length, 0),
  quotationsPublished: entries.reduce((a, r) => a + r.classical.filter((c) => c.quote).length, 0),
  quotationsWithheld: entries.reduce((a, r) => a + r.classical.filter((c) => !c.quote && c.quoteWithheld).length, 0),
  citationsThatAreAddressOnly: entries.reduce((a, r) => a + r.classical.filter((c) => !c.quote && !c.quoteWithheld).length, 0),
  termsWithARecordedMistranslation: entries.filter((r) => r.mistranslations.length).length,
};

console.log('terms                       ', summary.terms);
console.log('renderings                  ', summary.renderings);
console.log('classical citations         ', summary.classicalCitations);
console.log('quotations published        ', summary.quotationsPublished);
console.log('quotations withheld         ', summary.quotationsWithheld);
console.log('citations, address only     ', summary.citationsThatAreAddressOnly);
console.log('rendering fields page-only  ', fieldsDropped, '(kept on the page, dropped here: a NoDerivs licence will not carry a CC BY download)');

if (DRY) {
  console.log('\nDry run. Nothing written.');
  process.exit(0);
}

fs.writeFileSync(path.join('public', 'lexicon.json'), JSON.stringify({
  name: data.name,
  licenceNote: 'This download is CC BY 4.0, WITH ONE CARVE-OUT. Where a rendering is marked '
    + 'nd-attribution or restricted, the source\'s own wording has been removed and the field says '
    + 'so: those sources permit reproduction on an attributed page but not inclusion in a dataset '
    + 'offered for modification. A locator is reduced to its identifier, which is a pointer rather '
    + 'than expression. The English equivalent and the source name are facts about usage and are '
    + 'present throughout, and the full text is on the term page named in `page`. THE CARVE-OUT: '
    + 'an `assessment` is this project\'s own critical prose and is CC BY 4.0, but where it quotes '
    + 'a source briefly in order to discuss it, those quoted words remain under their own licence '
    + 'and are not granted by this one. Quotation for comment is not a derivative work; '
    + 'sub-licensing someone else\'s wording would be.',
  description: data.description,
  license: 'https://creativecommons.org/licenses/by/4.0/',
  updatedAt: data.updatedAt,
  provenance: data.provenance,
  families: data.families,
  summary,
  entries,
}));

const cell = (v) => (v == null || v === '' ? '' : `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`);
const rows = [[
  'term', 'iast', 'devanagari', 'category', 'family',
  'english_rendering', 'rendering_source', 'source_kind', 'source_locator', 'verbatim',
  'our_assessment', 'licence', 'classical_citations', 'page',
].join(',')];

for (const e of entries) {
  // A term with no rendering still gets a row, or the dataset would quietly lose the terms for
  // which no published English equivalent could be found, which is itself a finding.
  const rs = e.renderings.length ? e.renderings : [null];
  for (const x of rs) {
    rows.push([
      e.slug, e.iast, e.devanagari, e.category, e.family,
      x?.english, x?.sourceName, x?.sourceKind, x?.locator,
      x ? (x.verbatim === false ? 'no' : 'yes') : '',
      x?.assessment, x?.licence, e.classical.length, `${SITE}${e.page}`,
    ].map(cell).join(','));
  }
}
fs.writeFileSync(path.join('public', 'lexicon.csv'), `${rows.join('\n')}\n`);

console.log(`\nwrote public/lexicon.json and public/lexicon.csv (${rows.length - 1} rendering rows)`);
