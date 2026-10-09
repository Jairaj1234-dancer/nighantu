#!/usr/bin/env node
/**
 * Why a free translation cannot cite Charaka in the form scholars use, measured.
 *
 * THE PROBLEM, WHICH IS A COPYRIGHT PROBLEM WEARING A BIBLIOGRAPHIC ONE. The only public-domain
 * English Charaka Samhita is Avinash Chandra Kaviratna's (1896-1913) and the only public-domain
 * English Sushruta is Kunja Lal Bhishagratna's (1907-1916). Both number their own way: Kaviratna
 * prints "Lesson XV, verse 2" where every modern edition prints 15/3. The modern numbering, the one
 * every paper and every textbook uses, lives in editions still in copyright.
 *
 * So a reader working from free sources can read the passage and cannot cite it. Worse, they can
 * cite it in a form that looks right and is wrong: "Cha.Sa. Chikitsa 15/2" is a perfectly
 * well-formed reference that points at a different verse.
 *
 * HOW THIS PROJECT FOUND OUT. A pass over this corpus set out to normalise its 389 published
 * classical citations into canonical loci, one agent per concept record, with an adversarial check
 * on each. The check rejected 120 of 447 normalisations across the full corpus and 86 of those
 * rejections were the same fault: the normaliser had stripped "Kaviratna's numbering" and emitted a
 * bare standard-form locus. Its own words for it were better than ours:
 *
 *   "silently adopts the translator-specific number while presenting itself in the standard
 *    Cha.Sa. form, which a reader will check against a vulgate edition and find the wrong verse"
 *
 * The concept records were not at fault: they name the numbering system in the text a reader sees.
 * The normalisation was, and the concordance it would have produced is not published for that
 * reason. What is published instead is this: the gap itself, measured, plus the equivalences this
 * corpus does record, which are a crosswalk nobody else offers.
 *
 * WHAT MAKES THE CROSSWALK TRUSTWORTHY. Only equivalences the SOURCE FIELD ITSELF STATES. Nothing
 * is computed, no offset is carried from one verse to its neighbour, and a hedged statement
 * ("roughly 15/42-44", "standard editions place this at 26.81 onward") is published as hedged and
 * kept out of the numeric table. One invented row would make the whole table useless, because a
 * user cannot tell which row is the invented one. Every row was extracted by a judgement pass and
 * then re-checked by a second pass that defaults to rejecting.
 *
 *   node scripts/verse-numbering.mjs --pairs <file.json>   build src/data and public/
 *   node scripts/verse-numbering.mjs --dry-run             report only
 */
import fs from 'node:fs';
import path from 'node:path';

const ARG = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const DRY = process.argv.includes('--dry-run');
const CHECK = process.argv.includes('--check');
const PAIRS = ARG('--pairs') ?? path.join('src', 'data', 'verse-numbering-pairs.json');
const OUT = path.join('src', 'data', 'verse-numbering.json');
const SITE = 'https://nighantu.ageayurveda.com';
const PAGE = path.join('content', 'choosing', 'citing-the-classical-texts.md');

if (!fs.existsSync(PAIRS)) { console.error(`No extracted pairs at ${PAIRS}`); process.exit(2); }
const extracted = JSON.parse(fs.readFileSync(PAIRS, 'utf8'));
const concepts = JSON.parse(fs.readFileSync(path.join('src', 'data', 'concepts.json'), 'utf8'));

/**
 * Only the 28 PUBLISHED concept records count.
 *
 * Four of the 32 records are withheld from the site because they did not clear their own gates, and
 * their citations are not on any page. Counting them here would state a figure about a corpus a
 * reader cannot see, and one of the four (khavaigunya) carries twelve of the rejected
 * normalisations, so including it would also flatter the result.
 */
const published = new Set((concepts.records ?? []).map((r) => r.slug));
const titleOf = Object.fromEntries((concepts.records ?? []).map((r) => [r.slug, r.title]));

