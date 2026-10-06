#!/usr/bin/env node
/**
 * Harvest dose and anupana for formulation pages from the Ayurvedic Formulary of India.
 *
 * Why these two fields. The composition tables already published from the AFI carry
 * ingredients and quantities but nothing else, and the formulation queries arriving at the
 * site ask for more than ingredients: dose, anupana, and the timing relative to meals. One
 * query was literally "saraswatarishta bhaishajya ratnavali dose anupana milk water medhya
 * timing". The Formulary prints the dose and the anupana for every entry, so the answer to
 * the most specific questions readers ask is already in a source on disk.
 *
 * Why this is a parse and not an agent pass. Each entry prints "Dosage :" (Part I) or
 * "Dose :" (Part II) with the figure on a following line, and the span of each entry is
 * already pinned by the entry number and heading recorded in src/data/composition.json. There
 * is no judgement in reading "1 to 3 g." off a line, so spending agents on it would be waste.
 *
 * Two traps, both real in this source, and both the reason this validates rather than takes
 * the next line:
 *
 *   - An entry whose dose did not survive OCR leaves "Dosage :" followed directly by the NEXT
 *     entry's heading. At line 3388 of Part I that is "1: 3 AYASKRTI", which a next-non-blank
 *     parse would publish as a dose.
 *   - Part II opens with a prose preamble about doses ("Doses mentioned in the Formulary are
 *     intended merely for general guidance..."), which is not an entry and must not be read
 *     as one.
 *
 * So a value counts as a dose only if it carries a number and a unit, or is an explicit
 * instruction, and is not an entry heading. Anything else is left absent. A page with no
 * dose row is correct; a page with the next formulation's name in its dose row is not.
 *
 *   node scripts/harvest-afi-dose.mjs            # update src/data/composition.json in place
 *   node scripts/harvest-afi-dose.mjs --dry
 */
import fs from 'node:fs';
import path from 'node:path';

const COMPOSITION = path.join('src', 'data', 'composition.json');
const DRY = process.argv.includes('--dry');

const BOOKS = {
  I: path.join('sources-private', 'afi-b32232184.txt'),
  II: path.join('sources-private', 'afi-b32232172.txt'),
};

const lines = {};
for (const [part, file] of Object.entries(BOOKS)) {
  if (!fs.existsSync(file)) {
    console.error(`Missing ${file}. It is gitignored source text and has to be present locally.`);
    process.exit(1);
  }
  lines[part] = fs.readFileSync(file, 'utf8').split('\n').map((s) => s.replace(/\s+$/, ''));
}

/**
 * An entry heading: "1: 1 ABHAYARISTA", "7:34 SITOPALADI CURNA".
 *
 * Deliberately not anchored at the end of the line. The Formulary is a two-column book and
 * OCR merged the columns, so a heading usually shares its line with text from the column
 * beside it: "6:1 AMRTA GHRTA 1. Jivanti", or "AGASTYA HARITAKI RASAYANA in a vessel. The
 * specified quantity of water is". An end-anchored pattern found neither, which is why 31 of
 * 100 entries could not be located on the first attempt.
 *
 * The heading capture is a run of capitals, so it stops of its own accord at the lowercase
 * word where the neighbouring column begins.
 */
