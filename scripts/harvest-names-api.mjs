#!/usr/bin/env node
/**
 * Harvest vernacular names from the Ayurvedic Pharmacopoeia of India.
 *
 * This is the better source and it was already on disk. The API prints a SYNONYMS block per
 * monograph giving the drug's name in Sanskrit and fourteen Indian languages, and it is the
 * official pharmacopoeia: if the API says Gokshura is "Gokhru" in Hindi, that is not a
 * crowd-sourced guess, it is the statutory name. Wikidata was the route taken first only
 * because taxonomy.json already held the join keys.
 *
 * Two things the API gives that Wikidata does not. It attributes names to a *drug* (Gokshura
 * the fruit) rather than to a species, which is what an Ayurvedic reference is actually about.
 * And its names are romanised, which is what readers type: every language-specific query in
 * the search data arrived in Latin script, not Devanagari.
 *
 * One thing it does not give: Devanagari. There is not a single Devanagari character in
 * api-all.txt. The AFI volumes do carry Devanagari but the OCR there is badly corrupted
 * (`शा धरसहिता` for `शार्ङ्गधरसंहिता`), so Devanagari stays a separate problem and is not
 * sourced from here.
 *
 * THE PARSE PROBLEM, and why this script reports rather than resolves it.
 *
 * The source is OCR of a two-column layout, and it came out two ways. In about a third of
 * monographs each label kept its value on one line ("Hindi : Gokhru"), which parses exactly.
 * In the rest the labels were lifted into one block and their values into another, further
 * down the page, and line-wrapping sometimes merged two values into one line. Where the two
 * blocks have the same number of entries, position is a safe alignment. Where they do not,
 * any positional guess shifts every name after the discrepancy into the wrong language, which
 * would quietly publish a Tamil name as Hindi. Those monographs are written out as
 * `needsAdjudication` and left for a reader or an agent, never aligned by guesswork.
 *
 *   node scripts/harvest-names-api.mjs
 *   node scripts/harvest-names-api.mjs --report    # structure stats only, writes nothing
 */
import fs from 'node:fs';
import path from 'node:path';
import { asciiKey } from './lib/devanagari.mjs';

const SRC = path.join('sources-private', 'api-all.txt');
const OUT = path.join('data', 'name-candidates-api.json');
const REPORT = process.argv.includes('--report');

if (!fs.existsSync(SRC)) {
  console.error(`Missing ${SRC}. It is gitignored copyrighted source text; it has to be present locally.`);
  process.exit(1);
}

// The languages the API prints, with the spelling it uses. "Gujrati" is the API's own
// spelling and is kept so a mismatch is visible rather than silently normalised away.
const LANGS = new Map([
  ['Sanskrit', 'sa'], ['Assamese', 'as'], ['Bengali', 'bn'], ['English', 'en'],
  ['Gujrati', 'gu'], ['Gujarati', 'gu'], ['Hindi', 'hi'], ['Kannada', 'kn'],
  ['Kashmiri', 'ks'], ['Malayalam', 'ml'], ['Marathi', 'mr'], ['Oriya', 'or'],
  ['Punjabi', 'pa'], ['Tamil', 'ta'], ['Telugu', 'te'], ['Urdu', 'ur'],
]);

const lines = fs.readFileSync(SRC, 'utf8').split('\n').map((s) => s.replace(/\s+$/, ''));

/** A monograph heading: "GOKSURA (Fruit)", "ASVAGANDHA (Root)". */
const HEADING = /^([A-Z][A-ZÀ-ɏ .'-]{2,60})\s*\(([^)]{2,40})\)\s*$/;

/** A SYNONYMS label, with its value if OCR kept them on one line. */
function labelOf(raw) {
  const m = raw.trim().match(/^([A-Z][a-z]+)\s*:?\s*(.*)$/);
  if (!m || !LANGS.has(m[1])) return null;
  return { lang: m[1], code: LANGS.get(m[1]), value: m[2].trim() };
}

/** Section headings that end the SYNONYMS region. */
const SECTION = /^(DESCRIPTION|IDENTITY|PURITY|CONSTITUENTS|IMPORTANT FORMULATIONS|THERAPEUTIC USES|DOSE|SYNONYMS|a\) Macroscopic|b\) Microscopic|TLC|Microscopic|Macroscopic)/i;

/** Lines that are page furniture rather than content: bare page numbers, running heads. */
const NOISE = (t) => !t || /^\d{1,4}$/.test(t) || /^[ivxlc]{1,6}$/i.test(t) || SECTION.test(t);

/**
 * Anchor on the SYNONYMS blocks and find each one's heading by searching backward.
 *
 * Segmenting forward from headings does not work: the HEADING pattern also matches every row
 * of the table of contents, where each drug appears with its binomial and a page number and
 * no SYNONYMS block at all. That put a spurious boundary before each real monograph and made
 * the first parse attempt find 4 usable blocks out of 512.
 */
