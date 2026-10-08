#!/usr/bin/env node
/**
 * Publish the formulary compositions as a dataset.
 *
 * src/data/composition.json holds 101 formulations transcribed from the Ayurvedic Formulary of
 * India, 1,985 ingredient rows of which 1,928 carry a quantity, each cited to a part and entry
 * number and checked row by row against the book. It rendered on the formulation pages and was
 * published as a dataset nowhere: /composition.json returned 404, it was absent from /datasets/
 * and absent from llms.txt, while nine lesser datasets were all three. This closes that.
 *
 * WHAT IT PUBLISHES AND WHAT IT HOLDS BACK. Every row as printed, with the part abbreviation
 * expanded, the AFI part and entry number, and the classical text the formulary itself cites. An
 * OCR correction is flagged as ours rather than the book's, and an illegible cell is published as
 * illegible rather than guessed, because a reference whose gaps are invisible is worse than one
 * whose gaps are marked. Rows the transcription marks `structural` are the book's own furniture,
 * sub-headings and continuation lines; they keep their place and take no ingredient number.
 *
 *   node scripts/composition-dataset.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry-run');
const SRC = path.join('src', 'data', 'composition.json');
const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const records = data.records ?? {};

/** The AFI's own "Abbreviations for parts of plants", as used by src/components/Composition.astro. */
const PARTS = {
  'Rt.': 'root', 'Rz.': 'rhizome', 'Fr.': 'fruit', 'Sd.': 'seed', 'Lf.': 'leaf', 'Fl.': 'flower',
  'St.': 'stem', 'St. Bk.': 'stem bark', 'Rt. Bk.': 'root bark', 'Ht. Wd.': 'heart wood',
  'Pl.': 'whole plant', 'P.': 'pericarp', 'Exd.': 'exudate', 'Bl.': 'bulb', 'Ol.': 'oil',
  'Dr. Fr.': 'dry fruit', 'Dr. Sd.': 'dry seed', 'Ifl.': 'inflorescence', 'Gl.': 'gall',
  'Stmn.': 'stamens', 'Fl. Bd.': 'flower bud', 'Rt. Tr.': 'root tuber', 'St. Tr.': 'stem tuber',
  'Fr. R.': 'fruit rind', 'Enm.': 'endosperm', 'Rt./St.Bk.': 'root or stem bark',
  'Rt./St. Bk.': 'root or stem bark', 'S.C.': 'silicaceous concretion',
};
const partLabel = (p) => {
  if (!p) return null;
  if (PARTS[p]) return PARTS[p];
  const k = String(p).replace(/\s+/g, ' ').replace(/\s*\.\s*/g, '. ').trim().replace(/\s$/, '');
  return PARTS[k] ?? PARTS[`${k.replace(/\.$/, '')}.`] ?? p;
};

