#!/usr/bin/env node
/**
 * Em dashes out of 24 answer blocks, and a dosing fragment off the end of 8.
 *
 * THE HOUSE RULE is no em dashes in anything published, with the phrasing rebuilt so it reads as
 * though a person wrote it rather than as though a dash was deleted. 78 answers had one. 54 of them
 * turned out not to be a punctuation problem at all: the dash was a list delimiter and the answer
 * was a serialised member list, which scripts/fix-answer-lists.mjs cut back to prose. What is left
 * here is the real thing, a dash used as punctuation.
 *
 * MOSTLY A COLON, because in nearly every case what follows the dash explains what precedes it:
 * "Use cautiously — latex is toxic in large doses" is a statement and its reason. Where the dash is
 * unspaced it is joining a clause rather than introducing one, so it becomes a comma. Both defaults
 * are overridable per page below, and the dry run prints every result, because a punctuation rule
 * that is right 20 times out of 24 still ships four sentences that read wrong.
 *
 * TWO DASHES ARE DELIBERATELY KEPT. /reference/kidney-urinary-across-traditions/ and its sibling
 * are TITLED "Kidney & Urinary — Across Traditions", and the answer opens by repeating the title.
 * Changing it here would leave the description disagreeing with the page's own h1 and canonical
 * title. Whether those titles should carry an em dash is a question about the titles, and editing
 * one copy of them quietly is not how to answer it.
 *
 * THE DOSING FRAGMENTS are the tail end of the vault-field leak. Their labels were lost upstream so
 * no pattern reaches them, and they split two ways on reading, which is why each is named:
 *
 *   KEPT    nagadanti   "Use with caution; purgative at higher doses"   a real warning about a
 *                                                                      drastic purgative
 *   DROPPED chirabilva  "Traditional dosing per Vaidya guidance"        says nothing
 *   DROPPED granthiparni "Limited modern dosage data - follow classical text guidelines"
 *   DROPPED chavika     "Pungent herb, start with lower doses"          dosing advice from a seller
 *
 * The dropped ones are all dosing guidance or filler, and a searcher is served by neither. The kept
 * one names a property of the drug.
 *
 *   node scripts/fix-answer-prose.mjs            report what would change
 *   node scripts/fix-answer-prose.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk } from './lib.mjs';
import { answerViolations } from './lib/answer-safety.mjs';

const WRITE = process.argv.includes('--write');

/** Pages whose em dash is part of the page title and stays until the titles are decided. */
const KEEP_DASH = new Set([
  'reference/antiinflammatory-pain-across-traditions',
  'reference/kidney-urinary-across-traditions',
]);

/**
 * Where the default punctuation reads wrong. Each is a punctuation choice, not new content.
 * karmaranga already opens its clause with "Caution:", so a second colon would stack two in one
 * sentence; shvet-musli's dash sits inside a parenthesis introducing a quantity, where a comma is
 * what a person would write.
 */
const OVERRIDE = {
  'herb/karmaranga': { from: ' — ', to: ', and it is ' },
  'herb/shvet-musli': { from: ' — ', to: ', ' },
  'herb/mahanarayan': { from: ' — ', to: '. ' },
};

/** Tail fragments to drop, each read individually. The reason is recorded, not inferred. */
const DROP_TAIL = {
  'herb/bhumi-jambuka': 'Limited modern dosage standardization, follow traditional Vaidya guidance.',
  'herb/bhutakeshi': 'Lower doses recommended initially due to potent sedative properties.',
  'herb/chavika': 'Pungent herb, start with lower doses.',
  'herb/chirabilva': 'Traditional dosing per Vaidya guidance.',
  'herb/chirayata': 'Extremely bitter, lower doses for compliance.',
  'herb/granthiparni': 'Limited modern dosage data - follow classical text guidelines.',
  'herb/mayurashikha': 'Low-dose herb; use with caution.',
};

const words = (s) => (s.match(/\S+/g) || []).length;

/**
 * THE FLOOR BITES ON THREE PAGES, and src/data/taxonomy.json is what releases it.
 *
 * chavika, chirayata and granthiparni say only "X (Binomial) is a plant used in Ayurveda" plus the
 * dosing fragment, so dropping the fragment leaves 9 words and audit.mjs fails under 10. They have
 * no family field, no sanskrit, no whoStatus and no names.json entry, which is exactly why
 * fix-generic-answers.mjs left them alone.
 *
 * But taxonomy.json resolves all three against GBIF with an EXACT match and knows the family:
 * Piperaceae, Gentianaceae, Lamiaceae. So the clause is sourced, not supplied by me. Only EXACT
 * matches are used; a fuzzy taxonomic match is a guess about which plant the page is about, which
 * is the one thing a botanical reference may not guess.
 *
 * This fires on three pages today, and it is written as a rule rather than three strings because
 * the same gap is much wider: 192 pages have an empty family field that taxonomy.json could fill.
 * Backfilling those is its own pass, with its own verification.
 */