/** The corpus-wide shape of the problem, counted over the published records only. */
const LEXICON = path.join(process.env.HOME ?? '', 'Projects', 'ayurveda-lexicon', 'data', 'concepts');
let citations = 0;
let withStandardMarker = 0;
let translatorOnly = 0;
let neitherMarker = 0;
if (fs.existsSync(LEXICON)) {
  for (const f of fs.readdirSync(LEXICON).filter((x) => x.endsWith('.json'))) {
    const slug = f.replace(/\.json$/, '');
    if (!published.has(slug)) continue;
    const rec = JSON.parse(fs.readFileSync(path.join(LEXICON, f), 'utf8'));
    for (const e of rec.classical ?? []) {
      citations += 1;
      const blob = [e.text, e.sthana, e.chapter, e.verse].filter(Boolean).join(' | ');
      const tr = /kaviratna|bhishagratna|lesson\s+[IVXLC]+|as printed in|restarts|section-internal/i.test(blob);
      const st = /vulgate|standard (?:edition|numbering)|standard editions|trikamji|modern/i.test(blob);
      if (tr && st) withStandardMarker += 1;
      else if (tr) translatorOnly += 1;
      else neitherMarker += 1;
    }
  }
}

/**
 * The marker counts are keyword counts and are reported as a FLOOR, never as a claim of absence.
 *
 * "This citation mentions the vulgate" is mechanically checkable. "This citation has no standard
 * equivalent anywhere" is not, and asserting it from a keyword search is how this project has
 * produced wrong numbers before. So the published claim is "at most N of 389 record a standard
 * equivalent, and of those, M state one precisely enough to use", which is true and useful without
 * asserting anything about the rest.
 */
const rows = [];
const hedgedRows = [];
const rejected = [];
let pairsSeen = 0;
let statedEquivalence = 0;
for (const rec of extracted.perRecord ?? []) {
  if (!published.has(rec.concept)) continue;
  const ok = new Set(rec.confirmed ?? []);
  for (const p of rec.pairs ?? []) {
    pairsSeen += 1;
    if (p.equivalenceStated) statedEquivalence += 1;
    if (!p.equivalenceStated) continue;
    if (!ok.has(p.n)) continue;
    const row = {
      concept: rec.concept,
      conceptTitle: titleOf[rec.concept] ?? rec.concept,
      conceptUrl: `${SITE}/concept/${rec.concept}/`,
      work: p.work ?? null,
      sthana: p.sthana ?? null,
      chapter: p.chapter ?? null,
      translator: p.translatorName ?? null,
      translatorRef: p.translatorRef ?? null,
      translatorStart: p.translatorStart ?? null,
      translatorEnd: p.translatorEnd ?? null,
      standardRef: p.standardRef ?? null,
      standardStart: p.standardStart ?? null,
      standardEnd: p.standardEnd ?? null,
      offset: p.offset ?? null,
      statedAs: p.sourceWording ?? null,
    };
    if (p.usable && !p.hedged) rows.push(row);
    else hedgedRows.push({ ...row, whyNotNumeric: p.notUsableReason ?? 'the source hedges the equivalence' });
  }
  for (const w of rec.wrong ?? []) rejected.push({ concept: rec.concept, n: w.n, problem: w.problem });
}

/** Offsets actually observed, which is the one generalisation the data can support. */
const offsets = {};
for (const r of rows) {
  if (r.offset == null || !r.work || r.chapter == null) continue;
  const k = `${r.work} ${r.sthana ?? ''} ${r.chapter}`.replace(/\s+/g, ' ').trim();
  (offsets[k] = offsets[k] ?? []).push(r.offset);
}
const offsetSummary = Object.entries(offsets).map(([k, v]) => ({
  chapter: k,
  rows: v.length,
  offsets: [...new Set(v)].sort((a, b) => a - b),
  consistent: new Set(v).size === 1,
})).sort((a, b) => b.rows - a.rows);

console.log(`published concept records       ${published.size}`);
console.log(`classical citations in them     ${citations}`);
console.log(`  mention a standard equivalent ${withStandardMarker}  (a ceiling, by keyword)`);
console.log(`  translator numbering only     ${translatorOnly}`);
console.log(`  neither marker present        ${neitherMarker}`);
console.log('');
console.log(`citations examined for a pair    ${pairsSeen}`);
console.log(`  state an equivalence           ${statedEquivalence}`);
console.log(`  numeric and confirmed          ${rows.length}`);
console.log(`  stated but hedged              ${hedgedRows.length}`);
console.log(`  rejected on the adversarial check ${rejected.length}`);
console.log('');
console.log('offsets observed per chapter:');
for (const o of offsetSummary) {
  console.log(`  ${o.chapter.padEnd(34)}${String(o.rows).padStart(3)} rows  offsets ${o.offsets.join(', ')}`
    + `${o.consistent ? '  consistent' : '  NOT consistent'}`);
}

