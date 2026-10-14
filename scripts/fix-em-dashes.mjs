#!/usr/bin/env node
/**
 * Replace every em dash in the content corpus with the punctuation the sentence actually wants.
 *
 * 3,556 of them across 290 pages. The house rule is no em dashes, and the answer blocks have been
 * held to it, but the body prose predates it.
 *
 * THE RULES ARE DERIVED FROM THE CORPUS, NOT GUESSED. Counting what follows each dash gives four
 * shapes that cover almost all of it:
 *   2,256  followed by an emphasis span. This is the gloss list, "[Haridra](/herb/haridra/) —
 *          *Curcuma longa L.*", which is apposition and wants a comma.
 *     771  followed by an opening parenthesis, "Karmaranga — (Antioxidant)". The parenthesis is
 *          already doing the work, so the dash is deleted rather than replaced.
 *     373  followed by a lowercase word. These split three ways on grammar, and the branch below
 *          explains why a single replacement gets two of them wrong.
 *      52  followed by a capital, which is apposition again ("*Ashtanga Hridaya* — Sutrasthana
 *          15") and wants a comma, except in a heading where a colon is the convention.
 *
 * NOTHING QUOTED IS TOUCHED, and that was checked before any rule was written: no em dash in this
 * corpus sits inside a quotation, a paper title, a code span or a link label. Had one, changing it
 * would have falsified a quote, which is worse than leaving a dash.
 *
 * THE GUARD IS THE POINT. After rewriting, the WORDS of every line must be identical to before,
 * once punctuation is discounted. The script compares them and refuses to write the file if a
 * single word moved, so it cannot drop a clause while tidying punctuation. This corpus has lost
 * content to pattern rewriting before.
 *
 *   node scripts/fix-em-dashes.mjs            report, with a sample of every rule
 *   node scripts/fix-em-dashes.mjs --write    apply
 */
import fs from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');
const DASH = '—';

/** Is this dash inside an unclosed parenthesis on its own line? Then a comma, never a colon. */
const insideParens = (line, at) => {
  const before = line.slice(0, at);
  return (before.match(/\(/g) ?? []).length > (before.match(/\)/g) ?? []).length;
};

const rules = {};
const count = (r) => { rules[r] = (rules[r] ?? 0) + 1; };
const samples = {};
const sample = (r, before, after) => { (samples[r] ??= []).push({ before, after }); };

