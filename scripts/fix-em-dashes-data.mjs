#!/usr/bin/env node
/**
 * The same em dash replacement, for the data files, and ONLY in the fields this project wrote.
 *
 * scripts/fix-em-dashes.mjs cleared content/. The remaining dashes reach the built pages through
 * src/data, and those files are not all ours to edit:
 *
 *   lexicon.json  .classical[].quote       66   KAVIRATNA'S AND BHISHAGRATNA'S OWN WORDS, e.g.
 *                                               "The son of Marichi said,—The heat dwelling in the
 *                                               body". The dash is the 1896 translator's. Changing
 *                                               it would falsify a quotation.
 *                 .renderings[].assessment 99   ours
 *                 .classical[].establishes 102  ours
 *                 .distinguishFrom[].why   66   ours
 *   concepts.json .classical[].quote, .verse     the sources' words again
 *   composition.json .ocrCorrected         42   forensic notes quoting what the AFI scan printed,
 *                                               left alone entirely: that file's own header says
 *                                               never to edit it by hand.
 *
 * SO THIS WORKS FROM A WHITELIST OF PATHS, NOT A BLACKLIST. A blacklist fails silently when a new
 * field appears; a whitelist fails safe, by leaving the new field alone. `quote`, `verse` and
 * `ocrCorrected` can therefore never be reached even by accident.
 *
 * The house rule is about how this project writes, not a licence to tidy somebody else's
 * punctuation. A dash that survives this script survives because it is inside a quotation, which
 * is where it belongs.
 *
 *   node scripts/fix-em-dashes-data.mjs            report
 *   node scripts/fix-em-dashes-data.mjs --write    apply
 */
import fs from 'node:fs';

const WRITE = process.argv.includes('--write');
const DASH = '—';

/** file -> the leaf field names this project authored. Anything not named here is not touched. */
const OURS = {
  'src/data/lexicon.json': ['assessment', 'establishes', 'why', 'note', 'reason', 'summary', 'openQuestions', 'alternates'],
  /**
   * `sources` in names.json is shaped "<citation>: \"<quoted text>\" - <our annotation>", for
   * example 'Flowers of India, Guggal page: "Sanskrit: ..." - printed in Devanagari.' The dash sits
   * OUTSIDE the quotation and separates the citation from our own note, so it is ours. Where it
   * does fall inside the quotation, inQuote below copies it through.
   */
  'src/data/names.json': ['reason', 'denotesInstead', 'note', 'sources'],
  'src/data/identity.json': ['basis', 'note', 'source'],
  'src/data/concepts.json': ['establishes', 'note', 'summary', 'positions', 'notKnown', 'gloss', 'domain'],
  'src/data/verification.json': ['note', 'summary', 'detail'],
};
/**
 * NOT whitelisted, deliberately, and each for a reason: `locator` carries a chapter title as
 * printed ("'Disease:-its Definition'"), `translator`, `sourceName`, `english`, `term`, `text` and
 * `category` are the sources' own strings, and `quote` and `verse` are the sources' words.
 */
const NEVER = new Set(['quote', 'verse', 'ocrCorrected', 'entryHeading', 'printedGloss', 'title']);

/**
 * The rules, matching fix-em-dashes.mjs: a parenthesis already separates, a lowercase imperative
 * gets its own sentence, everything else is apposition and takes a comma. There is no heading case
 * in a data field.
 */
const IMPERATIVE = /^(?:store|maintain|monitor|avoid|protect|keep|ensure|apply|discard|refrigerate|dry|grind|filter|seal|label|check|note)\b/;
/**
 * Is this dash inside a quoted span? A whitelisted field is ours, but the sentences inside it are
 * not all ours: these notes quote their sources inline, and the first run of this script turned
 * "the SM3B entry's index terms read: 'Indigestion disorder (TM2) - (a) ajirnam'" into the same
 * sentence with the WHO's dash silently removed from inside its own quotation. A field being ours
 * does not make every character in it ours.
 *
 * Counts quote marks before the position: an odd count means the dash is inside one. Straight and
 * curly, single and double, because the corpus uses all four.
 */
