#!/usr/bin/env node
/**
 * Take the measured figures out of ten answer blocks, where they are the meta description.
 *
 * WHY THE GATE MISSED THESE. lib/answer-safety.mjs has barred a dose from the answer block since
 * the 492-page sweep, and its quantity rule requires a frequency word within 40 characters of the
 * figure: "3-6 g powder twice daily". These answers state a figure with no frequency word at all,
 * so the rule had nothing to anchor on and they passed every build.
 *
 * TEN, AND NOT ALL OF THEM ARE DOSES. The first survey of this found nine, using a narrower
 * quantity pattern that knew mg, g and ml and not drops or micrograms; widening it to what a
 * reference work actually prints found eleven, of which ten are in collections that offer a
 * substance. Of those ten, five state a dose to take, two state a toxicology figure
 * (herb/godanti-bhasma's "LD50 in Class IV (>2000 mcg/kg)", herb/karpura-camphor's toxicity
 * threshold), one states a physical property (herb/kalmegh's "limited aqueous solubility
 * (50 μg/mL)"), one states a clinical outcome, and one states an etymology. Calling all ten doses
 * would be wrong in the same way audit.mjs was wrong to report every non-dose violation as a
 * disease claim, so the gate reports `quantity` and names the three possibilities.
 *
 * On herb/camphor the omission makes it worse rather than better. Live, the meta description reads:
 *
 *   Camphor is an isolated compound rather than a whole plant drug. INTERNAL: 60-125mg purified
 *   camphor (Ayurvedic Pharmacopoeia); CAUTION: internal use only under expert supervision—toxic
 *   at >500mg doses. Bioavailability: Excellent absorption via all routes ...
 *
 * An internal dose for a substance the same sentence calls toxic above 500mg, offered by a company
 * that sells Ayurvedic products, with the qualifier that makes it safe to read sitting past the
 * 155 characters a search result displays. The caution does not travel with the number.
 *
 * Two of the nine are worse than a dose. herb/dhatri-loha opens its description with "Iron
 * deficiency anemia (Pandu Roga) - validated in multiple clinical trials showing significant
 * hemoglobin improvement (1.5-2 g/dL rise over 8 weeks)", which is a disease claim with a
 * quantified clinical outcome; isDiseaseClaim missed it because "anemia" is not in DISEASE_WORD and
 * "validated" is not in EFFICACY_WORD. herb/godanti-bhasma leads with "SAFE: LD50 in Class IV
 * (>2000 mcg/kg) indicating low acute toxicity", which asserts the safety of a mineral preparation
 * in a search result on the authority of a label its own body applied.
 *
 * ONE IS LEFT ALONE. /practice/matra-basti/ states "The record gives 30 to 60 ml of warm medicated
 * oil, given by a therapist or, once taught, self-administered." The quantity is the definition of
 * the procedure, the sentence attributes it to the record and names who administers it, and the
 * page offers a practice rather than a substance to buy. The house rule's own reason is that a dose
 * from a company that sells the thing reads as prescribing; that does not apply, so the gate is
 * widened by COLLECTION rather than by an exemption for this page, and this script leaves it alone.
 *
 * NOTHING IS LOST. Every figure removed here is checked to still exist elsewhere in its own page
 * before the removal is allowed: in the body for seven of them, and in the `whoStatus` frontmatter
 * field for kalonji, which renders on the page as the WHO/Pharmacopoeia status. That check is not
 * decoration, it is the condition: this script refuses to remove a figure it cannot find a second
 * home for.
 *
 * THREE SHAPES OF REMOVAL, in order of how much survives. Where the figure is its own sentence the
 * answer is cut at that sentence, as the citation pass cuts at the bibliography. Where it is a
 * clause inside a sentence worth keeping, only the clause goes: kalonji's "Listed in the
 * Pharmacopoeia of India at recommended dose of 0.5-4 g seed powder for digestive and carminative
 * purposes" becomes "Listed in the Pharmacopoeia of India", which is the part a searcher is served
 * by. And on one page the figure is the name's own meaning, which is rewritten by hand and declared
 * in REWRITES below rather than inferred.
 *
 *   node scripts/fix-answer-doses.mjs            report what would change
 *   node scripts/fix-answer-doses.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk } from './lib.mjs';
import { answerViolations, QUANTITY, DOSED_KINDS } from './lib/answer-safety.mjs';

const WRITE = process.argv.includes('--write');

/**
 * A dose-introducing clause, so the sentence around it can be kept.
 *
 * `(?:[^.]|\.\d)*` and not `[^.]*`: a decimal point is a period. The first version stopped at the
 * dot inside "0.5-4 g", so it removed "at recommended dose of 0" from kalonji and left ".5-4 g seed
 * powder for digestive and carminative purposes" behind. The script then refused the page because a
 * quantity survived, which is the refusal doing its job on its author.
 */