function rewrite(line) {
  const isHeading = /^#{1,6}\s/.test(line);
  let out = '';
  let i = 0;
  while (i < line.length) {
    const at = line.indexOf(DASH, i);
    if (at === -1) { out += line.slice(i); break; }

    // How much whitespace surrounds this dash, so it can be consumed with it.
    let start = at;
    while (start > 0 && /\s/.test(line[start - 1])) start -= 1;
    let end = at + 1;
    while (end < line.length && /\s/.test(line[end])) end += 1;

    const head = line.slice(i, start);
    const next = line.slice(end);
    let repl;
    let rule;
    let capitalise = false;

    if (next.startsWith('(')) { repl = ' '; rule = 'deleted, the parenthesis already separates'; }
    else if (isHeading) { repl = ': '; rule = 'colon, heading'; }
    else if (insideParens(line, at)) { repl = ', '; rule = 'comma, inside a parenthetical'; }
    else if (next.startsWith('*') || next.startsWith('[')) { repl = ', '; rule = 'comma, apposition before a gloss'; }
    /**
     * A lowercase follower is one of three different things, and a single replacement gets two of
     * them wrong. Counting the leading words gave 191 distinct ones over 349 occurrences, so no
     * closed vocabulary covers it, but the grammatical distinction below is mechanical:
     *
     *  - An IMPERATIVE is a new instruction and wants its own sentence: "Hygroscopic - avoid
     *    exposure to humidity" becomes two sentences, because a comma there separates nothing and
     *    "Hygroscopic avoid exposure" is not English. All 13 of these were read individually.
     *  - Everything else takes a comma.
     *
     * TWO REPLACEMENTS WERE TRIED AND REJECTED, both for the same reason: they are elegant on the
     * cases that suggested them and broken on their neighbours.
     *
     * A COLON, first, for every lowercase follower. 263 of the 349 sit on a line that already uses
     * a colon for its bold label, so it produced "**Note:** Restricted use: requires strict
     * Shodhana protocols", two colons in one short line.
     *
     * DELETING THE DASH, second, wherever a third-person verb followed, on the reasoning that the
     * dash had split a subject from its predicate: "Restricted use - requires strict Shodhana
     * protocols" does read correctly as "Restricted use requires strict Shodhana protocols".
     * Reading all 42 showed it only holds when what precedes is a bare subject. Where the text
     * before the dash is already a predicate or a prepositional phrase it produces "acts as
     * yogavahi enhances bioavailability", "Use in moderate doses contains oxalic acid" and "With
     * Haridra enhances curcumin bioavailability". A comma is merely informal in all of those and
     * ungrammatical in none, so the comma wins: prefer the replacement that is never wrong over
     * the one that is sometimes better.
     */
    else if (/^(?:store|maintain|monitor|avoid|protect|keep|ensure|apply|discard|refrigerate|dry|grind|filter|seal|label|check|note)\b/.test(next)) {
      repl = '. '; rule = 'full stop, an imperative gets its own sentence';
      capitalise = true;
    } else if (/^[a-z]/.test(next)) { repl = ', '; rule = 'comma, apposition before a lowercase phrase'; }
    else if (/^[A-Z0-9]/.test(next)) { repl = ', '; rule = 'comma, apposition'; }
    else { repl = ', '; rule = 'comma, fallback'; }

    // A dash at the very start or end of a line has nothing to join; drop it and its space.
    if (head.trim() === '' && out.trim() === '') { repl = ''; rule = 'deleted, nothing before it'; }
    if (next.trim() === '') { repl = ''; rule = 'deleted, nothing after it'; }

    count(rule);
    out += head + repl;
    if (capitalise) {
      // Only the first letter, and only because this branch started a new sentence.
      out += line.slice(end, end + 1).toUpperCase();
      i = end + 1;
      continue;
    }
    i = end;
  }
  // Tidy the seams the substitutions can create, without touching anything else.
  return out
    .replace(/,\s*,/g, ',')
    .replace(/:\s*,/g, ':')
    .replace(/,\s*:/g, ':')
    .replace(/\s+([,:;.])/g, '$1')
    .replace(/([,:])\s*\)/g, ')')
    .replace(/\(\s+/g, '(')
    .replace(/[ \t]+$/g, '');
}

/** What a reader reads: words only, so punctuation changes are invisible to the comparison. */
const words = (s) => s.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();

const changed = [];
const refused = [];
for (const kind of fs.readdirSync('content')) {
  const dir = path.join('content', kind);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const full = path.join(dir, file);
    const src = fs.readFileSync(full, 'utf8');
    if (!src.includes(DASH)) continue;

    const lines = src.split('\n');
    const next = lines.map((line) => {
      if (!line.includes(DASH)) return line;
      const after = rewrite(line);
      if (words(line) !== words(after)) {
        refused.push({ id: `${kind}/${file}`, line, after });
        return line;
      }
      sample('any', line, after);
      return after;
    });
    const result = next.join('\n');
    if (result === src) continue;
    if (result.includes(DASH)) { refused.push({ id: `${kind}/${file}`, line: 'a dash survived the rewrite', after: '' }); continue; }
    changed.push({ full, id: `${kind}/${file}`, n: (src.match(new RegExp(DASH, 'g')) ?? []).length });
    if (WRITE) fs.writeFileSync(full, result);
  }
}

console.log(`${changed.length} files rewritten, ${changed.reduce((a, c) => a + c.n, 0)} em dashes replaced.\n`);
console.log('by rule:');
for (const [r, n] of Object.entries(rules).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${r}`);

const shown = (samples.any ?? []).filter((s) => s.before !== s.after);
console.log(`\nsample of ${Math.min(10, shown.length)} rewritten lines:`);
const step = Math.max(1, Math.floor(shown.length / 10));
for (let i = 0; i < shown.length && i < 10 * step; i += step) {
  console.log(`  was:  ${shown[i].before.trim().slice(0, 130)}`);
  console.log(`  now:  ${shown[i].after.trim().slice(0, 130)}\n`);
}

if (refused.length) {
  console.log(`REFUSED ${refused.length} line(s), words would have changed:`);
  for (const r of refused.slice(0, 10)) {
    console.log(`  ${r.id}`);
    console.log(`     was: ${r.line.slice(0, 120)}`);
    console.log(`     now: ${r.after.slice(0, 120)}`);
  }
} else {
  console.log('No line refused: every rewritten line carries exactly the words it carried before.');
}
if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
