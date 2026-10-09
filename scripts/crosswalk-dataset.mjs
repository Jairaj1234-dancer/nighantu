#!/usr/bin/env node
/**
 * Publish the formulary ingredient crosswalk as a dataset.
 *
 * WHY THIS IS THE MOST VALUABLE THING THIS SITE HOLDS THAT NOBODY ELSE PUBLISHES.
 *
 * The Ayurvedic Formulary of India states every official composition in Sanskrit, and it does not
 * use one name per ingredient. Across the 101 entries transcribed here, 1,973 ingredient rows use
 * 638 distinct spellings. `Abhaya` and `Pathya` are both haritaki. `Nagara` is sunthi. `Marica` is
 * black pepper. `Ghrta`, `Sarpi` and `Havisa` are all ghee. A label says "Kali Mirch" or prints a
 * binomial; the formulary says "Marica"; nothing anywhere connects the two.
 *
 * So anyone trying to check a product against the standard it claims has to be able to read
 * Sanskrit pharmacognosy, and the questions this answers, "what is Marica", "what does Nagara mean
 * in a formulary entry", are precisely-named questions with no good answer published anywhere. A
 * survey of fifteen Ayurvedic topic queries in October 2026 found this site cited on none of them
 * and government AYUSH sources cited on none either: the official standard-setter is invisible,
 * and this is the piece of the standard that is missing in machine-readable form.
 *
 * TWO FILES, TWO SHAPES.
 *
 * afi-crosswalk.json keeps both views: the vocabulary, one record per distinct formulary spelling
 * with what it resolves to, and the rows, one record per ingredient row of each entry. That is the
 * shape for a program.
 *
 * afi-crosswalk.csv is ONE ROW PER INGREDIENT ROW, 1,973 of them, because that is the join anyone
 * doing this work needs: formulation, entry number, the name as printed, the gloss the book printed
 * beside it, what it resolves to, the binomial, and on what basis. Flattening to one row per name
 * would lose which entry each spelling appeared in, which is the whole point for a checker.
 *
 * WHAT IT REFUSES TO DO, carried from the build: an unresolved name publishes as unresolved rather
 * than guessed, a name used for more than one drug publishes as ambiguous rather than collapsed,
 * and a resolution made on an approximate name match is flagged as the weaker evidence it is. All
 * three are in the data; none is smoothed over for presentation.
 *
 *   node scripts/crosswalk-dataset.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry-run');
const SRC = path.join('src', 'data', 'afi-crosswalk.json');
const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const SITE = 'https://nighantu.ageayurveda.com';

const rows = data.rows ?? [];
const vocab = data.vocabulary ?? [];
const s = data.summary ?? {};

console.log('ingredient rows            ', s.ingredientRows);
console.log('  resolved                 ', s.rowsResolved, `(${Math.round((s.rowsResolved / s.ingredientRows) * 100)}%)`);
console.log('  of the plant rows        ', s.plantRowsResolved, 'of', s.plantRows, `(${Math.round((s.plantRowsResolved / s.plantRows) * 100)}%)`);
console.log('distinct formulary names   ', s.distinctNames);
console.log('  resolved                 ', s.namesResolved);
console.log('  ambiguous                ', s.namesAmbiguous, '(used for more than one drug, published as such)');
console.log('  unresolved               ', s.namesUnresolved, '(published as unresolved, never guessed)');

/**
 * The gate: a resolution must carry a basis, and an unresolved row must not carry a monograph.
 *
 * Both directions matter. A row with a monograph and no basis is an assertion with its evidence
 * stripped, and a row marked unresolved that still names a monograph would publish a guess under a
 * label saying it is not one.
 */
const noBasis = rows.filter((r) => r.monograph && (!r.basis || r.basis === 'unresolved'));
const contradictory = rows.filter((r) => !r.monograph && r.basis && r.basis !== 'unresolved');
if (noBasis.length || contradictory.length) {
  console.error('');
  console.error('REFUSING TO WRITE:');
  for (const r of noBasis.slice(0, 5)) console.error(`  ${r.formulation} ${r.name}: resolved with no basis`);
  for (const r of contradictory.slice(0, 5)) console.error(`  ${r.formulation} ${r.name}: unresolved but carries a basis`);
  process.exit(1);
}
console.log('basis check                 clean: every resolution states how it was made');

if (DRY) {
  console.log('\nDry run. Nothing written.');
  process.exit(0);
}

fs.writeFileSync(path.join('public', 'afi-crosswalk.json'), `${JSON.stringify({
  name: data.name,
  description: data.description,
  license: 'https://creativecommons.org/licenses/by/4.0/',
  licenceNote: 'CC BY 4.0. The resolutions, the substance classification and the basis statements '
    + 'are this project\'s own work. The ingredient names and the glosses beside them are the '
    + 'Ayurvedic Formulary of India\'s own text, transcribed here and cited to part and entry '
    + 'number; the botanical identities come from this project\'s GBIF-resolved monographs. An '
    + 'identity this project could not establish is published as unresolved. A name the formulary '
    + 'uses for more than one drug is published as ambiguous with every resolution it takes, '
    + 'rather than collapsed to one.',
  updatedAt: new Date().toLocaleDateString('en-CA'),
  basisVocabulary: data.basisVocabulary,
  summary: s,
  page: '/crosswalk/',
  vocabulary: vocab,
  rows,
}, null, 2)}\n`);

const cell = (v) => (v == null || v === '' ? '' : `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`);
const csv = [[
  'formulation', 'formulary_entry', 'ingredient_number', 'name_as_printed', 'gloss_as_printed',
  'substance_class', 'resolves_to_monograph', 'matched_on', 'botanical_name', 'family',
  'basis', 'exact_name_match', 'formulation_page', 'monograph_page',
].join(',')];
for (const r of rows) {
  csv.push([
    r.formulation, r.printedIn, r.n, r.name, r.printedGloss,
    r.substanceClass, r.monograph ? r.monograph.replace(/^\/|\/$/g, '') : '', r.matchedOn,
    r.binomial, r.family, r.basis, r.exactName === true ? 'yes' : (r.exactName === false ? 'no' : ''),
    `${SITE}/formulation/${r.formulation}/`, r.monograph ? `${SITE}${r.monograph}` : '',
  ].map(cell).join(','));
}
fs.writeFileSync(path.join('public', 'afi-crosswalk.csv'), `${csv.join('\n')}\n`);

console.log(`\nwrote public/afi-crosswalk.json and public/afi-crosswalk.csv (${csv.length - 1} ingredient rows)`);
