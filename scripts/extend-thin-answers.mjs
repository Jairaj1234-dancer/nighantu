#!/usr/bin/env node
/**
 * Put something back. 16 answer blocks that the removal passes left too thin to say anything.
 *
 * WHY THESE ARE THIN. Four passes on 10 and 11 October took the bibliography, the generated
 * apparatus, the dosing figures and the vault field labels out of 161 answer blocks. Every removal
 * was right and every one of them took words away, so 40 answers now sit at 10 to 12 words against
 * the 10-word floor audit.mjs enforces. "Trikatu Churna is a classical Ayurvedic churna, a fine
 * herbal powder." is true, clears the floor, and tells a searcher who typed "trikatu churna"
 * nothing they did not already know.
 *
 * WHERE THE WORDS COME FROM. The `whoStatus` frontmatter field, which on these pages holds the
 * pharmacopoeial status and which nothing in the answer was using. Trikatu's reads "Listed in
 * Ayurvedic Formulary of India (AFI) Part I", and that is the single most useful fact about a
 * classical formulation: it is an official formulary entry rather than a house recipe. Nothing is
 * invented; the clause is the page's own field, trimmed to its first statement.
 *
 * THIS IS THE MECHANISM THAT CAUSED THE kalonji DOSE LEAK, reused deliberately. answer.mjs lifts
 * the first sentence of the WHO/Pharmacopoeia field exactly this way, which is how "Listed in the
 * Pharmacopoeia of India at recommended dose of 0.5-4 g seed powder" became a meta description. The
 * difference is that the quantity rule added in fix-answer-doses.mjs now exists to catch it, and
 * every candidate here is run through the gate before it is written. A mechanism is not unsafe; an
 * ungated mechanism is.
 *
 * TWO ARE REFUSED, AND NEITHER BY THE GATE.
 *
 * herb/laung's clause is "WHO Monographs (2002) list Caryophylli floris aetheroleum (clove
 * essential oil) for traditional topical use in toothache, minor oral/skin infections, minor wound
 * dressing, sore throats, myalgia, rheumatic complaints, and insect bites." That is a list of
 * therapeutic indications, and publishing it as the search result for a spice this company sells is
 * the thing the house rule exists to prevent. isDiseaseClaim does NOT catch it: the test is a
 * conjunction of a disease word and an efficacy word, and toothache, sore throat and myalgia are
 * none of them in DISEASE_WORD. Widening that list is the riskier fix and is not attempted here, so
 * this script carries its own indication test and the gap in the gate is recorded rather than
 * patched in passing.
 *
 * formulation/amalaki-rasayana's clause is "Amalaki monograph in Ayurvedic Pharmacopoeia of India
 * (API)". Amalaki is an INGREDIENT of the preparation, not the preparation, so appending it would
 * say the rasayana is monographed when what is monographed is one of the things in it. No pattern
 * would catch that; it needed reading.
 *
 * TWO ARE TRIMMED BY HAND, because their clause is right and its tail is padding.
 * haridra-khanda's names a publisher, "published by Ministry of Health and Family Welfare,
 * Department of AYUSH", which is both noise in a search result and out of date, since AYUSH has
 * been its own ministry since 2014. chyawanprash's ends in an assay specification, "(minimum 0.5%
 * gallic acid)", which is a real standard and belongs in the body rather than in the sentence a
 * searcher reads. Both trims are declared below rather than derived.
 *
 *   node scripts/extend-thin-answers.mjs            report what would change
 *   node scripts/extend-thin-answers.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk } from './lib.mjs';
import { answerViolations } from './lib/answer-safety.mjs';

const WRITE = process.argv.includes('--write');

/** Answers at or below this many words are the ones the removal passes left bare. */
const THIN = 12;
/** A clause longer than this is a paragraph, not a fact to append to a two-sentence block. */
const MAX_CLAUSE = 100;

/**
 * A therapeutic indication, which may not go in an answer block however it is framed.
 * Narrower than DISEASE_WORD on purpose: it tests for the FRAMING that introduces a list of
 * conditions, not for the conditions themselves, so it needs no vocabulary of diseases to maintain.
 */