const inQuote = (s, at) => {
  const before = s.slice(0, at);
  const singles = (before.match(/'/g) ?? []).length + (before.match(/\u2018/g) ?? []).length;
  const doubles = (before.match(/"/g) ?? []).length + (before.match(/\u201C/g) ?? []).length;
  const curlyClosed = (before.match(/\u2019/g) ?? []).length + (before.match(/\u201D/g) ?? []).length;
  // An apostrophe inside a word ("Bhishagratna's") is not a quote mark, so discount those.
  const apostrophes = (before.match(/[\p{L}]['\u2019][\p{L}]/gu) ?? []).length;
  return ((singles + curlyClosed - apostrophes) % 2 === 1) || (doubles % 2 === 1);
};

function rewrite(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const at = s.indexOf(DASH, i);
    if (at === -1) { out += s.slice(i); break; }
    let start = at;
    while (start > 0 && /\s/.test(s[start - 1])) start -= 1;
    let end = at + 1;
    while (end < s.length && /\s/.test(s[end])) end += 1;
    const head = s.slice(i, start);
    const next = s.slice(end);
    const inParens = (s.slice(0, at).match(/\(/g) ?? []).length > (s.slice(0, at).match(/\)/g) ?? []).length;

    // Inside a quotation the punctuation is the source's, so copy the dash through untouched.
    if (inQuote(s, at)) { out += s.slice(i, at + 1); i = at + 1; quoted += 1; continue; }

    if (next.startsWith('(')) { out += `${head} `; i = end; continue; }
    if (!inParens && IMPERATIVE.test(next)) {
      out += `${head}. ${s.slice(end, end + 1).toUpperCase()}`;
      i = end + 1;
      continue;
    }
    if (head.trim() === '' && out.trim() === '') { out += head; i = end; continue; }
    if (next.trim() === '') { out += head; i = end; continue; }
    out += `${head}, `;
    i = end;
  }
  return out
    .replace(/,\s*,/g, ',')
    .replace(/\s+([,:;.])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/[ \t]+$/g, '');
}

const words = (x) => x.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();

let fixed = 0;
let quoted = 0;
let skipped = 0;
let refused = 0;
const samples = [];
for (const [file, allow] of Object.entries(OURS)) {
  if (!fs.existsSync(file)) continue;
  const raw = fs.readFileSync(file, 'utf8');
  const doc = JSON.parse(raw);
  const allowed = new Set(allow);
  /**
   * PRESERVE THE FILE'S OWN INDENT. Writing everything at one space reindented all 49,571 lines of
   * lexicon.json, so a diff carrying 245 punctuation changes arrived as 97,000 changed lines with
   * the real edits invisible inside it. These files are not uniform: lexicon, names, concepts and
   * composition are two-space, identity and verification are one.
   */
  const indentMatch = /\n( +)"/.exec(raw);
  const indent = indentMatch ? indentMatch[1].length : 1;
  const trailingNewline = raw.endsWith('\n');

  const walk = (node, key) => {
    if (typeof node === 'string') {
      if (!node.includes(DASH)) return node;
      if (NEVER.has(key) || !allowed.has(key)) { skipped += (node.match(/—/g) ?? []).length; return node; }
      const next = rewrite(node);
      if (words(node) !== words(next)) { refused += 1; return node; }
      // Count what actually changed, not every dash in the string: the quoted ones were copied
      // through, and counting them here would have the report overstate its own work.
      fixed += (node.match(/—/g) ?? []).length - (next.match(/—/g) ?? []).length;
      if (samples.length < 8) samples.push({ file, key, before: node.slice(0, 120), after: next.slice(0, 120) });
      return next;
    }
    if (Array.isArray(node)) return node.map((x) => walk(x, key));
    if (node && typeof node === 'object') {
      const out = {};
      for (const k of Object.keys(node)) out[k] = walk(node[k], k);
      return out;
    }
    return node;
  };

  const next = walk(doc, '');
  if (WRITE) fs.writeFileSync(file, JSON.stringify(next, null, indent) + (trailingNewline ? '\n' : ''));
}

console.log(`${fixed} em dashes replaced in fields this project wrote.`);
console.log(`${skipped} left alone: they are in a quotation, a verse, a transcription note, or a field not on the whitelist.`);
console.log(`${refused} refused because the words would have changed.`);
console.log(`${quoted} copied through untouched: inside a quotation within one of our own fields.\n`);
for (const s of samples) {
  console.log(`  ${s.file}  .${s.key}`);
  console.log(`     was: ${s.before}`);
  console.log(`     now: ${s.after}\n`);
}
if (!WRITE) console.log('Dry run. Nothing written. Re-run with --write to apply.');