const synonymBlocks = [];
for (let i = 0; i < lines.length; i += 1) {
  if (!/^SYNONYMS\b/.test(lines[i].trim())) continue;
  let heading = null;
  for (let k = i - 1; k >= Math.max(0, i - 40); k -= 1) {
    const m = lines[k].match(HEADING);
    if (m) { heading = { heading: m[1].trim(), part: m[2].trim(), line: k }; break; }
  }
  if (heading) synonymBlocks.push({ synAt: i, ...heading });
}

const records = [];
const stats = { inline: 0, positional: 0, needsAdjudication: 0, noSynonyms: 0 };

for (const [bi, mono] of synonymBlocks.entries()) {
  const synAt = mono.synAt;
  const stop = bi + 1 < synonymBlocks.length ? synonymBlocks[bi + 1].line : lines.length;

  // Collect the label run. Blank lines inside it are OCR spacing, not a break.
  const labels = [];
  let j = synAt + 1;
  let blanks = 0;
  while (j < stop && labels.length < 20) {
    const t = lines[j].trim();
    if (!t) { blanks += 1; if (blanks > 4) break; j += 1; continue; }
    const lab = labelOf(t);
    if (!lab) break;
    blanks = 0;
    labels.push(lab);
    j += 1;
  }
  if (!labels.length) { stats.noSynonyms += 1; continue; }

  const withInline = labels.filter((l) => l.value);

  // Case A: OCR kept values on their label lines. Exact, nothing inferred.
  //
  // A label with an EMPTY value is kept as evidence and dropped from the output: the API
  // prints "English :" with nothing after it for drugs that have no English name, which is a
  // fact about the drug, not a failed parse. Requiring every label to carry a value treated
  // those as broken and discarded otherwise-perfect blocks.
  if (withInline.length) {
    stats.inline += 1;
    records.push({
      heading: mono.heading, part: mono.part, sourceLine: mono.line + 1,
      alignment: 'inline',
      blankLabels: labels.filter((l) => !l.value).map((l) => l.lang),
      names: withInline.map((l) => ({ lang: l.lang, code: l.code, value: l.value })),
    });
    continue;
  }

  // Case B: values live in a later block, because OCR read the page's two columns in
  // sequence. The names come out in label order and are immediately followed by monograph
  // prose, so the job is to take the run of name-shaped lines and stop at the prose.
  //
  // The first attempt took every short line to the end of the monograph and collected ~40
  // values against 15 labels, which made every block look unalignable. A name line is
  // Title-Case, carries no digits, and is none of the pharmacopoeial test vocabulary that
  // follows the synonyms ("Not more than 2 per cent. Appendix 2.2.2").
  const isNameLine = (t) => t.length <= 70
    && /^[A-Z(]/.test(t)
    && !/\d/.test(t)
    && !/per cent|Appendix|Not more than|Foreign matter|Total Ash|insoluble|Extractive|Moisture|Loss on drying/i.test(t)
    && !/[.;:]\s*$/.test(t);

  const values = [];
  for (let k = j; k < stop && values.length < labels.length; k += 1) {
    const t = lines[k].trim();
    if (!t) continue;
    if (NOISE(t)) continue;
    // Stop at the first content line that is not name-shaped: the names are contiguous, so
    // a prose line means the run has ended and anything beyond it is description text.
    if (!isNameLine(t)) break;
    values.push({ text: t, line: k });
  }

  if (values.length === labels.length) {
    stats.positional += 1;
    records.push({
      heading: mono.heading, part: mono.part, sourceLine: mono.line + 1,
      alignment: 'positional',
      names: labels.map((l, idx) => ({ lang: l.lang, code: l.code, value: values[idx].text })),
    });
  } else {
    stats.needsAdjudication += 1;
    records.push({
      heading: mono.heading, part: mono.part, sourceLine: mono.line + 1,
      alignment: 'needsAdjudication',
      labelCount: labels.length,
      valueCount: values.length,
      labels: labels.map((l) => ({ lang: l.lang, code: l.code })),
      values: values.slice(0, 24).map((v) => v.text),
    });
  }
}

// Map each monograph heading onto our pages. The heading is the drug's Sanskrit name, which
// is usually our slug or title; aliases catch the rest. No fuzzy matching: a heading that
// does not match exactly on the ASCII key is left unmapped and reported, because attaching
// a name set to the wrong drug is the one outcome worth more than the coverage.
const byKey = new Map();
for (const kind of ['herb', 'formulation']) {
  const dir = path.join('content', kind);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const fm = raw.split('---')[1] ?? '';
    const slug = (fm.match(/^slug:\s*"?([^"\n]+)"?/m) ?? [])[1]?.trim() ?? path.basename(f, '.md');
    const title = (fm.match(/^title:\s*"([^"]+)"/m) ?? [])[1] ?? slug;
    const aliases = ((fm.match(/^aliases:\s*\[(.*)\]/m) ?? [])[1] ?? '')
      .split(',').map((s) => s.replace(/["']/g, '').trim()).filter(Boolean);
    for (const cand of [slug, title, ...aliases]) {
      const k = asciiKey(cand);
      if (k && !byKey.has(k)) byKey.set(k, { kind, slug, title });
    }
  }
}

/**
 * A romanisation-tolerant key, because the API and this site transliterate differently.
 *
 * The API prints ASVAGANDHA, GOKSURA, ATIVISA: diacritics simply dropped, so ś and ṣ both
 * become s and kṣ becomes ks. Our slugs use the digraph convention a reader would type,
 * ashwagandha and gokshura. An exact ASCII key matches 160 of 409 headings and misses the
 * rest on nothing but spelling convention.
 *
 * Aspirates are collapsed too (dh to d, bh to b), which is aggressive enough to merge two
 * genuinely different drugs. So a match counts only when it is UNIQUE IN BOTH DIRECTIONS:
 * one heading resolving to one page and that page claimed by no other heading. Anything
 * ambiguous is reported, never picked. Attaching Bala's name set to Bhallataka would be a
 * worse outcome than leaving both unmapped.
 */
function looseKey(s) {
  let k = asciiKey(s);
  k = k.replace(/ksh|x/g, 'ks').replace(/sh/g, 's').replace(/chh?/g, 'c');
  k = k.replace(/([kgtdpb])h/g, '$1').replace(/w/g, 'v').replace(/jny|gy/g, 'jn');
  k = k.replace(/aa/g, 'a').replace(/ee|ii/g, 'i').replace(/oo|uu/g, 'u');
  k = k.replace(/(.)\1+/g, '$1');
  return k;
}

const looseByKey = new Map();      // looseKey -> page[] (collisions kept so they can be seen)
for (const [, page] of byKey) {
  const k = looseKey(page.slug);
  if (!looseByKey.has(k)) looseByKey.set(k, []);
  const bucket = looseByKey.get(k);
  if (!bucket.some((p) => p.slug === page.slug)) bucket.push(page);
}

// How many headings want each page, so a page claimed twice is not silently given to the
// first heading that asked.
const demand = new Map();
for (const r of records) {
  const bucket = looseByKey.get(looseKey(r.heading));
  if (bucket?.length === 1) {
    const s = bucket[0].slug;
    demand.set(s, (demand.get(s) ?? 0) + 1);
  }
}

let mapped = 0;
let ambiguous = 0;
for (const r of records) {
  const exact = byKey.get(asciiKey(r.heading));
  if (exact) { r.page = exact; r.match = 'exact'; mapped += 1; continue; }

  const bucket = looseByKey.get(looseKey(r.heading));
  if (!bucket) continue;
  if (bucket.length > 1 || demand.get(bucket[0].slug) > 1) {
    r.ambiguousWith = bucket.map((p) => `${p.kind}/${p.slug}`);
    ambiguous += 1;
    continue;
  }
  r.page = bucket[0];
  r.match = 'loose';
  mapped += 1;
}

const usable = records.filter((r) => r.alignment !== 'needsAdjudication');
const usableMapped = usable.filter((r) => r.page);

console.log(`SYNONYMS blocks found   ${synonymBlocks.length}`);
console.log(`with a SYNONYMS block   ${records.length}`);
console.log(`  inline (exact)        ${stats.inline}`);
console.log(`  positional (counts match) ${stats.positional}`);
console.log(`  needs adjudication    ${stats.needsAdjudication}`);
console.log(`no synonyms found       ${stats.noSynonyms}`);
console.log(`mapped to one of our pages  ${mapped}  (usable and mapped: ${usableMapped.length})`);
console.log(`ambiguous, left unmapped    ${ambiguous}`);

if (REPORT) {
  console.log('\n--report: nothing written.');
  const sample = usableMapped.slice(0, 3);
  for (const r of sample) {
    console.log(`\n${r.heading} (${r.part}) -> ${r.page.kind}/${r.page.slug}  [${r.alignment}]`);
    for (const n of r.names) console.log(`   ${n.lang.padEnd(10)} ${n.value}`);
  }
  process.exit(0);
}

const payload = {
  _note: 'Vernacular names parsed from the Ayurvedic Pharmacopoeia of India (sources-private/'
    + 'api-all.txt, gitignored). `inline` records had each value on its label line and are exact. '
    + '`positional` records had labels and values in separate OCR columns with matching counts. '
    + '`needsAdjudication` records had mismatched counts and are NOT aligned here, because a '
    + 'positional guess there would shift every later name into the wrong language.',
  source: {
    name: 'Ayurvedic Pharmacopoeia of India',
    publisher: 'Government of India, Ministry of AYUSH',
    localFile: SRC,
    note: 'Names are facts about usage, not the Pharmacopoeia\'s expression. The source text '
      + 'itself is not redistributed and stays gitignored.',
  },
  summary: { synonymBlocks: synonymBlocks.length, ...stats, mapped, ambiguous, usableMapped: usableMapped.length },
  records: records.sort((a, b) => a.heading.localeCompare(b.heading)),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`\nwrote ${OUT}`);