const INDICATION = /\b(for (?:traditional )?(?:topical |internal |oral |external )?use in|indicated (?:in|for)|used (?:in|for) the treatment|for the treatment of)\b/i;

/** Clauses whose first statement is right but whose tail is padding. Declared, not derived. */
const TRIMMED = {
  'formulation/haridra-khanda': 'Referenced in Ayurvedic Pharmacopoeia of India (API)',
  'formulation/chyawanprash': 'Official monograph in Ayurvedic Pharmacopoeia of India (API) with physicochemical and assay standards',
};

/** Pages whose clause cannot be used, with the reason it was read rather than matched. */
const REFUSE = {
  'formulation/amalaki-rasayana': 'the clause is the monograph for Amalaki, an ingredient, not for the preparation',
};

const words = (s) => (s.match(/\S+/g) || []).length;

const changed = [];
const skipped = [];

for (const rel of walk('content')) {
  const file = path.join('content', rel);
  const raw = fs.readFileSync(file, 'utf8');
  const m = /^answer:\s*"(.*?)"\s*$/m.exec(raw);
  if (!m) continue;
  if (words(m[1]) > THIN) continue;

  const kind = rel.split(path.sep)[0];
  const key = `${kind}/${path.basename(rel, '.md')}`;

  if (REFUSE[key]) { skipped.push([key, REFUSE[key]]); continue; }

  const who = (/^whoStatus:\s*"([^"]+)"/m.exec(raw) ?? [, ''])[1];
  if (!who) { skipped.push([key, 'no whoStatus to draw on; this page needs content, not a clause']); continue; }

  // The first statement of the field: these are semicolon-separated lists of status facts.
  const declared = Boolean(TRIMMED[key]);
  let clause = (TRIMMED[key] ?? who.split(/;|(?<=[.!?])\s+/)[0]).trim().replace(/[\s.,;:]+$/, '');
  if (!clause) { skipped.push([key, 'whoStatus opens with nothing usable']); continue; }
  /**
   * SUBSTANCE BEFORE LENGTH, so the reason reported is the real one. With the length test first,
   * herb/laung was refused as "233 characters, too long to append" when the reason it must never be
   * appended is that it lists therapeutic indications. A shallow reason in the output is the same
   * fault as audit.mjs reporting every violation as a disease claim: it sends the next reader
   * looking for the wrong problem.
   */
  if (INDICATION.test(clause)) { skipped.push([key, 'clause introduces a list of therapeutic indications, which no length would make acceptable']); continue; }
  // A declared trim has already had its length judged by hand; the limit is for clauses taken whole.
  if (!declared && clause.length > MAX_CLAUSE) { skipped.push([key, `clause is ${clause.length} characters, too long to append`]); continue; }
  if (clause.includes('"')) { skipped.push([key, 'quote would break frontmatter']); continue; }

  const next = `${m[1]} ${clause}.`;
  const v = answerViolations(next, { kind });
  if (v.length) { skipped.push([key, `gate refused: ${JSON.stringify(v)}`]); continue; }

  changed.push({ key, before: m[1], after: next, trimmed: Boolean(TRIMMED[key]) });
  if (WRITE) fs.writeFileSync(file, raw.replace(m[0], `answer: "${next}"`));
}

const lens = changed.map((c) => words(c.after)).sort((a, b) => a - b);
console.log(`${changed.length} thin answers extended, ${skipped.length} left thin.`);
if (lens.length) console.log(`they now run ${lens[0]} to ${lens[lens.length - 1]} words.\n`);

for (const c of changed) {
  console.log(`  ${c.key}${c.trimmed ? '   (clause trimmed by hand)' : ''}`);
  console.log(`    was: ${c.before}`);
  console.log(`    now: ${c.after}`);
  console.log();
}

console.log('LEFT THIN, with the reason:');
for (const [k, why] of skipped.sort((a, b) => a[1].localeCompare(b[1]))) console.log(`   ${k.padEnd(34)} ${why}`);

if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
