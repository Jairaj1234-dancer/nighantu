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

ok('discussing the dosage form as a category is not a dose',
  !isDose('It binds the ingredients and fixes the dosage form.'));
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

// --- leaked serialisation ----------------------------------------------------
/**
 * Four pages carried a raw Python dict in the answer block, and therefore in the meta description:
 * vatsanabha (aconite), bhanga (cannabis), jayapala (croton), ahiphena (opium). The four most
 * hazardous substances in the corpus.
 *
 * isDiseaseClaim caught NONE of them, and the reason is worth pinning: it is a conjunction of a
 * disease word and an efficacy word, and the disease list has no "pain", "fever", "constipation"
 * or "spasticity". So "clinical trials confirm cannabis/cannabinoids effective for chronic pain"
 * has the efficacy word and no disease word, and passed. The conjunction is the right design, so
 * the fix is orthogonal rather than a wider word list.
 */
ok('a leaked python dict is caught',
  answerViolations("Bhanga is a plant drug. {'use': 'Analgesic', 'validation': 'trials confirm it.'}")
    .some((v) => v.kind === 'structure'));

ok('a leaked list of dicts is caught',
  answerViolations("X is a plant drug. [{'type': 'Poisoning case', 'detail': 'y'}]")
    .some((v) => v.kind === 'structure'));

ok('THE CLAIM THAT SLIPPED THROUGH: no disease word, so the conjunction missed it',
  !isDiseaseClaim('Multiple clinical trials confirm cannabis/cannabinoids effective for chronic pain.'));

ok('but the structure check catches the sentence it arrived in',
  answerViolations("{'validation': 'trials confirm cannabinoids effective for chronic pain'}")
    .some((v) => v.kind === 'structure'));

// A markdown link starts with "[" and must NOT be read as a leaked structure. The first version of
// the check matched any sentence beginning with a bracket and flagged 61 legitimate citation links,
// a 94% false-positive rate: a check that cries wolf on prose is one people learn to ignore.
ok('a markdown citation link is not a leaked structure',
  answerViolations('Amla is a plant drug. [A review of Phyllanthus emblica](https://pubmed.ncbi.nlm.nih.gov/1/).')
    .length === 0);

console.log(fails === 0 ? '\nanswer-safety: all pass' : `\nanswer-safety: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
