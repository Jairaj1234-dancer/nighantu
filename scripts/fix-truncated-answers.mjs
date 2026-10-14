#!/usr/bin/env node
/**
 * Repair answer blocks that were cut inside an abbreviation.
 *
 * THE CAUSE IS FIXED SEPARATELY, in scripts/answer.mjs: the sentence splitter used a bare
 * `(?<=[.!?])\s+`, which treats every full stop followed by a space as a sentence end. In this
 * corpus a full stop is very often an abbreviation instead, because the prose is full of
 * abbreviated genus names and citation apparatus. The split landed inside `(O. sanctum)`,
 * `(P. acnes)`, `(Vol. 2)` and `(G. indica)`, one half was discarded by a later filter, and the
 * surviving half shipped with an orphaned bracket. /herb/holy-basil/ reads
 * "from the Lamiaceae family. sanctum) contains eugenol".
 *
 * This script repairs the text already published. Seven pages carry an unbalanced bracket in the
 * answer block and one carries an unclosed square bracket around a leaked paper title.
 *
 * IT DROPS THE DAMAGED SENTENCE, IT DOES NOT RECONSTRUCT IT. The missing half is gone, and
 * guessing what it said would be inventing content on a reference page. Dropping loses a sentence;
 * reconstructing risks publishing something nobody wrote. Where dropping would leave an answer too
 * short to be useful, the script REFUSES that page and says so, so it can be written by hand.
 *
 * Every result is re-checked against answerViolations and the ten-word floor before it is written,
 * so a repair cannot introduce a different defect than the one it fixes.
 *
 *   node scripts/fix-truncated-answers.mjs            report what would change
 *   node scripts/fix-truncated-answers.mjs --write    apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { answerViolations } from './lib/answer-safety.mjs';

const WRITE = process.argv.includes('--write');
const MIN_WORDS = 20;

/** Split on sentence ends, with the same abbreviation guards the composer now uses. */
const SENTENCE = /(?<!\b[A-Z]\.)(?<!\b(?:Vol|No|Nos|Fig|Figs|Ed|Eds|pp|cf|al|var|subsp|ssp|syn|sp|spp|St|Mt|Dr|Mr|Mrs|Ms|Prof|approx|etc|e\.g|i\.e)\.)(?<=[.!?])\s+/;

const balanced = (s) => (s.match(/\(/g) ?? []).length === (s.match(/\)/g) ?? []).length
  && (s.match(/\[/g) ?? []).length === (s.match(/\]/g) ?? []).length;

const results = [];
for (const kind of fs.readdirSync('content')) {
  const dir = path.join('content', kind);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const full = path.join(dir, file);
    const src = fs.readFileSync(full, 'utf8');
    const m = /^answer: "([\s\S]*?)"\n/m.exec(src);
    if (!m) continue;
    const answer = m[1];
    if (balanced(answer)) continue;

    const id = `${kind}/${file.replace('.md', '')}`;
    const parts = answer.split(SENTENCE);
    const kept = parts.filter(balanced);
    const dropped = parts.filter((p) => !balanced(p));
    const next = kept.join(' ').replace(/\s+/g, ' ').trim();
    const words = next.split(/\s+/).filter(Boolean).length;

    if (!balanced(next)) { results.push({ id, refused: 'still unbalanced after dropping' }); continue; }
    if (words < MIN_WORDS) {
      results.push({ id, refused: `only ${words} words would remain, below the ${MIN_WORDS}-word floor`, dropped });
      continue;
    }
    const v = answerViolations(next, { kind });
    if (v.length) { results.push({ id, refused: `the result violates the gate: ${v.join(', ')}` }); continue; }

    results.push({ id, full, before: answer, after: next, dropped, words });
    if (WRITE) fs.writeFileSync(full, src.replace(m[0], `answer: "${next}"\n`));
  }
}

const ok = results.filter((r) => !r.refused);
console.log(`${ok.length} answer blocks repaired, ${results.length - ok.length} refused.\n`);
for (const r of results) {
  if (r.refused) {
    console.log(`  REFUSED ${r.id}: ${r.refused}`);
    for (const d of r.dropped ?? []) console.log(`           damaged piece: ${d}`);
    continue;
  }
  console.log(`  ${r.id}  (${r.words} words remain)`);
  for (const d of r.dropped) console.log(`     dropped: ${d}`);
}
if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
