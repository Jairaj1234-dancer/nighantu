#!/usr/bin/env node
/**
 * Take the vault field labels out of 40 answer blocks, where they are the meta description.
 *
 * WHAT IS LIVE RIGHT NOW. /formulation/ajamoda-arka/ tells Google:
 *
 *   Ajamoda Arka is a classical Ayurvedic arka, a herbal distillate. Nano-dispersed volatile oils
 *   in aqueous medium enhance bioavailability compared to crude drug. Optimal Timing: After meals
 *   (Bhojana-uttara), twice daily Shelf Life: 1 year from date of manufacture as per ASU guidelines
 *   for Arka preparations Storage: Store in well-closed amber glass bottles in a cool place.
 *
 * Three field names and their values, run together with no sentence boundary between them, in the
 * sentence a searcher is shown. "Store in well-closed amber glass bottles in a cool place" is
 * packaging copy; it tells a reader nothing about what the drug is. "After meals, twice daily" is
 * an administration instruction, and it is one isDose cannot see, because its figure rule needs a
 * quantity AND a frequency and this has only the frequency.
 *
 * WHY THE FIELDS NEVER GOT SPLIT APART. They are concatenated without punctuation, so every
 * sentence-based filter in answer.mjs saw "...twice daily Shelf Life: 1 year from date of
 * manufacture..." as one long sentence and judged it whole. The jamming is what made it invisible.
 *
 * TWO GROUPS OF LABEL, BECAUSE THE VALUE IS NOT ALWAYS METADATA.
 *
 * DROPPED. Bioavailability, Optimal Timing, Shelf Life, Storage, Keywords, Analytical Methods,
 * Latex and the local-application instruction. These are manufacturing, packaging and
 * pharmacokinetic data. Every one of them stays on its page, in the body, under a heading that
 * frames it; none of them belongs in a search result.
 *
 * KEPT, by hand. Note, CAUTION and INTERNAL USE carry the thing a reader most needs, so cutting at
 * the label would throw away the best sentence in the block:
 *
 *   herb/vasaka       "Vasa and Vasaka are synonymous names for Adhatoda vasica"
 *   herb/morning-glory "Some species contain lysergic acid amide (LSA)"
 *   herb/kakamachi    "Ripe black berries only (unripe green berries contain higher solanine)"
 *   herb/arka         "only Shodhita (purified) material under physician supervision"
 *   herb/puga         "restricted dose due to arecoline content"
 *
 * Those five are written out in REWRITES below. They are judgements about five pages, not a rule
 * derived from the data, so they are stated rather than inferred and can be read and disagreed
 * with. The same reason shadbindu-taila's etymology is written out in fix-answer-doses.mjs.
 *
 * ONE NAME IS DROPPED RATHER THAN REPAIRED. kakamachi's answer called it "Dhvanksamac i", which
 * src/data/names.json sources to the "Ayurvedic Pharmacopoeia of India (column alignment
 * reconstructed)" columns: a split-word OCR artifact. The obvious join to "Dhvanksamaci" is almost
 * certainly right, dhvanksa and kaka both mean crow, but correcting a name is a data fix needing
 * its own grounding, so the rewrite below quotes the page's other synonyms and leaves that one out.
 * Asserting nothing costs a reader nothing here. 232 of the 1,155 entries in names.json are sourced
 * only to those reconstructed columns and three of them reach an answer block damaged.
 *
 * WHAT THIS DOES NOT FIX, and it is visible in the output. 14 of the cleaned answers now end on a
 * terse fragment from a different leaked field: "Pungent herb—start with lower doses", "Limited
 * modern dosage data - follow classical text guidelines", "Traditional dosing per Vaidya guidance".
 * Those have lost their label already, so they are not reachable by this pass, and they divide into
 * real warnings worth keeping and filler worth removing. That is its own pass.
 *
 *   node scripts/fix-answer-fields.mjs            report what would change
 *   node scripts/fix-answer-fields.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk } from './lib.mjs';
import { answerViolations } from './lib/answer-safety.mjs';

const WRITE = process.argv.includes('--write');

/** Field labels whose value is metadata. The answer ends where the first one starts. */
const DROP = [
  'Bioavailability', 'Optimal Timing', 'Shelf Life', 'Churna Storage', 'Storage',
  'Keywords', 'Analytical Methods', 'Methods', 'Latex', 'For local application',
];
const DROP_RX = new RegExp(`\\s*\\b(${DROP.join('|')})\\s*:`);

/**
 * The five pages whose Note, CAUTION or INTERNAL USE value is worth more than the label costs.
 * Each keeps its own words; nothing here is new information about the substance.
 */