const marked = (v) => /^\[illegible/i.test(String(v ?? ''));

const entries = [];
let rowCount = 0;
let withQuantity = 0;
let illegible = 0;
let ocrCorrected = 0;

for (const [slug, rec] of Object.entries(records)) {
  const ingredients = [];
  for (const r of rec.rows ?? []) {
    if (r.structural) {
      // Kept, so the entry's structure survives, but never numbered as an ingredient.
      ingredients.push({ structural: true, text: r.name ?? null, quantity: r.quantity ?? null });
      continue;
    }
    rowCount += 1;
    const quantity = marked(r.quantity) ? null : (r.quantity ?? null);
    if (quantity) withQuantity += 1;
    if (marked(r.quantity) || marked(r.part) || marked(r.name)) illegible += 1;
    if (r.ocrCorrected) ocrCorrected += 1;
    ingredients.push({
      n: r.n ?? null,
      name: marked(r.name) ? null : (r.name ?? null),
      gloss: marked(r.gloss) ? null : (r.gloss ?? null),
      part: marked(r.part) ? null : partLabel(r.part),
      partAsPrinted: marked(r.part) ? null : (r.part ?? null),
      quantity,
      // An illegible cell says so rather than being dropped, so a gap is visible in the data.
      illegible: marked(r.quantity) || marked(r.part) || marked(r.name) || Boolean(r.illegible) || undefined,
      // The correction is ours, not the book's, and is labelled that way.
      ocrCorrected: r.ocrCorrected ?? undefined,
      reduction: r.reduction ?? undefined,
    });
  }

  entries.push({
    slug,
    page: `/formulation/${slug}/`,
    afiPart: rec.afiPart ?? null,
    entryNumber: rec.entryNumber ?? null,
    entryHeading: (rec.entryHeading ?? '').trim() || null,
    classicalSource: rec.classicalSource ?? null,
    dose: rec.dose ?? null,
    anupana: rec.anupana ?? null,
    ingredientCount: ingredients.filter((i) => !i.structural).length,
    ingredients,
    // Carried through so a reader of the dataset meets the same caveat as a reader of the page.
    entryNameNote: rec.entryNameNote ?? undefined,
  });
}

entries.sort((a, b) => a.slug.localeCompare(b.slug));

const summary = {
  formulations: entries.length,
  ingredientRows: rowCount,
  rowsWithQuantity: withQuantity,
  rowsIllegibleInScan: illegible,
  rowsWithAnOcrCorrection: ocrCorrected,
};

console.log('formulations        ', summary.formulations);
console.log('ingredient rows     ', summary.ingredientRows);
console.log('with a quantity     ', summary.rowsWithQuantity);
console.log('illegible in the scan', summary.rowsIllegibleInScan);
console.log('carrying a correction', summary.rowsWithAnOcrCorrection);

if (DRY) {
  console.log('\nDry run. Nothing written.');
  process.exit(0);
}

const payload = {
  name: 'Age Ayurveda Nighantu formulary composition dataset',
  description: 'Ingredient compositions of classical Ayurvedic formulations as printed in the '
    + 'Ayurvedic Formulary of India, with each ingredient\'s plant part and quantity, cited to the '
    + 'formulary part and entry number, and with the classical text the formulary itself cites for '
    + 'each formulation. Transcribed row by row against the book: a cell that was illegible in the '
    + 'scan is published as illegible rather than guessed, and an OCR correction is flagged as the '
    + 'transcriber\'s rather than the book\'s.',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  updatedAt: new Date().toLocaleDateString('en-CA'),
  source: 'Ayurvedic Formulary of India, Government of India, Ministry of AYUSH. '
    + 'Scans: archive.org/details/b32232184 and archive.org/details/b32232172.',
  summary,
  entries,
};

fs.writeFileSync(path.join('public', 'composition.json'), JSON.stringify(payload));

// The catalogue page states these counts, and a catalogue that misstates its own row counts is
// the one thing a data consumer cannot forgive. So the counts are written here, where they are
// computed, rather than recomputed by the page off the same source with its own arithmetic.
fs.writeFileSync(path.join('src', 'data', 'composition-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

// One row per ingredient, which is the shape anyone comparing a label against the formulary wants.
const csvCell = (v) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`);
const csvRows = [['formulation', 'afi_part', 'afi_entry', 'entry_heading', 'classical_source',
  'ingredient_n', 'ingredient', 'gloss', 'part', 'quantity', 'illegible', 'ocr_corrected', 'page'].join(',')];
for (const e of entries) {
  for (const i of e.ingredients) {
    if (i.structural) continue;
    csvRows.push([e.slug, e.afiPart, e.entryNumber, e.entryHeading, e.classicalSource,
      i.n, i.name, i.gloss, i.part, i.quantity, i.illegible ? 'yes' : '', i.ocrCorrected ? 'yes' : '',
      `https://nighantu.ageayurveda.com${e.page}`].map(csvCell).join(','));
  }
}
fs.writeFileSync(path.join('public', 'composition.csv'), `${csvRows.join('\n')}\n`);

console.log(`\nwrote public/composition.json and public/composition.csv (${csvRows.length - 1} ingredient rows)`);
