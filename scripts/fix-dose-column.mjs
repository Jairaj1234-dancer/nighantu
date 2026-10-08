#!/usr/bin/env node
/**
 * Put the dose column on a source.
 *
 * THE PROBLEM. Of the 51 formulations where this project holds the Ayurvedic Formulary of India's
 * own dose, exactly THREE page figures match it. 15 differ in the same unit, 27 in a different
 * unit, 6 are absent. Three out of 51 is not a formulary-derived column with errors in it, it is a
 * column derived from something else, and no page says what: every one lists generic sources
 * ("Web research", "Amidha Ayurveda Herb Database") and none attributes its dose figure to any of
 * them. On a site whose entire value is that its claims can be followed to a source, the dose was
 * the least sourced thing on it and the most consequential.
 *
 * WHY A BLANKET REPLACEMENT WOULD BE WORSE, AND UNSAFE. The AFI's dose field does not always
 * measure the same thing as the page's. For a KVATHA CURNA the formulary states the weight of
 * coarse powder used to PREPARE a decoction, commonly 48 g, while the page states the volume of
 * finished decoction taken, commonly 15-30 mL. Writing the formulary's number over the page's
 * would tell a reader to take 48 g of decoction. Those are not a discrepancy at all; they are two
 * different quantities, and a script that could not tell them apart would turn a provenance fix
 * into a dosing error.
 *
 * So the fix classifies by dosage form, which the AFI's own entry heading gives:
 *
 *   PREPARATION WEIGHT (kvatha curna, and any entry whose dose unit is a weight while the page
 *   states a volume). The page's quantity STAYS. The formulary sentence is reworded to say what
 *   its figure actually measures, so the two stop reading as a contradiction.
 *
 *   DOSE AS TAKEN (arista, asava, arka, curna, gutika, vati, ghrta, taila, rasayana, avaleha,
 *   guggulu, rasa). Here the formulary figure IS the dose, in the same form and unit as the
 *   page's, so it becomes the stated figure and the unsourced one is superseded rather than
 *   deleted. Frequency, vehicle and route are preserved untouched: the formulary gives a quantity
 *   and an anupana, not a schedule, so "twice daily after meals" is the page's own and is not
 *   something this script has any reason to drop.
 *
 *   FORM MISMATCH. Where the page states a form the formulary's figure does not cover, a tablet
 *   count against a powder weight, nothing is replaced and the case is reported. A tablet count
 *   cannot be derived from a powder weight without knowing the tablet.
 *
 * WHAT THIS DOES NOT DO. It does not invent a figure, and it does not touch the 41 pages with no
 * formulary dose held here: those keep their own figure, which stays unsourced, and that is worth
 * knowing rather than papering over.
 *
 *   node scripts/fix-dose-column.mjs            # dry run
 *   node scripts/fix-dose-column.mjs --write
 */
import fs from 'node:fs';
import path from 'node:path';
import { sanitiseSource, refuseSource } from './lib/afi-source.mjs';

const CONTENT = path.join('content', 'formulation');
const COMPOSITION = path.join('src', 'data', 'composition.json');
const SUPERSEDED = path.join('src', 'data', 'dose-superseded.json');
const WRITE = process.argv.includes('--write');
const TODAY = new Date().toLocaleDateString('en-CA');

const records = JSON.parse(fs.readFileSync(COMPOSITION, 'utf8')).records ?? {};

/**
 * Entries whose dose is the weight of drug used to PREPARE the dose, not the dose taken. This is
 * the decoction case and only the decoction case: the formulary gives the weight of kvatha curna,
 * the page gives the volume of finished decoction. Tested on the entry heading AND the slug,
 * because the heading romanises as KVATHA CURNA while the page is named kashayam or kwath.
 */
const PREPARATION = /KVATHA|KASAYA/i;
const isDecoction = (slug, heading) => PREPARATION.test(heading ?? '') || /kashayam?|kwath|kashaya/i.test(slug);

/**
 * The unit, with no word boundary before it.
 *
 * `\b(mg|g|ml)\b` looks right and fails on "1-3g", because there is no boundary between a digit
 * and a letter. That made unitOf return undefined for every figure written without a space, which
 * routed them into the preparation-weight branch as though a gram figure meant a decoction.
 * sitopaladi-churna, whose page figure ALREADY matches the formulary exactly, came out the far
 * side labelled "formulary 1 to 3 g is drug to prepare". The lesson is the one this project keeps
 * relearning: a classifier that silently returns undefined sends everything down the default path.
 */