const REWRITES = {
  'herb/arka': 'Arka (Calotropis procera) is a plant drug, also called Arkah, Bhanu and Ravi. '
    + 'Internal use is confined to Shodhita (purified) material and requires physician supervision.',
  'herb/kakamachi': 'Kakamachi (Solanum nigrum) is a plant drug, also called Kakamaci and Makoya. '
    + 'Only the ripe black berries are used: the unripe green berries carry more solanine.',
  // The first draft of this one ended "so identification governs whether it is the plant intended",
  // which is a clause of mine and not the page's, in a file whose rule is that these rewrites add
  // nothing. The page's own sentence clears the word floor on its own, so the clause is gone.
  'herb/morning-glory': 'Morning Glory is a substance used in the Ayurvedic materia medica. '
    + 'Some species contain lysergic acid amide (LSA).',
  'herb/puga': 'Puga (Areca catechu) is a plant drug, also called Ghonta, Guvakah and Khapura. '
    + 'Its dose is restricted because of its arecoline content.',
  'herb/vasaka': 'Vasaka (Justicia adhatoda) is a plant drug, also called Vasakah and Adusa. '
    + 'Vasa and Vasaka are synonymous names for Adhatoda vasica in different Ayurvedic traditions.',
};

/** audit.mjs fails any answer block under 10 words, so that is the floor here too. */
const words = (s) => (s.match(/\S+/g) || []).length;

const changed = [];
const refused = [];

for (const rel of walk('content')) {
  const file = path.join('content', rel);
  const raw = fs.readFileSync(file, 'utf8');
  const m = /^answer:\s*"(.*?)"\s*$/m.exec(raw);
  if (!m) continue;

  const key = `${rel.split(path.sep)[0]}/${path.basename(rel, '.md')}`;
  const at = m[1].search(DROP_RX);
  if (at === -1 && !REWRITES[key]) continue;

  let next;
  let how;
  if (REWRITES[key]) {
    next = REWRITES[key];
    how = 'rewritten by hand: the field value is what the reader needs';
  } else {
    // Cut AT the label, not at the sentence boundary before it. The fields are jammed together
    // without punctuation, so the nearest preceding period can be two fields back and cutting
    // there would discard a field value this pass had decided to keep.
    next = m[1].slice(0, at);
    how = 'cut at the first metadata field label';
  }

  next = next.replace(/\s+/g, ' ').trim().replace(/[\s,;:]+$/, '');
  if (next && !/[.!?]$/.test(next)) next += '.';

  // REFUSE RATHER THAN PUBLISH A FAULT.
  if (DROP_RX.test(next)) { refused.push([key, 'a metadata field survives the cut']); continue; }
  if (next.includes('"')) { refused.push([key, 'quote would break frontmatter']); continue; }
  if (words(next) < 10) { refused.push([key, `only ${words(next)} words survive and audit.mjs fails under 10`]); continue; }
  const v = answerViolations(next, { kind: rel.split(path.sep)[0] });
  if (v.length) { refused.push([key, `violates after the cut: ${JSON.stringify(v)}`]); continue; }

  changed.push({ key, before: m[1], after: next, how });
  if (WRITE) fs.writeFileSync(file, raw.replace(m[0], `answer: "${next}"`));
}

const lens = changed.map((c) => words(c.after)).sort((a, b) => a - b);
console.log(`${changed.length} answers cleaned, ${refused.length} refused.`);
if (lens.length) console.log(`surviving answers are ${lens[0]} to ${lens[lens.length - 1]} words, median ${lens[Math.floor(lens.length / 2)]}.\n`);

for (const c of changed) {
  console.log(`  ${c.key}   (${c.how})`);
  console.log(`    was: ${c.before.slice(0, 180)}`);
  console.log(`    now: ${c.after}`);
  console.log();
}

// The fragments this pass cannot reach, named rather than left for someone to find.
const FRAGMENT = /\b(lower doses|low-dose|dosage data|dosage standardization|dosing per|higher doses|as directed)\b/i;
const stranded = changed.filter((c) => FRAGMENT.test(c.after));
if (stranded.length) {
  console.log(`${stranded.length} cleaned answers still end on an unlabelled dosing fragment, which this pass cannot reach:`);
  for (const c of stranded) console.log(`   ${c.key.padEnd(32)} ${c.after.slice(-72)}`);
}

if (refused.length) {
  console.log('\nREFUSED, nothing written for these:');
  for (const [k, why] of refused) console.log(`   ${k}  ${why}`);
}
if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
