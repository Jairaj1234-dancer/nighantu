import { ungroundedNumbers, unknownDravyas, unlistedClaims } from '../lib/grounding.mjs';

const RECORD = 'Warm sneha to body temperature. Sit 15-20 min; warm bath after. '
  + 'Dose 3-6 g twice daily. Course runs 7 days. Oil at 40 C.';

let fails = 0;
const ok = (name, cond) => { if (cond) console.log(`  ok    ${name}`); else { console.log(`  FAIL  ${name}`); fails++; } };

// --- numbers ---------------------------------------------------------------
ok('a quantity present in the record passes',
  ungroundedNumbers('Sit for 15-20 min and take 3-6 g.', RECORD).length === 0);
ok('an invented duration is caught',
  ungroundedNumbers('Continue for 45 minutes.', RECORD).includes('45 minutes'));
ok('an invented temperature is caught',
  ungroundedNumbers('Heat the oil to 60 C.', RECORD).includes('60 C'));
ok('an invented dose is caught',
  ungroundedNumbers('Take 500 mg at night.', RECORD).some((x) => x.startsWith('500')));
ok('a range endpoint written alone still passes',
  ungroundedNumbers('Around 20 min is usual.', RECORD).length === 0);
ok('small ordinals are not flagged',
  ungroundedNumbers('There are 3 stages and 2 oils.', RECORD).length === 0);
ok('a course length from the record passes',
  ungroundedNumbers('The course runs 7 days.', RECORD).length === 0);

// --- dravyas ---------------------------------------------------------------
const KNOWN = new Set(['tila', 'bala', 'haridra', 'ashwagandha', 'brahmi']);
ok('a known dravya passes', unknownDravyas(['Bala'], KNOWN).length === 0);
ok('diacritics do not cause a false flag', unknownDravyas(['Haridrā'], KNOWN).length === 0);
ok('a compound name matching a known drug passes', unknownDravyas(['Tila taila'], KNOWN).length === 0);
ok('an invented plant is caught', unknownDravyas(['Nonexistentia grandiflora'], KNOWN).length === 1);
ok('several at once are all caught',
  unknownDravyas(['Bala', 'Fakeus plantus', 'Madeupia'], KNOWN).length === 2);

// --- grounding coverage ----------------------------------------------------
const BODY = '## What it is\n\nThis is a long sentence describing the procedure in enough '
  + 'detail to count as a substantive claim about it.\n\nAnother long sentence that was '
  + 'never declared in the grounding list at all and should therefore be flagged.';
const GROUNDING = [{ claim: 'This is a long sentence describing the procedure in enough detail', source: 'record' }];
ok('a declared claim is not flagged', !unlistedClaims(BODY, GROUNDING).some((s) => s.startsWith('This is a long')));
ok('an undeclared claim is flagged', unlistedClaims(BODY, GROUNDING).some((s) => s.startsWith('Another long')));
ok('headings are not treated as claims', !unlistedClaims('## What it is', []).length);

console.log(fails ? `\n${fails} FAILED` : '\nall 15 passed');
process.exit(fails ? 1 : 0);
