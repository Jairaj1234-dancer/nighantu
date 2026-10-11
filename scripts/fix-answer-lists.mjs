#!/usr/bin/env node
/**
 * 33 answer blocks were a member list. The answer ends where the list begins.
 *
 * FOUND WHILE COUNTING EM DASHES, which is the only reason it was found at all. 78 answers contain
 * an em dash against the house style, and sorting them by how many each contains separated two
 * entirely different problems: 45 use one or two as punctuation, and 33 use three or more because
 * the dash is a list delimiter and the answer is a serialised list.
 *
 * WHAT IS LIVE RIGHT NOW on /reference/eye-health/:
 *
 *   Eye Health is a reference entry in the Nighantu. Cross-tradition therapeutic reference — 136
 *   related entries Agnitundi Vati — (Antispasmodic) Anjatraya Aparajita — Clitoria ternatea L. —
 *   (Antioxidant, Anticancer, Nootropic) Arka Ksheera Badara — (Anxiolytic, Immunomodulatory)
 *   Camphor — (Analgesic, Anti-inflammatory) Chakshushya — ...
 *
 * A hub page's member list, with each member's pharmacological properties in brackets, in the
 * sentence a searcher is shown. It is the same defect as the bibliography and the vault fields: a
 * structure that belongs in the body, lifted into prose because the composer scrapes the body for
 * sentences and a list with no full stops in it reads as one very long sentence.
 *
 * AND IT PUBLISHES PROPERTY CLAIMS. "Antispasmodic", "Nootropic", "Anxiolytic" and
 * "Immunomodulatory" are pharmacological classes, which this project deliberately allows as
 * category names rather than treating as claims, and lib/answer-safety.mjs says why: a bare
 * disease-word test would strip the answer block off every reference hub on the site. That
 * reasoning holds for a page ABOUT anxiolytic agents. It is doing no work at all when the words
 * arrive as a bracketed list of twelve members' properties under the heading "Eye Health".
 *
 * THE CUT POINT IS THE COUNT CLAUSE, which is the last thing the composer writes before the list
 * and the most useful thing in the block: "271 herbs and compounds with anticancer activity across
 * traditions" tells a reader what the page is and how big it is. 31 of the 33 end their prose with
 * one of three such clauses. The other 2 have no count, so they cut at the sentence boundary before
 * the first delimiter instead.
 *
 * WHY NOT CUT AT THE FIRST DELIMITER FOR ALL OF THEM. On /reference/anticancer/ the count clause
 * runs straight into the first member with no punctuation between: "...activity across traditions
 * Adhaki — Cajanus cajan". Walking back from the first dash to the previous full stop lands after
 * "Nighantu." and throws the count away. The explicit clauses exist because the generic rule
 * silently loses the best sentence on 31 pages.
 *
 *   node scripts/fix-answer-lists.mjs            report what would change
 *   node scripts/fix-answer-lists.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk } from './lib.mjs';
import { answerViolations } from './lib/answer-safety.mjs';

const WRITE = process.argv.includes('--write');

/**
 * HOW A LIST DUMP IS RECOGNISED, and the first version of this got it wrong.
 *
 * It required three or more em dashes, on the reasoning that three means the dash is a delimiter
 * rather than punctuation. That found 33 pages and MISSED 17 more, because most members of these
 * hubs have no binomial after their name, so a page can list forty members behind only one or two
 * dashes. Counting the delimiter was counting the wrong thing.
 *
 * The real signature does not involve dashes at all: the composer writes a count clause as the last
 * thing before the list, so a count clause WITH TEXT STILL AFTER IT is a list. 32 pages have a
 * count clause and nothing after it, and those are already correct and must not be touched.
 */
const DELIM = /—/g;
const MIN_DELIMS = 3;

/**
 * The clauses the composer writes immediately before a member list. Quoted from the output rather
 * than generalised, because each one is a template this site generates and a known string can be
 * matched exactly where a pattern for "a sentence about a count" could not.
 */
const COUNT_CLAUSE = [
  /\b\d+\s+related entries\b/,
  // `[a-z()\s-]` and not `[a-z-]`: the activity name is not always one word. "wound healing" has a
  // space and "medhya (nootropic)" has parentheses, and a single-token class silently skipped both
  // of those pages, leaving two list dumps live after a pass that reported zero remaining.
  /\b\d+\s+herbs and compounds with [a-z()\s-]{3,40}? activity across traditions\b/,
  /\bFound in \d+ entries across the catalogue\b/,
  // The plant-family hubs phrase it a fourth way. Found because the dry run refused
  // /reference/rosaceae/ for falling to 9 words: without this clause the fallback walks back past
  // "20 members in the catalogue" to "Nighantu." and loses both the count and the word floor.
  /\b\d+\s+members in the catalogue\b/,
  // A fifth shape on the across-traditions hubs, whose list is "Ayurveda: 71 entries TCM: 101
  // entries Global: 89 entries Nutraceutical: 12 entries" rather than member names.
  /\bComparing approaches to .{1,80}? across \d+ healing traditions\b/,
];

