#!/usr/bin/env node
/**
 * Catch a page that shows an AFI entry for a DIFFERENT formulation than its own name.
 *
 * Composition.astro prints "As given in the Ayurvedic Formulary of India, Part I, entry 7:35
 * (SUDARSANA CURNA)" and then the entry's 44 ingredient rows. That is honest about which entry it
 * is showing, which is how this was found. What it cannot say on its own is whether that entry is
 * about the formulation the page is named after.
 *
 * On `mahasudarshan-churna` it is not. The AFI contains no Mahasudarshan entry: a search of the
 * formulary text returns only SUDARSANA CURNA, entry 7:35, and nothing under maha-. So the page
 * publishes Sudarsana Curna's composition as Mahasudarshan Churna's, and its whoStatus claims
 * "Listed in Ayurvedic Formulary of India (AFI) Part I" on that basis. A reader has no way to
 * tell whether SUDARSANA CURNA is the formulary's romanisation of this page's subject or a
 * different drug, and in Ayurvedic nomenclature maha- marks a different drug.
 *
 * WHY THE CHECK IS THIS NARROW. The obvious version, comparing the page name with the AFI
 * heading, reports 47 of 101 records and 46 of them are fine: ghrita against GHRTA, arishta
 * against ARISTA, kashayam against KVATHA CURNA, vati against GUTIKA. Sanskrit formulation names
 * legitimately differ in the form-word and in -adya- infixes, so a general name match is not a
 * gate, it is noise, and a gate that cries wolf 46 times out of 47 trains people to ignore it.
 *
 * The signal is the distinguishing PREFIX. maha-, brihat- and laghu- are not spelling variants:
 * Maha Yogaraja Guggulu and Yogaraja Guggulu are different formulations with different ingredient
 * lists. So the rule is that a page whose name carries such a prefix must map to an AFI entry
 * that carries it too. That reports exactly one record, with two clean controls that pass
 * (maha-narayana-thailam -> MAHA NARAYANA TAILA, mahayograj-guggul -> MAHA YOGARAJA GUGGULU).
 *
 * WHAT --write DOES. It does not change the mapping and it does not delete the table: whether
 * Mahasudarshan and Sudarshan are one drug or two is an editorial question, and if they are one
 * the answer is to merge the pages, not to strip one. It stamps `entryNameNote` on the record so
 * the page states the discrepancy in the same paragraph as the attribution, which is truthful
 * under either answer.
 *
 *   node scripts/check-afi-naming.mjs            # report
 *   node scripts/check-afi-naming.mjs --write     # stamp the note onto the record
 */
import fs from 'node:fs';
import path from 'node:path';

const COMPOSITION = path.join('src', 'data', 'composition.json');
const WRITE = process.argv.includes('--write');

/** Prefixes that distinguish one formulation from another rather than spelling it differently. */
const PREFIX = /^(mahat|maha|brihat|brhat|laghu|kshudra|ksudra)/i;

const flat = (s) => String(s ?? '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

const data = JSON.parse(fs.readFileSync(COMPOSITION, 'utf8'));
const records = data.records ?? {};

const mismatched = [];
const controls = [];

for (const [slug, rec] of Object.entries(records)) {
  if (!rec.entryHeading) continue;
  const m = slug.match(PREFIX);
  if (!m) continue;
  const prefix = flat(m[1]).replace(/t$/, '');
  if (flat(rec.entryHeading).includes(prefix)) {
    controls.push({ slug, heading: rec.entryHeading.trim() });
  } else {
    mismatched.push({ slug, prefix: m[1], heading: rec.entryHeading.trim(), entry: rec.entryNumber, rec });
  }
}

console.log(`records carrying a distinguishing prefix   ${mismatched.length + controls.length}`);
console.log(`prefix absent from the AFI entry heading   ${mismatched.length}`);

for (const x of mismatched) {
  console.log(`\n  ${x.slug}`);
  console.log(`    page name carries:  ${x.prefix}-`);
  console.log(`    AFI entry ${x.entry}:      ${x.heading}`);
  console.log(`    so the page shows this entry's composition under a different formulation's name`);
}
if (controls.length) {
  console.log('\n  controls that pass:');
  for (const c of controls) console.log(`    ${c.slug} -> ${c.heading}`);
}

if (!WRITE) {
  console.log(`\n${mismatched.length ? 'FINDING' : 'PASS'}: ${mismatched.length} record(s) want a note or a decision.`);
  console.log('Pass --write to stamp entryNameNote onto them.');
  process.exit(0);
}

let stamped = 0;
for (const x of mismatched) {
  const note = `The formulary has no entry under the name of this page. Its entry ${x.entry} is `
    + `${x.heading}, and a search of the formulary text finds nothing under ${x.prefix}-. In `
    + `Ayurvedic naming a ${x.prefix}- prefix usually marks a different formulation rather than a `
    + `different spelling, so the composition above should be read as the formulary's `
    + `${x.heading} and not assumed to be this page's subject.`;
  if (x.rec.entryNameNote === note) continue;
  x.rec.entryNameNote = note;
  stamped += 1;
}
if (stamped) fs.writeFileSync(COMPOSITION, `${JSON.stringify(data, null, 2)}\n`);
console.log(`\nstamped ${stamped} record(s) in ${COMPOSITION}`);