const unitOf = (s) => (String(s).match(/(mg|ml|g)\s*$/i) ?? String(s).match(/(mg|ml|g)\b/i) ?? [])[1]?.toLowerCase();
const numsOf = (s) => (String(s).match(/[\d.]+/g) ?? []).map(Number);
/** The page's own quantity token, e.g. "15-30 mL" or "125-250 mg". */
const qtyOf = (s) => (String(s).match(/[\d.]+\s*(?:to|-|–)\s*[\d.]+\s*(?:mg|g|mL|ml)|[\d.]+\s*(?:mg|g|mL|ml)/i) ?? [])[0];

const adopted = [];
const preparation = [];
const formMismatch = [];
const alreadyRight = [];
const noFigure = [];
const skipped = [];
const crossUnit = [];
const noFormularyEntry = [];
const supersededLog = [];

for (const file of fs.readdirSync(CONTENT).filter((f) => f.endsWith('.md'))) {
  const slug = file.replace(/\.md$/, '');
  const rec = records[slug];
  if (!rec?.dose) continue;

  const full = path.join(CONTENT, file);
  const md = fs.readFileSync(full, 'utf8');
  const m = md.match(/(\*\*Standard Dosage:\*\*)([^\n]*)/);
  if (!m) continue;

  const whole = m[0];
  const body = m[2];
  // The clinical half is everything before the sentence this project added about the formulary.
  const clinical = body.split('The Ayurvedic Formulary')[0].trim().replace(/[.,]\s*$/, '');
  const afiSource = rec.classicalSource && !refuseSource(rec.classicalSource)
    ? sanitiseSource(rec.classicalSource) : null;
  const attribution = `Ayurvedic Formulary of India, Part ${rec.afiPart}, entry ${rec.entryNumber}`;
  const anupana = rec.anupana ? ` The formulary's anupana: ${rec.anupana}.` : '';
  const attributes = afiSource ? ` The formulary attributes this formula to ${afiSource}.` : '';

  /**
   * The formulary entry is not about this formulation at all.
   *
   * `entryNameNote` marks a record whose AFI entry describes a different drug, which on this site
   * is mahasudarshan-churna: the formulary carries Sudarsana Curna and no maha- entry, and the two
   * are different formulations. Adopting that entry's DOSE here would be the same error as
   * publishing its composition, one field along, and it nearly happened: the first run of this
   * script had mahasudarshan-churna in the adopted list at "3-6g -> 2 to 4 g".
   */
  if (rec.entryNameNote) {
    const replacement = `${m[1]} ${clinical}. The formulary has no entry for this formulation, so `
      + `no formulary dose is available for it; its entry ${rec.entryNumber} (${rec.entryHeading}) `
      + `is a different drug and its dose of ${rec.dose} does not apply here. The figure above `
      + `carries no published source.`;
    if (replacement !== whole) noFormularyEntry.push({ slug, full, whole, replacement, page: qtyOf(clinical) });
    else skipped.push(slug);
    continue;
  }

  const pageQty = qtyOf(clinical);
  const isPrep = isDecoction(slug, rec.entryHeading);

  // A preparation weight: keep the page's quantity, and say what the formulary's figure measures.
  if (isPrep) {
    const replacement = `${m[1]} ${clinical}. The ${attribution} specifies ${rec.dose} of the `
      + `kvatha curna to prepare the decoction, which is a quantity of drug rather than a dose `
      + `taken, so it is not comparable with the volume above.${anupana}${attributes}`;
    if (replacement !== whole) preparation.push({ slug, full, whole, replacement, afi: rec.dose, page: pageQty });
    else skipped.push(slug);
    continue;
  }

  /**
   * No weight or volume on the page: the formulary's figure is the only sourced one, so it leads.
   *
   * The page may still say something about the dose without stating a quantity, typically a
   * tablet count. That text is kept and placed BEFORE the anupana, which reads in the order a
   * reader needs it, and where it counts tablets the sentence says plainly that the two relate
   * only through a tablet mass the formulary does not give. An earlier version appended the
   * clinical text after the anupana and left "2 to 4 g" sitting beside "1-2 tablets" with nothing
   * connecting them, which invites the reader to equate the two.
   */
  if (!pageQty) {
    const counts = /tablet|capsule|pill/i.test(clinical);
    const relation = counts
      ? ` The page's tablet count and this weight relate only through the mass of a tablet, which `
        + `the formulary does not state.`
      : '';
    const replacement = `${m[1]} ${rec.dose}, as given in the ${attribution}.`
      + `${clinical ? ` ${clinical}.` : ''}${relation}${anupana}${attributes}`;
    noFigure.push({ slug, full, whole, replacement, afi: rec.dose });
    continue;
  }

  // A form the formulary's figure does not cover: a tablet count against a powder weight.
  if (/tablet|capsule|pill|vati\b/i.test(clinical) && unitOf(rec.dose) !== unitOf(pageQty)) {
    formMismatch.push({ slug, page: pageQty, afi: rec.dose, clinical });
    continue;
  }

  /**
   * Different units and not a decoction: a guggulu stated in mg against a formulary gram figure,
   * or an oil stated in mL against a weight. These are not comparable without an assumption this
   * script has no business making (a tablet mass, a density), so the page figure stays and the
   * formulary's is stated plainly as its own figure, with no claim about how the two relate.
   */
  if (unitOf(pageQty) !== unitOf(rec.dose)) {
    const replacement = `${m[1]} ${clinical}. The ${attribution} states a dose of ${rec.dose}; `
      + `that is a different unit from the figure above and the two cannot be compared without `
      + `knowing the preparation's density or tablet mass.${anupana}${attributes}`;
    if (replacement !== whole) crossUnit.push({ slug, full, whole, replacement, page: pageQty, afi: rec.dose });
    else skipped.push(slug);
    continue;
  }

  const same = numsOf(pageQty).join() === numsOf(rec.dose).join();
  if (same) {
    const replacement = `${m[1]} ${clinical}, as given in the ${attribution}.${anupana}${attributes}`;
    if (replacement !== whole) alreadyRight.push({ slug, full, whole, replacement });
    else skipped.push(slug);
    continue;
  }

  /**
   * Adopt the formulary's quantity in place of the unsourced one, keeping everything else in the
   * sentence. The schedule and the vehicle are the page's own and the formulary states neither.
   */
  const rest = clinical.replace(pageQty, '').replace(/^[\s,]+/, '').trim();
  const replacement = `${m[1]} ${rec.dose}${rest ? ` ${rest}` : ''}, as given in the `
    + `${attribution}.${anupana} This replaces a previously stated ${pageQty}, which carried no `
    + `source.${attributes}`;
  adopted.push({ slug, full, whole, replacement, from: pageQty, to: rec.dose });
  supersededLog.push({ slug, supersededFigure: pageQty, replacedWith: rec.dose, entry: rec.entryNumber, on: TODAY });
}

