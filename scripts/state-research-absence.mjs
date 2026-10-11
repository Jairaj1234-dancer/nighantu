#!/usr/bin/env node
/**
 * Say so on the 32 formulation pages that cite no research and do not mention it.
 *
 * THE DECISION BEHIND THIS. 69 of 143 formulation pages hold no literature, and 61 of those have
 * nothing findable in PubMed under any spelling, because classical formulations are researched
 * largely in Indian journals PubMed does not index. The tempting fix is to cite that literature
 * from the AYUSH Research Portal or DHARA instead. This project should not, for three reasons that
 * are about traceability rather than effort:
 *
 *   1. Neither gives a stable resolvable identifier of PMID quality, so a reader could not check a
 *      citation and neither could an answer engine.
 *   2. check-retractions.mjs verifies every current citation against PubMed. A non-MEDLINE source
 *      has no equivalent feed, so those citations would be unverifiable for retraction forever.
 *   3. Mixing checkable and uncheckable citations without marking which is which would quietly
 *      weaken every citation on the site, including the ones that are sound.
 *
 * So the absence stays, and the honest move is to state it. A reference work that simply shows no
 * research invites the reader to conclude none exists.
 *
 * WHY 32 PAGES SAY NOTHING WHILE 37 SAY IT ALREADY. lib/claims.mjs shortfallNote explains a LOSS:
 * it fires when claims were dropped for being untraceable, and its text counts them. A page that
 * never had a claim to lose drops nothing, so the note never fires, and the page goes out silent.
 * The note explains what was removed when what a reader needs to know is what was never there.
 *
 * THE WORDING IS THE PROJECT'S OWN. The second sentence is quoted from shortfallNote's formulation
 * branch rather than written fresh, so the two paths say the same thing in the same words. The
 * first sentence is the part shortfallNote cannot say, because it would otherwise claim a removal
 * that never happened.
 *
 * IT IS ITALIC, AND THAT MATTERS NOW. answer.mjs discards a line that is wholly emphasised, so this
 * note cannot be lifted into a meta description the way the old shortfall note was on 49 pages.
 *
 *   node scripts/state-research-absence.mjs            report what would change
 *   node scripts/state-research-absence.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');

const HEADING = '## Which traditional uses are supported by research?';
const NOTE = '*No published research is cited on this page. Classical formulations are researched '
  + 'largely in journals that PubMed does not index, so an absence here reflects the reach of the '
  + 'index rather than the state of the evidence.*';

/** Put research before preparation, which is the order every other formulation page uses. */
const BEFORE = ['## What is it made of?', '## Dosage forms and preparation', '### Synergistic Combinations'];

const cites = JSON.parse(fs.readFileSync(path.join('src', 'data', 'citations.json'), 'utf8')).pages;

const changed = [];
const skipped = [];

for (const f of fs.readdirSync(path.join('content', 'formulation'))) {
  if (!f.endsWith('.md')) continue;
  const slug = f.replace(/\.md$/, '');
  const file = path.join('content', 'formulation', f);
  const raw = fs.readFileSync(file, 'utf8');

  if ((cites[`formulation/${slug}`]?.citations ?? []).length) continue;
  if (/journals that PubMed does not index|could not be traced to a published paper|absence here/i.test(raw)) {
    skipped.push([slug, 'already states the absence']);
    continue;
  }
  if (raw.includes(HEADING)) { skipped.push([slug, 'already has the research heading']); continue; }

  const split = /^(---\n[\s\S]*?\n---\n)([\s\S]*)$/.exec(raw);
  if (!split) { skipped.push([slug, 'frontmatter did not parse']); continue; }
  const [, front, body] = split;

  const block = `${HEADING}\n\n${NOTE}\n\n`;
  let next;
  let where = '';
  const anchor = BEFORE.map((h) => body.indexOf(h)).filter((i) => i !== -1).sort((a, b) => a - b)[0];
  if (anchor !== undefined) {
    next = body.slice(0, anchor) + block + body.slice(anchor);
    where = `before "${BEFORE.find((h) => body.indexOf(h) === anchor)}"`;
  } else {
    next = `${body.replace(/\s*$/, '')}\n\n${block}`.replace(/\s*$/, '\n');
    where = 'appended, no preparation section to sit before';
  }

  changed.push({ slug, where });
  if (WRITE) fs.writeFileSync(file, front + next);
}

console.log(`${changed.length} pages given the absence statement, ${skipped.length} left alone.\n`);
for (const c of changed) console.log(`  ${c.slug.padEnd(34)} ${c.where}`);
const by = {};
for (const [, why] of skipped) by[why] = (by[why] || 0) + 1;
console.log('\nleft alone:');
for (const [why, n] of Object.entries(by)) console.log(`   ${String(n).padStart(3)}  ${why}`);
if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
