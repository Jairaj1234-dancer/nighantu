import { check, validateIdentifiers } from '../lib/identifiers.mjs';

const cases = [
  ['real GBIF key',            'gbifKey',   '2928840', true],
  ['GBIF key with leading 0',  'gbifKey',   '0928840', false],
  ['GBIF key that is a float', 'gbifKey',   '2928.84', false],
  ['GBIF key that is text',    'gbifKey',   'Withania', false],
  ['real PubChem CID',         'cid',       '5280343', true],
  ['negative CID',             'cid',       '-5280343', false],
  ['real NCBI taxid',          'ncbiTaxid', '126910', true],
  ['real Wikidata QID',        'wikidata',  'Q852660', true],
  ['QID without the Q',        'wikidata',  '852660', false],
  ['QID with lowercase q',     'wikidata',  'q852660', false],
  ['real InChIKey',            'inchikey',  'REFJWTPEDVJJIY-UHFFFAOYSA-N', true],
  ['InChIKey truncated',       'inchikey',  'REFJWTPEDVJJIY-UHFFFAOYSA', false],
  ['InChIKey lowercased',      'inchikey',  'refjwtpedvjjiy-uhfffaoysa-n', false],
  ['InChIKey wrong block size','inchikey',  'REFJWTPEDVJJI-UHFFFAOYSA-N', false],
  ['real formula',             'formula',   'C15H10O7', true],
  ['formula with a charge',    'formula',   'C6H5O+', true],
  ['formula with prose',       'formula',   'varies by batch', false],
  ['formula lowercased',       'formula',   'c15h10o7', false],
];

let fails = 0;
for (const [name, kind, value, want] of cases) {
  const got = check(kind, value);
  if (got !== want) { console.log(`  FAIL  ${name}: ${kind}("${value}") = ${got}, wanted ${want}`); fails++; }
  else console.log(`  ok    ${name}`);
}

// Dataset-level: gaps are fine, malformed values are not.
const set = [
  ['gaps are allowed',        [{ slug: 'a', gbifKey: '', wikidata: undefined }], true],
  ['one bad value is caught', [{ slug: 'a', gbifKey: '2928840' }, { slug: 'b', gbifKey: 'nope' }], false],
];
for (const [name, recs, want] of set) {
  const r = validateIdentifiers(recs, { gbifKey: 'gbifKey', wikidata: 'wikidata' });
  if (r.ok !== want) { console.log(`  FAIL  ${name}`); fails++; }
  else console.log(`  ok    ${name}`);
}

console.log(fails ? `\n${fails} FAILED` : `\nall ${cases.length + set.length} passed`);
process.exit(fails ? 1 : 0);