const DOSE_CLAUSE = /\s*(?:,|;)?\s*\bat (?:a |the )?recommended dose of\b(?:[^.]|\.\d)*/i;

/**
 * ONE DECLARED REWRITE, because on this page the figure is the name.
 *
 * formulation/shadbindu-taila ends "The name 'Shadbindu' means 'six drops', indicating the
 * classical dose of 6 drops per nostril." The quantity is the etymology: shad is six, bindu is a
 * drop. Cutting the sentence would throw away the best thing the answer says, and keeping it whole
 * leaves a nasal dosing instruction in a search result for an oil this company sells. So the
 * meaning stays and the instruction goes.
 *
 * This is a judgement about one page, not a rule derived from the data, and it is written out here
 * rather than inferred so it can be read and disagreed with.
 */
const REWRITES = {
  'formulation/shadbindu-taila': "Shadbindu Taila is a classical Ayurvedic taila, a medicated oil. "
    + 'Listed in Ayurvedic Formulary of India (AFI). Ashtanga Hridayam (Sutrasthana); also '
    + "referenced in Sharangadhara Samhita. The name 'Shadbindu' means 'six drops'.",
};

/** audit.mjs fails any answer block under 10 words, so the floor is its floor, not a new one. */
const words = (s) => (s.match(/\S+/g) || []).length;

const changed = [];
const refused = [];
const left = [];

for (const rel of walk('content')) {
  const kind = rel.split(path.sep)[0];
  const file = path.join('content', rel);
  const raw = fs.readFileSync(file, 'utf8');
  const m = /^answer:\s*"(.*?)"\s*$/m.exec(raw);
  if (!m) continue;

  const qi = m[1].search(QUANTITY);
  if (qi === -1) continue;
  const key = `${kind}/${path.basename(rel, '.md')}`;

  if (!DOSED_KINDS.has(kind)) {
    left.push([key, `${kind}/ is not a collection that offers a substance; the quantity stays`]);
    continue;
  }

  const figure = QUANTITY.exec(m[1])[0];
  // Three ways to lose a figure, in order of how much of the sentence survives.
  const clause = DOSE_CLAUSE.exec(m[1]);
  const inClause = clause && clause.index < qi && clause.index + clause[0].length > qi;
  const sentenceStart = m[1].lastIndexOf('. ', qi);

  let next;
  let how;
  if (REWRITES[key]) {
    next = REWRITES[key];
    how = "rewritten by hand: on this page the figure is the name's meaning";
  } else if (inClause) {
    next = `${m[1].slice(0, clause.index)}.${m[1].slice(clause.index + clause[0].length)}`;
    how = 'dose clause removed, the sentence around it kept';
  } else {
    next = sentenceStart === -1 ? '' : m[1].slice(0, sentenceStart + 1);
    how = 'cut at the sentence stating the figure';
  }

  next = next.replace(/\s+/g, ' ').trim().replace(/[\s,;:]+$/, '').replace(/\.{2,}$/, '.');
  if (next && !/[.!?]$/.test(next)) next += '.';

  /**
   * REFUSE RATHER THAN PUBLISH A FAULT, and refuse rather than DESTROY one. The second check is the
   * important one: a figure may only leave the answer block if the page still carries it somewhere
   * else, so this is a move and not a deletion.
   */
  const elsewhere = raw.replace(m[0], '').includes(figure);
  if (!elsewhere) { refused.push([key, `"${figure}" appears nowhere else on the page: removing it would lose the figure, not relocate it`]); continue; }
  if (QUANTITY.test(next)) { refused.push([key, 'a quantity survives the removal']); continue; }
  if (next.includes('"')) { refused.push([key, 'quote would break frontmatter']); continue; }
  if (words(next) < 10) { refused.push([key, `only ${words(next)} words survive and audit.mjs fails under 10`]); continue; }
  const v = answerViolations(next, { kind });
  if (v.length) { refused.push([key, `violates after removal: ${JSON.stringify(v)}`]); continue; }

  changed.push({ key, before: m[1], after: next, how, figure });
  if (WRITE) fs.writeFileSync(file, raw.replace(m[0], `answer: "${next}"`));
}

console.log(`${changed.length} answers cleaned, ${left.length} deliberately left, ${refused.length} refused.\n`);
for (const c of changed) {
  console.log(`  ${c.key}   (${c.how}; "${c.figure}" kept elsewhere on the page)`);
  console.log(`    was: ${c.before.slice(0, 190)}`);
  console.log(`    now: ${c.after}`);
  console.log(`    ${words(c.after)} words`);
  console.log();
}
if (left.length) {
  console.log('LEFT ALONE, on purpose:');
  for (const [k, why] of left) console.log(`   ${k}  ${why}`);
}
if (refused.length) {
  console.log('\nREFUSED, nothing written for these:');
  for (const [k, why] of refused) console.log(`   ${k}  ${why}`);
}
if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
