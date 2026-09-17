/**
 * Negative tests for the answer-block rules. Every one injects the fault that was actually
 * found on the site and expects it to be caught, plus the legitimate sentences that must
 * survive, because a rule that strips honest reference text is how a gate gets disabled.
 */
import { isDose, isDiseaseClaim, answerViolations } from '../lib/answer-safety.mjs';

let fails = 0;
const ok = (name, cond) => { if (cond) console.log(`  ok    ${name}`); else { console.log(`  FAIL  ${name}`); fails += 1; } };

// --- doses, all taken from blocks that were live -----------------------------
ok('the composed dose sentence is caught',
  isDose('Usual dose: 3-6 g powder twice daily.'));
ok('the formulation phrasing is caught',
  isDose('The usual dose is 15-30 ml twice daily after meals.'));
ok('a scraped Standard Dosage run is caught',
  isDose('Standard Dosage: 10-20ml fresh juice twice daily; 3-6g powder.'));
ok('a Dosage Forms run is caught',
  isDose('Dosage Forms: Swarasa (fresh juice), Churna (powder), Kashayam (decoction).'));
ok('a milligram dose with a frequency is caught',
  isDose('125-250 mg with honey twice daily.'));

ok('a plant part with a weight is not a dose',
  !isDose('The heart wood is collected in pieces of 3 to 5 cm.'));
ok('a formulary composition row is not a dose',
  !isDose('Abhaya (haritaki) 4.800 kg.'));
ok('prose about preparation is not a dose',
  !isDose('The decoction is reduced to a quarter of its volume before use.'));

// --- disease claims ----------------------------------------------------------
ok('the bhasma cancer sentence is caught',
  isDiseaseClaim('Abhraka Bhasma exhibits dose-dependent cytotoxicity and apoptosis induction in breast cancer cell lines.'));
ok('a cure claim is caught',
  isDiseaseClaim('It cures diabetes.'));
ok('a management claim is caught',
  isDiseaseClaim('Used for the management of rheumatoid arthritis.'));
ok('an efficacy claim is caught',
  isDiseaseClaim('Effective against eczema in clinical use.'));

// These must survive: naming a class, or a condition, is not claiming an effect on it.
ok('a pharmacological class is not a claim',
  !isDiseaseClaim('Adaptogenic agents are botanicals studied for stress physiology.'));
ok('a disease named without an effect is not a claim',
  !isDiseaseClaim('Madhumeha is a classical term discussed in the Prameha chapter.'));
ok('an effect word without a disease is not a claim',
  !isDiseaseClaim('Shirodhara is described as calming and is widely used in Kerala practice.'));
ok('a classification crosswalk line is not a claim',
  !isDiseaseClaim('WHO lists amlapittam against code SM39.'));

// --- the audit helper --------------------------------------------------------
const both = answerViolations('Haridra is a plant used in Ayurveda. Usual dose: 3-6 g twice daily. It treats arthritis.');
ok('both faults are reported', both.length === 2);
ok('the dose is labelled as a dose', both[0].kind === 'dose');
ok('the claim is labelled as a claim', both[1].kind === 'claim');
ok('a clean block reports nothing',
  answerViolations('Simsapa (Dalbergia sissoo) is a plant used in Ayurveda, from the Leguminosae family.').length === 0);

console.log(fails === 0 ? '\nanswer-safety: all pass' : `\nanswer-safety: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