const show = (title, rows, fmt) => {
  if (!rows.length) return;
  console.log(`\n${title} (${rows.length})`);
  for (const r of rows) console.log(`  ${r.slug.padEnd(30)} ${fmt(r)}`);
};

console.log(`formulations with a formulary dose   ${adopted.length + preparation.length + crossUnit.length + formMismatch.length + alreadyRight.length + noFigure.length + skipped.length}`);
show('ADOPTED the formulary figure, unsourced one superseded', adopted, (r) => `${r.from} -> ${r.to}`);
show('PREPARATION WEIGHT, page figure kept and the formulary\'s explained', preparation, (r) => `page ${r.page} kept; formulary ${r.afi} is drug to prepare`);
show('NO FORMULARY ENTRY for this formulation, dose not adopted', noFormularyEntry, (r) => `page ${r.page} kept; the AFI entry is a different drug`);
show('DIFFERENT UNITS, page figure kept and the formulary\'s stated plainly', crossUnit, (r) => `page ${r.page} kept; formulary states ${r.afi}`);
show('FORM MISMATCH, nothing replaced', formMismatch, (r) => `page states ${r.page} as ${/tablet/i.test(r.clinical) ? 'tablets' : 'another form'}; formulary ${r.afi}`);
show('ALREADY MATCHED, now attributed', alreadyRight, () => 'figure unchanged, source named');
show('NO PAGE FIGURE, formulary figure stated', noFigure, (r) => `now states ${r.afi}`);
if (skipped.length) console.log(`\nunchanged                            ${skipped.length}`);

if (!WRITE) {
  console.log('\nDry run. Pass --write to apply.');
  process.exit(0);
}

for (const r of [...adopted, ...preparation, ...crossUnit, ...noFormularyEntry, ...alreadyRight, ...noFigure]) {
  fs.writeFileSync(r.full, fs.readFileSync(r.full, 'utf8').replace(r.whole, r.replacement));
}
fs.writeFileSync(SUPERSEDED, `${JSON.stringify({
  note: 'Dose figures replaced by the Ayurvedic Formulary of India\'s own figure because they '
    + 'carried no source. Kept so the change is reversible and auditable; nothing here is '
    + 'published.',
  updatedAt: TODAY,
  replaced: supersededLog,
}, null, 2)}\n`);
console.log(`\nwrote ${adopted.length + preparation.length + crossUnit.length + noFormularyEntry.length + alreadyRight.length + noFigure.length} page(s); superseded figures recorded in ${SUPERSEDED}`);