/**
 * The gate: a published row must carry both references, both numeric sides, and the source's own
 * words. A row missing any of those is a verse equivalence with part of its evidence stripped, and
 * the only reason this table can exist is that every row is checkable against the concept page it
 * came from.
 */
const bad = [];
for (const r of rows) {
  const missing = [
    ['the translator reference', !r.translatorRef],
    ['the standard reference', !r.standardRef],
    ['a numeric translator verse', r.translatorStart == null],
    ['a numeric standard verse', r.standardStart == null],
    ["the source's own words", !r.statedAs],
    ['a work', !r.work],
  ].filter(([, m]) => m).map(([w]) => w);
  if (missing.length) bad.push(`${r.concept} ${r.translatorRef ?? '?'}: missing ${missing.join(', ')}`);
  if (r.offset != null && r.standardStart != null && r.translatorStart != null
    && r.offset !== r.standardStart - r.translatorStart) {
    bad.push(`${r.concept} ${r.translatorRef}: offset ${r.offset} does not equal ${r.standardStart} minus ${r.translatorStart}`);
  }
}
if (bad.length) {
  console.error('\nREFUSING TO WRITE:');
  for (const b of bad) console.error(`  ${b}`);
  process.exit(1);
}
console.log(`\nrow gate                        clean: ${rows.length} rows each carry both references, both numbers and the source's wording`);

const payload = {
  name: 'Kaviratna and Bhishagratna verse numbering against the standard editions',
  description: 'The only public-domain English translations of the Charaka and Sushruta Samhitas '
    + 'number their verses differently from the modern editions every paper cites. This records '
    + 'every equivalence between the two that this project\'s concept corpus states, so a passage '
    + 'read in a free translation can be cited in the form scholars use.',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  updatedAt: concepts.updatedAt ?? null,
  method: 'Every equivalence here is one the concept record itself states in the text a reader '
    + 'sees. Nothing is computed, and no offset is carried from one verse to another. Each was '
    + 'extracted by a judgement pass over the source fields and then re-checked by a second '
    + 'adversarial pass that defaults to rejecting; only rows that pass are published. Equivalences '
    + 'the source hedges are published separately as hedged rather than given a verse number.',
  limits: 'This is not a complete concordance of either text. It covers only the passages this '
    + 'project happens to cite, and the marker counts below are a ceiling found by keyword: a '
    + 'citation that mentions the standard numbering can be counted mechanically, but "this '
    + 'citation has no standard equivalent anywhere" cannot be, and is not claimed.',
  summary: {
    publishedConceptRecords: published.size,
    classicalCitations: citations,
    citationsMentioningAStandardEquivalent: withStandardMarker,
    citationsInTranslatorNumberingOnly: translatorOnly,
    citationsWithNeitherMarker: neitherMarker,
    citationsExamined: pairsSeen,
    statingAnEquivalence: statedEquivalence,
    publishedAsNumericPairs: rows.length,
    publishedAsHedged: hedgedRows.length,
    rejectedOnTheAdversarialCheck: rejected.length,
  },
  offsetsObserved: offsetSummary,
  pairs: rows,
  hedged: hedgedRows,
  rejected,
};

if (DRY) { console.log('\nDry run. Nothing written.'); process.exit(0); }

fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
fs.writeFileSync(path.join('public', 'verse-numbering.json'), `${JSON.stringify(payload, null, 2)}\n`);

const cell = (v) => (v == null || v === '' ? '' : `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`);
const csv = [['work', 'sthana', 'chapter', 'translator', 'translator_reference', 'translator_verse_start',
  'translator_verse_end', 'standard_reference', 'standard_verse_start', 'standard_verse_end',
  'offset', 'stated_as', 'concept', 'concept_page'].join(',')];
for (const r of rows) {
  csv.push([r.work, r.sthana, r.chapter, r.translator, r.translatorRef, r.translatorStart,
    r.translatorEnd, r.standardRef, r.standardStart, r.standardEnd, r.offset, r.statedAs,
    r.concept, r.conceptUrl].map(cell).join(','));
}
fs.writeFileSync(path.join('public', 'verse-numbering.csv'), `${csv.join('\n')}\n`);
console.log(`\nwrote ${OUT}, public/verse-numbering.json and .csv (${rows.length} pairs)`);