const ENTRY = /^(\d{1,2})\s*:\s*(\d{1,3})\s+([A-Z][A-Z0-9 ()'./-]{2,60})/;

/** Same shape, but the entry number did not survive OCR ("ie : 1 AGASTYA HARITAKI..."). */
const ENTRY_LOOSE = /^[^a-z]{0,8}\s*:\s*(\d{1,3})\s+([A-Z][A-Z0-9 ()'./-]{4,60})/;

/**
 * A dose figure. The Formulary states quantities metrically, and the unit is what separates a
 * real dose from a stray line. `mi` and `mt` are OCR of `ml` and are accepted here but
 * recorded, because silently rewriting a unit in a pharmacopoeial figure is the kind of
 * correction that should be visible.
 */
const UNIT = '(?:g|gm|gms|mg|kg|ml|mi|mt|l|litre|litres|drops?|tola|masa|pala)';
const NUM = '\\d+(?:\\.\\d+)?';
const RANGE = new RegExp(`(${NUM})\\s*(?:to|[-–—])\\s*(${NUM})\\s*(${UNIT})\\b`, 'i');
const SINGLE = new RegExp(`(${NUM})\\s*(${UNIT})\\b`, 'i');
const DOSE_WORDS = /^(as directed|as required|quantity sufficient|q\.s\.|for external use|external use only)/i;

/** Units the scan recognises but the book did not print cleanly. */
const UNIT_FIX = { mi: 'ml', mt: 'ml', gm: 'g', gms: 'g' };

/**
 * Pull the dose expression out of a line rather than accepting the line whole.
 *
 * Taking the whole line publishes the neighbouring column with it. Amrta Ghrta's dose line
 * reads "12 g. 13. Suathi", where "13. Suathi" is the thirteenth ingredient of the entry
 * printed beside it, and a validate-then-take-the-line approach put that on the page.
 *
 * Extracting also fixes the opposite error. OCR drops the spaces around a range, so the real
 * doses "2to4g.", "12g." and "3 to 6g." were being refused as malformed when they are
 * perfectly ordinary figures.
 */
function extractDose(text) {
  const t = String(text);
  const r = t.match(RANGE);
  if (r) {
    const unit = UNIT_FIX[r[3].toLowerCase()] ?? r[3].toLowerCase();
    return { value: `${r[1]} to ${r[2]} ${unit}`, ocr: unit !== r[3].toLowerCase() ? r[3] : null };
  }
  const s = t.match(SINGLE);
  if (s) {
    const unit = UNIT_FIX[s[2].toLowerCase()] ?? s[2].toLowerCase();
    return { value: `${s[1]} ${unit}`, ocr: unit !== s[2].toLowerCase() ? s[2] : null };
  }
  if (DOSE_WORDS.test(t.trim())) return { value: t.trim().replace(/\s*\.\s*$/, ''), ocr: null };
  return null;
}

/**
 * Anupana is a list of vehicles, so it ends where the sentence-like text or the next column's
 * numbering begins. Cutting at the first digit is what keeps "13. Suathi" out of it too.
 */
function extractAnupana(text) {
  let t = String(text).split(/\s\d+\./)[0].trim();
  t = t.replace(/[,;.\s]+$/, '').replace(/\s+/g, ' ');
  if (!t || !/^[A-Za-z]/.test(t)) return null;
  if (t.length > 80) return null;
  if (/\b(are|is|the|shall|should|may|intended|represent|generally)\b/i.test(t)) return null;
  return t;
}

/**
 * Fold a heading for comparison, dropping any parenthetical.
 *
 * composition.json records the heading as printed with its synonym note,
 * "AGASTYA HARITAKI RASAYANA (Synonym : Agastya Haritaki)", but in the book that
 * parenthetical sits on the following line, so the two never matched as written.
 */
const foldKey = (s) => String(s).replace(/\([^)]*\)?/g, ' ')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Index every entry heading in a book, so an entry's span is the gap to the next one. */
const index = {};
for (const [part, book] of Object.entries(lines)) {
  index[part] = [];
  book.forEach((raw, i) => {
    const t = raw.trim();
    const m = t.match(ENTRY);
    if (m) { index[part].push({ chapter: m[1], num: m[2], heading: m[3].trim(), line: i }); return; }
    const l = t.match(ENTRY_LOOSE);
    if (l) index[part].push({ chapter: '', num: l[1], heading: l[2].trim(), line: i });
  });
  console.log(`AFI Part ${part}: ${index[part].length} entry headings`);
}

const composition = JSON.parse(fs.readFileSync(COMPOSITION, 'utf8'));
const records = composition.records;

const stats = { looked: 0, located: 0, dose: 0, anupana: 0, ocrUnit: 0, rejectedHeading: 0, rejectedShape: 0 };
const notes = [];

for (const [slug, rec] of Object.entries(records)) {
  stats.looked += 1;
  const book = lines[rec.afiPart];
  const idx = index[rec.afiPart];
  if (!book || !idx) continue;

  // Locate this entry. The entry number pins it; the heading confirms it, so a renumbered
  // or mis-OCR'd number cannot silently attach another formulation's dose to this page.
  const [chapter, num] = String(rec.entryNumber ?? '').split(':').map((s) => s.trim());
  const wantHeading = foldKey(rec.entryHeading ?? '');
  // The number pins the entry and the heading confirms it. Where OCR lost the number, the
  // heading alone decides. Prefix equality either way, because the capital run in the book
  // can be cut short by the neighbouring column or carry a word the record's heading drops.
  const sameHeading = (e) => {
    const h = foldKey(e.heading);
    if (!h || !wantHeading) return false;
    return h === wantHeading || h.startsWith(wantHeading) || wantHeading.startsWith(h);
  };
  let at = idx.findIndex((e) => e.chapter === chapter && e.num === num && sameHeading(e));
  if (at === -1) at = idx.findIndex((e) => e.num === num && sameHeading(e));
  if (at === -1) at = idx.findIndex(sameHeading);
  if (at === -1) { notes.push({ slug, why: 'entry heading not located in the book' }); continue; }
  stats.located += 1;

  const start = idx[at].line;
  const end = at + 1 < idx.length ? idx[at + 1].line : book.length;

  /**
   * The first value after a label, within this entry only, passed through an extractor.
   *
   * The extractor returns null for anything that is not the thing being looked for, which is
   * what stops a label with no value from borrowing the next entry's heading.
   */
  const valueAfter = (labelRe, extract) => {
    for (let i = start; i < end; i += 1) {
      const t = book[i].trim();
      const m = t.match(labelRe);
      if (!m) continue;
      const inline = (m[1] ?? m[2] ?? '').trim();
      const candidates = [];
      if (inline) candidates.push(inline);
      for (let k = i + 1; k < end && candidates.length < 3; k += 1) {
        const v = book[k].trim();
        if (v) candidates.push(v);
      }
      for (const c of candidates) {
        if (ENTRY.test(c)) { stats.rejectedHeading += 1; break; }
        if (/^(Important therapeutic uses|Anupana|Dosage|Dose|Therapeutic uses)/i.test(c)) break;
        const got = extract(c);
        if (got) return got;
        stats.rejectedShape += 1;
        break;
      }
      return null;
    }
    return null;
  };

  const dose = valueAfter(/^Dosa?ge?\s*:\s*(.*)$|^Dose\s*:\s*(.*)$/i, extractDose);

  const anupana = valueAfter(/^Anupa?na\s*:\s*(.*)$/i, extractAnupana);

  if (dose) {
    rec.dose = dose.value;
    rec.doseSource = `Ayurvedic Formulary of India, Part ${rec.afiPart}, entry ${rec.entryNumber}`;
    stats.dose += 1;
    if (dose.ocr) {
      rec.doseOcrNote = `The unit is printed "${dose.ocr}" in the scanned text and is read as "${rec.dose.split(' ').pop()}".`;
      stats.ocrUnit += 1;
    }
  }
  if (anupana) { rec.anupana = anupana; stats.anupana += 1; }
}

composition.note = 'AFI composition tables, with dose and anupana from the same entries. '
  + 'Written by scripts/apply-composition.mjs and scripts/harvest-afi-dose.mjs; never edit by hand.';

console.log(`\nrecords examined     ${stats.looked}`);
console.log(`entries located      ${stats.located}`);
console.log(`dose captured        ${stats.dose}`);
console.log(`anupana captured     ${stats.anupana}`);
console.log(`unit read as mi/mt   ${stats.ocrUnit}  (flagged on the record, not silently rewritten)`);
console.log(`refused: next entry's heading sat where a value should be  ${stats.rejectedHeading}`);
console.log(`refused: value did not look like a dose or a vehicle       ${stats.rejectedShape}`);
if (notes.length) console.log(`not located          ${notes.length}: ${notes.slice(0, 6).map((n) => n.slug).join(', ')}`);

if (DRY) {
  console.log('\n--dry: nothing written.');
  const sample = Object.entries(records).filter(([, r]) => r.dose).slice(0, 8);
  for (const [slug, r] of sample) console.log(`  ${slug.padEnd(26)} dose ${String(r.dose).padEnd(18)} anupana ${r.anupana ?? '-'}`);
  process.exit(0);
}

fs.writeFileSync(COMPOSITION, `${JSON.stringify(composition, null, 2)}\n`);
console.log(`\nwrote ${COMPOSITION}`);