const words = (s) => (s.match(/\S+/g) || []).length;

const changed = [];
const refused = [];

for (const rel of walk('content')) {
  const file = path.join('content', rel);
  const raw = fs.readFileSync(file, 'utf8');
  const m = /^answer:\s*"(.*?)"\s*$/m.exec(raw);
  if (!m) continue;
  const kind = rel.split(path.sep)[0];
  const key = `${kind}/${path.basename(rel, '.md')}`;

  let cut = -1;
  let how = '';
  for (const rx of COUNT_CLAUSE) {
    const x = rx.exec(m[1]);
    if (!x) continue;
    const end = x.index + x[0].length;
    // Nothing after the count clause means the page is already correct. Leave it alone.
    if (!m[1].slice(end).replace(/[.\s]+/g, '')) break;
    cut = end;
    how = 'cut after the count clause';
    break;
  }
  if (cut === -1 && (m[1].match(DELIM) ?? []).length < MIN_DELIMS) continue;
  if (cut === -1) {
    const di = m[1].indexOf(' — ');
    const sb = di > 0 ? m[1].lastIndexOf('. ', di) : -1;
    if (sb > 0) { cut = sb + 1; how = 'no count clause: cut at the sentence before the first delimiter'; }
  }
  if (cut === -1) { refused.push([key, 'could not find where the list begins']); continue; }

  let next = m[1].slice(0, cut).replace(/\s+/g, ' ').trim().replace(/[\s,;:]+$/, '');
  /**
   * A dash surviving in the kept prose stands in for a colon: "Cross-tradition therapeutic
   * reference — 1057 related entries". But ONLY after the first sentence.
   *
   * Two of these pages are titled with an em dash, "Kidney & Urinary — Across Traditions", and the
   * answer opens by repeating the title. Converting that one would leave the answer saying
   * "Kidney & Urinary: Across Traditions" while the page's own h1 and canonical title still read
   * with the dash, so the fix would introduce a disagreement between a page and its own
   * description. Whether those titles should carry an em dash at all is a question about the
   * titles, and it is not answered by quietly editing one copy of them.
   */
  const firstStop = next.indexOf('. ');
  if (firstStop === -1) {
    next = next.replace(/\s+—\s+/g, ': ');
  } else {
    next = next.slice(0, firstStop + 1) + next.slice(firstStop + 1).replace(/\s+—\s+/g, ': ');
  }
  if (next && !/[.!?]$/.test(next)) next += '.';

  // REFUSE RATHER THAN PUBLISH A FAULT.
  /**
   * A delimiter surviving AFTER the first sentence means the list was not fully removed. A dash in
   * the first sentence is the page's own title and is kept on purpose above, so checking the whole
   * string here refused both across-traditions pages for containing exactly the thing this script
   * decided to leave them. A guard must not fail work on the ground it was told to permit.
   */
  const tail = next.slice(next.indexOf('. ') + 1);
  if ((tail.match(DELIM) ?? []).length) { refused.push([key, 'a delimiter survived the cut']); continue; }
  if (next.includes('"')) { refused.push([key, 'quote would break frontmatter']); continue; }
  if (words(next) < 10) { refused.push([key, `only ${words(next)} words precede the list`]); continue; }
  const v = answerViolations(next, { kind });
  if (v.length) { refused.push([key, `violates after the cut: ${JSON.stringify(v)}`]); continue; }

  changed.push({ key, before: m[1], after: next, how });
  if (WRITE) fs.writeFileSync(file, raw.replace(m[0], `answer: "${next}"`));
}

const lens = changed.map((c) => words(c.after)).sort((a, b) => a - b);
console.log(`${changed.length} list dumps cut back to prose, ${refused.length} refused.`);
if (lens.length) console.log(`they now run ${lens[0]} to ${lens[lens.length - 1]} words.\n`);

for (const c of changed) {
  console.log(`  ${c.key}   (${c.how})`);
  console.log(`    was: ${c.before.slice(0, 165)}`);
  console.log(`    now: ${c.after}`);
  console.log();
}
if (refused.length) {
  console.log('REFUSED, nothing written for these:');
  for (const [k, why] of refused) console.log(`   ${k}  ${why}`);
}
if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
