import { validateRecord, emptyRecord } from '../lib/safety.mjs';

const good = {
  ...emptyRecord('ashwagandha', 'Ashwagandha'),
  botanical: 'Withania somnifera',
  contraindications: [{ condition: 'hyperthyroidism', severity: 'moderate', scope: 'preparation-specific', sourceIds: ['s1'] }],
  pregnancy: { status: 'avoid', note: 'Traditionally withheld.', scope: 'preparation-specific', sourceIds: ['s1'] },
  lactation: { status: 'insufficient-data', note: '', scope: 'preparation-specific' },
  sources: [{ id: 's1', url: 'https://www.ncbi.nlm.nih.gov/books/NBK548536/', title: 'LiverTox', accessed: '2026-09-10' }],
};

const cases = [
  ['valid record passes', good, true],
  ['unlisted source rejected',
    { ...good, sources: [{ id: 's1', url: 'https://herbshop.example/a', accessed: '2026-09-10' }] }, false],
  ['dangling sourceId rejected',
    { ...good, contraindications: [{ condition: 'x', severity: 'minor', sourceIds: ['nope'] }] }, false],
  ['bad severity rejected',
    { ...good, contraindications: [{ condition: 'x', severity: 'catastrophic', scope: 'preparation-specific', sourceIds: ['s1'] }] }, false],
  ['bad pregnancy status rejected',
    { ...good, pregnancy: { status: 'probably fine', scope: 'preparation-specific', sourceIds: ['s1'] } }, false],
  ['uncited non-insufficient status rejected',
    { ...good, pregnancy: { status: 'avoid', scope: 'preparation-specific', sourceIds: [] } }, false],
  ['contraindication with no source rejected',
    { ...good, contraindications: [{ condition: 'x', severity: 'minor', scope: 'preparation-specific', sourceIds: [] }] }, false],
  ['therapeutic claim rejected',
    { ...good, contraindications: [{ condition: 'treats anxiety', severity: 'minor', scope: 'preparation-specific', sourceIds: ['s1'] }] }, false],
  ['"no side effects" rejected',
    { ...good, pregnancy: { status: 'no-known-concern', note: 'no side effects', scope: 'preparation-specific', sourceIds: ['s1'] } }, false],
  ['silent empty record rejected', emptyRecord('x', 'X'), false],
  ['insufficientData with statements rejected',
    { ...good, insufficientData: true, insufficientReason: 'none found' }, false],
  ['insufficientData without reason rejected',
    { ...emptyRecord('x', 'X'), insufficientData: true }, false],
  ['honest insufficientData passes',
    { ...emptyRecord('x', 'X'), insufficientData: true, insufficientReason: 'No WHO, LiverTox, NCCIH or MSK entry exists and PubMed returns no safety literature.' }, true],
  ['bhasma without heavyMetals rejected', good, false, { subcategory: 'Mineral-Metal-Preparations' }],
  ['insufficientData + class-level statements passes',
    { ...emptyRecord('x', 'X'), insufficientData: true,
      insufficientReason: 'No source characterises this preparation; what follows is class-level.',
      contraindications: [{ condition: 'Children', severity: 'major', scope: 'class-level', sourceIds: ['s1'] }],
      sources: [{ id: 's1', url: 'https://www.fda.gov/x', title: 'FDA', accessed: '2026-09-11' }] }, true],
  ['insufficientData + a preparation-specific statement rejected',
    { ...emptyRecord('x', 'X'), insufficientData: true,
      insufficientReason: 'No source characterises this preparation.',
      contraindications: [{ condition: 'Children', severity: 'major', scope: 'preparation-specific', sourceIds: ['s1'] }],
      sources: [{ id: 's1', url: 'https://www.fda.gov/x', title: 'FDA', accessed: '2026-09-11' }] }, false],
  ['insufficientData + an unscoped statement rejected',
    { ...emptyRecord('x', 'X'), insufficientData: true,
      insufficientReason: 'No source characterises this preparation.',
      contraindications: [{ condition: 'Children', severity: 'major', sourceIds: ['s1'] }],
      sources: [{ id: 's1', url: 'https://www.fda.gov/x', title: 'FDA', accessed: '2026-09-11' }] }, false],
  ['missing scope rejected',
    { ...good, contraindications: [{ condition: 'x', severity: 'minor', sourceIds: ['s1'] }] }, false],
  ['bad scope value rejected',
    { ...good, contraindications: [{ condition: 'x', severity: 'minor', scope: 'vibes', sourceIds: ['s1'] }] }, false],
  ['bhasma with heavyMetals passes',
    { ...good, heavyMetals: { text: 'Mica-based; incineration reduces free metal content.', scope: 'preparation-specific', sourceIds: ['s1'] } },
    true, { subcategory: 'Mineral-Metal-Preparations' }],
];

let fails = 0;
for (const [name, rec, wantOk, page = {}] of cases) {
  const r = validateRecord(rec, page);
  if (r.ok !== wantOk) { console.log(`  FAIL  ${name}  (ok=${r.ok}, wanted ${wantOk})  ${r.errors.join('; ')}`); fails++; }
  else console.log(`  ok    ${name}`);
}
console.log(fails ? `\n${fails} FAILED` : `\nall ${cases.length} passed`);
process.exit(fails ? 1 : 0);