const TAXA = (() => {
  const by = new Map();
  for (const t of JSON.parse(fs.readFileSync(path.join('src', 'data', 'taxonomy.json'), 'utf8')).taxa ?? []) {
    if (t.matchType !== 'EXACT' || !t.family) continue;
    for (const k of [t.canonicalName, t.scientificName, t.query]) if (k) by.set(k.toLowerCase(), t.family);
  }
  return by;
})();

/** The family for a page's botanical name, from taxonomy.json only, or '' if it is not known there. */
function familyOf(front) {
  const bot = (/^botanical:\s*"([^"]*)"/m.exec(front) ?? [, ''])[1].trim();
  if (!bot) return '';
  const k = bot.toLowerCase();
  return TAXA.get(k) ?? TAXA.get(k.split(/\s+/).slice(0, 2).join(' ')) ?? '';
}

const changed = [];
const refused = [];
const kept = [];

for (const rel of walk('content')) {
  const file = path.join('content', rel);
  const raw = fs.readFileSync(file, 'utf8');
  const m = /^answer:\s*"(.*?)"\s*$/m.exec(raw);
  if (!m) continue;

  const kind = rel.split(path.sep)[0];
  const key = `${kind}/${path.basename(rel, '.md')}`;
  let next = m[1];
  const did = [];

  // ---- 1. the dash
  if (next.includes('—')) {
    if (KEEP_DASH.has(key)) {
      kept.push([key, "the dash is in the page's own title"]);
    } else if (OVERRIDE[key]) {
      next = next.split(OVERRIDE[key].from).join(OVERRIDE[key].to);
      did.push('dash replaced, per-page override');
    } else {
      // Spaced: the dash introduces an explanation, so a colon. Unspaced: it joins, so a comma.
      next = next.replace(/\s+—\s+/g, ': ').replace(/—/g, ', ');
      did.push('dash to colon or comma');
    }
  }

  // ---- 2. the stranded dosing fragment, after the dash is gone so the text matches
  const tail = DROP_TAIL[key];
  if (tail && next.includes(tail)) {
    next = next.split(tail).join('').replace(/\s+/g, ' ').trim();
    did.push('dosing fragment dropped');
  } else if (tail) {
    refused.push([key, `the fragment to drop was not found: ${JSON.stringify(tail)}`]);
    continue;
  }

  if (!did.length) continue;

  next = next.replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').replace(/::+/g, ':').trim().replace(/[\s,;:]+$/, '');
  if (next && !/[.!?]$/.test(next)) next += '.';

  // Dropping the fragment can take a bare page under the word floor. Where taxonomy.json knows the
  // family, say that instead; it is a fact about the plant rather than advice about taking it.
  if (words(next) < 10) {
    const fam = familyOf(raw.split('\n---')[0]);
    if (fam && !next.includes(fam)) {
      next = `${next.replace(/\.$/, '')}, from the ${fam} family.`;
      did.push(`family added from taxonomy.json (${fam})`);
    }
  }

  // REFUSE RATHER THAN PUBLISH A FAULT.
  if (!KEEP_DASH.has(key) && next.includes('—')) { refused.push([key, 'an em dash survived']); continue; }
  if (next.includes('"')) { refused.push([key, 'quote would break frontmatter']); continue; }
  if (words(next) < 10) { refused.push([key, `only ${words(next)} words survive and audit.mjs fails under 10`]); continue; }
  const v = answerViolations(next, { kind });
  if (v.length) { refused.push([key, `violates afterwards: ${JSON.stringify(v)}`]); continue; }

  changed.push({ key, before: m[1], after: next, did: did.join('; ') });
  if (WRITE) fs.writeFileSync(file, raw.replace(m[0], `answer: "${next}"`));
}

console.log(`${changed.length} answers rewritten, ${kept.length} dashes kept on purpose, ${refused.length} refused.\n`);
for (const c of changed) {
  console.log(`  ${c.key}   (${c.did})`);
  console.log(`    was: ${c.before.slice(0, 175)}`);
  console.log(`    now: ${c.after.slice(0, 175)}`);
  console.log();
}
if (kept.length) {
  console.log('KEPT, on purpose:');
  for (const [k, why] of kept) console.log(`   ${k.padEnd(50)} ${why}`);
}
if (refused.length) {
  console.log('\nREFUSED, nothing written for these:');
  for (const [k, why] of refused) console.log(`   ${k}  ${why}`);
}
if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