/**
 * The page's tables, generated between sentinels. Same mechanism as the other two comparison pages
 * and for the same reason: a table of verse equivalences is not something to maintain by hand, and
 * `--check` is what stops the prose drifting away from the dataset under it.
 */
const BEGIN = '<!-- BEGIN generated by scripts/verse-numbering.mjs -->';
const END = '<!-- END generated by scripts/verse-numbering.mjs -->';
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const n = (x) => Number(x).toLocaleString('en-GB');

const lines = [BEGIN, ''];
lines.push('| | Citations |');
lines.push('|---|---|');
lines.push(`| Mention a standard-numbering equivalent | ${n(withStandardMarker)} |`);
lines.push(`| Give only the translator's own numbering | ${n(translatorOnly)} |`);
lines.push(`| Carry neither marker | ${n(neitherMarker)} |`);
lines.push(`| **Total** | **${n(citations)}** |`, '');
lines.push(`The first row is a ceiling, found by keyword. Of those ${n(withStandardMarker)}, `
  + `${n(statedEquivalence)} actually state an equivalence, and **${n(rows.length)} state one `
  + `precisely enough to publish as a verse pair**. ${n(hedgedRows.length)} state it too loosely to `
  + `assign a number, in words like "roughly" and "onward". ${n(rejected.length)} were rejected on `
  + `the adversarial check and are in the dataset with the reason.`, '');

if (offsetSummary.length) {
  lines.push('### The offset per chapter, where it could be observed', '');
  lines.push('| Chapter | Pairs | Standard minus translator | |');
  lines.push('|---|---|---|---|');
  for (const o of offsetSummary) {
    lines.push(`| ${esc(o.chapter)} | ${o.rows} | ${o.offsets.join(', ')} | `
      + `${o.consistent ? 'constant here' : 'not constant'} |`);
  }
  lines.push('');
}

lines.push('### Every equivalence this project can state', '');
lines.push('| Work | Chapter | In the free translation | In the standard editions | As the source states it |');
lines.push('|---|---|---|---|---|');
for (const r of rows.slice().sort((a, b) => String(a.work).localeCompare(String(b.work))
  || (a.chapter ?? 0) - (b.chapter ?? 0) || (a.translatorStart ?? 0) - (b.translatorStart ?? 0))) {
  lines.push(`| ${esc(r.work)} | ${esc([r.sthana, r.chapter].filter((x) => x != null).join(' '))} `
    + `| ${esc(r.translatorRef)} | ${esc(r.standardRef)} | ${esc(r.statedAs)} |`);
}
lines.push('', `${n(rows.length)} pairs from ${new Set(rows.map((r) => r.concept)).size} concept records. `
  + 'Each links to the record it came from in the dataset.', '', END);
const block = lines.join('\n');

const current = fs.readFileSync(PAGE, 'utf8');
const b = current.indexOf(BEGIN);
const e = current.indexOf(END);
if (b < 0 || e < 0) { console.error(`FAIL: ${PAGE} is missing the sentinels.`); process.exit(1); }
const next = current.slice(0, b) + block + current.slice(e + END.length);

if (CHECK) {
  if (next !== current) {
    console.error(`FAIL: ${PAGE} does not match ${OUT}. Re-run the script and commit the result.`);
    process.exit(1);
  }
  const prose = current.slice(0, b) + current.slice(e + END.length);
  const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
    'nineteen', 'twenty'];
  const checks = [['classical citations', citations], ['published concept records', published.size]];
  const missing = [];
  for (const [label, value] of checks) {
    const forms = [String(value), Number(value).toLocaleString('en-GB')];
    if (value <= 20) forms.push(WORD[value]);
    if (!forms.some((f) => new RegExp(`(?<![\\w,.])${f}(?![\\w%])`, 'i').test(prose))) {
      missing.push(`${label}: ${value} appears nowhere in the prose`);
    }
  }
  if (missing.length) {
    console.error(`FAIL: ${missing.length} figure(s) absent from the page's prose.`);
    for (const m of missing) console.error(`  ${m}`);
    process.exit(1);
  }
  console.log(`prose figures                   ${checks.length} totals present`);
  console.log(`${PAGE} agrees with ${OUT}`);
} else if (next !== current) {
  fs.writeFileSync(PAGE, next);
  console.log(`updated the generated tables in ${PAGE}`);
} else {
  console.log(`${PAGE} was already current`);
}
