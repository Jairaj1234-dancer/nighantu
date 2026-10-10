#!/usr/bin/env node
/**
 * Repair eight names that a column layout broke, and remove one that is not a name.
 *
 * WHAT IS PUBLISHED. src/data/names.json feeds three things: the names table rendered by
 * src/components/NameForms.astro, the JSON-LD in [slug].jsonld.ts that Google reads as structured
 * data, and the markdown export in [slug].md.ts. So a broken transcription is published three
 * times over, and on two pages it also reached the meta description:
 *
 *   /herb/patha/     "Patha (Cissampelos pareira) is a plant drug, also called Ambasthak i, ..."
 *   /herb/mishreya/  "... also called Madhurika, Mi si and Saumpha ..."
 *
 * 232 of the 1,155 name entries in names.json are sourced only to the "Ayurvedic Pharmacopoeia of
 * India (column alignment reconstructed)" columns, where a multi-column table of synonyms per
 * language was OCRed and realigned. data/name-adjudication.json records the realignment reasoning
 * per monograph. That work decided WHICH LANGUAGE each name belongs to; it did not and could not
 * fix the spelling of the strings themselves.
 *
 * THE LINE THIS SCRIPT WILL NOT CROSS. A repair that REMOVES a character the layout inserted
 * asserts nothing new, because the source already claimed the name and only its transcription is
 * at issue. A repair that SUBSTITUTES a character I believe was misread is a guess about which word
 * was intended. So the whitespace artifacts are repaired here and the character confusions are not:
 * "Pahchangul" on eranda is probably Panchangul, "Munkka" on draksha is probably Munakka, and
 * neither is touched, because deciding that requires a source rather than a hunch.
 *
 * THE REPAIR JOINS A FRAGMENT TO ITS NEIGHBOUR. It does not collapse every space, and that
 * distinction is the whole correctness of this script. priyala's Malayalam reads "Mural mar am" and
 * repairs to "Mural maram", keeping the first space, which data/name-adjudication.json confirms:
 * "Malayalam 'Mural, Priyalam, Mural maram' ('maram' = tree)". Collapsing every space would have
 * produced "Muralmaram", which nothing in the corpus attests.
 *
 * CORROBORATION, AND WHY IT IS PRINTED RATHER THAN COUNTED. Four of the eight repaired spellings
 * already appear in the project's own name data, and two of those are decisive because the correct
 * form sits in the SAME source line as the broken one:
 *
 *   mishreya   data/name-candidates-api.json: "value": "Mi si, Misi, Madhurika"
 *   kakamachi  names.json's own citation: monograph title KAKAMACI ... Sanskrit synonym "Dhvanksamaci"
 *   priyala    the adjudication reason quoted above
 *   patha      "Ambasthaki" attested as a monograph heading in the same source
 *
 * My first corroboration check counted raw substrings and reported "Misi" attested three times when
 * every hit was it sitting inside a longer word. A substring is not evidence of a spelling. The
 * check below matches on word boundaries and prints the surrounding text, because a number cannot
 * be audited and a quotation can. The other four repairs are uncorroborated and are still applied:
 * a one-letter token is not a name in any reading, so the space is the error either way.
 *
 * ONE ENTRY IS NOT A NAME. nagakesara's Urdu slot holds "Stamen consists of anther", which is prose
 * from the monograph's own Stamen description bleeding into the name table. There is nothing to
 * repair; it is removed.
 *
 * TWO ARE LEFT ALONE, AND SAYING SO IS THE POINT. latakaranja's Malayalam "Kazhinch - Kai" has a
 * standalone hyphen, not a broken word, and the rule skips fragments with no letter in them so it
 * cannot absorb a neighbour. amra's Sanskrit "Amrab ijamajja" has its space in the wrong place
 * entirely, between two fragments that are both long enough to be words: the intended form could be
 * "Amra Bijamajja", "Amrabija Majja" or "Amrabijamajja" and the source gives no way to choose, so
 * the data keeps the damaged string and the ANSWER drops the name rather than publish a guess in
 * the sentence a searcher is shown.
 *
 *   node scripts/fix-damaged-names.mjs            report what would change
 *   node scripts/fix-damaged-names.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';
import { answerViolations } from './lib/answer-safety.mjs';

const WRITE = process.argv.includes('--write');
const NAMES = path.join('src', 'data', 'names.json');

/** Where a repaired spelling may be corroborated from. */
const CORPUS = [
  NAMES,
  path.join('data', 'name-verdicts.json'),
  path.join('data', 'name-adjudication.json'),
  path.join('data', 'name-candidates-api.json'),
  path.join('data', 'name-candidates.json'),
].filter((f) => fs.existsSync(f));

/**
 * Join every one or two LETTER fragment to its neighbour, preferring the one on its left.
 *
 * `/[A-Za-z]/.test` is load-bearing: without it a standalone hyphen counts as a fragment and
 * "Kazhinch - Kai" becomes "Kazhinch- Kai", which is a different kind of wrong from where it
 * started. Punctuation is not a broken word.
 */
function repair(name) {
  let parts = name.split(/\s+/).filter(Boolean);
  let changed = true;
  while (changed && parts.length > 1) {
    changed = false;
    for (let i = 0; i < parts.length; i += 1) {
      if (parts[i].length > 2 || !/[A-Za-z]/.test(parts[i])) continue;
      if (i > 0) { parts = [...parts.slice(0, i - 1), parts[i - 1] + parts[i], ...parts.slice(i + 1)]; changed = true; break; }
      if (i < parts.length - 1) { parts = [parts[i] + parts[i + 1], ...parts.slice(i + 2)]; changed = true; break; }
    }
  }
  return parts.join(' ');
}

/** Whole-word occurrences of a spelling, with their context, so the evidence can be read. */
function corroborate(spelling) {
  const rx = new RegExp(`(?<![A-Za-z])${spelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'g');
  const out = [];
  for (const f of CORPUS) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.matchAll(rx)) {
      const ctx = t.slice(Math.max(0, m.index - 80), m.index + spelling.length + 60).replace(/\s+/g, ' ');
      out.push(`${path.basename(f)}: ...${ctx}...`);
    }
  }
  return out;
}

/**
 * IS THIS EVEN A NAME? The repair rule must not run on a string that is not one.
 *
 * My first pass listed the non-names by hand from a survey, and the survey's character class had
 * quietly excluded the very entries that most needed finding. So the dry run proposed repairing
 * herb/durva's Sanskrit "r —" to "r—" and turning nagakesara's "connective and filament; coppery or
 * golden" into "...copperyor golden". Both are debris from the monograph body that landed in a name
 * column, and neither was in my list, because I had built the list from the same blind spot.
 *
 * A guard that states its reasoning is safer than a list that hides it: a name in this corpus has a
 * letter in it, runs to at most three whitespace tokens, and contains no semicolon or dash of the
 * kind the Pharmacopoeia uses for punctuation and blank cells.
 */
const looksLikeAName = (s) => /[A-Za-z]/.test(s)
  && !/[;—–]/.test(s)
  && s.split(/\s+/).filter(Boolean).length <= 3;

/**
 * Debris in a name column, removed rather than repaired. There is nothing here to recover.
 *
 * herb/ketaki's Kashmiri entry is "—", which is how the Pharmacopoeia prints a cell with no name in
 * it, recorded as though the dash were the name. A pattern for blank markers is NOT how these were
 * found, and must not be: a draft of that pattern flagged herb/nili's Bengali and Gujarati "Nil",
 * which is the real name of indigo in both languages and attested by the plain, non-reconstructed
 * Pharmacopoeia source alongside the Hindi नील. It matched only because "nil" is an English word
 * for nothing. Four entries, named individually, each checked.
 */
const NOT_A_NAME = [
  { key: 'herb/durva', lang: 'sa', name: 'r —' },
  { key: 'herb/ketaki', lang: 'ks', name: '—' },
  { key: 'herb/nagakesara', lang: 'ur', name: 'Stamen consists of anther' },
  { key: 'herb/nagakesara', lang: 'ur', name: 'connective and filament; coppery or golden' },
];

/** A name whose intended spacing cannot be recovered, so it is dropped from the answer only. */
const UNRECOVERABLE = [{ key: 'herb/amra', name: 'Amrab ijamajja' }];

const data = JSON.parse(fs.readFileSync(NAMES, 'utf8'));
const repairs = [];
const declined = [];

for (const [key, langs] of Object.entries(data.pages)) {
  for (const [lang, list] of Object.entries(langs)) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const name = entry.name;
      if (typeof name !== 'string' || !/\s/.test(name)) continue;
      if (!looksLikeAName(name)) continue;
      const fixed = repair(name);
      if (fixed === name) continue;
      const siblings = list.filter((e) => e !== entry).map((e) => e.name);
      if (siblings.includes(fixed)) { declined.push([key, lang, name, 'the repaired spelling is already a separate entry']); continue; }
      repairs.push({ key, lang, entry, from: name, to: fixed, evidence: corroborate(fixed) });
    }
  }
}

console.log(`${repairs.length} names repaired, ${NOT_A_NAME.length} removed as not a name, ${UNRECOVERABLE.length} left damaged in the data.\n`);

for (const r of repairs) {
  console.log(`  ${r.key}  ${r.lang}   ${JSON.stringify(r.from)}  ->  ${JSON.stringify(r.to)}`);
  if (r.evidence.length) for (const e of r.evidence.slice(0, 2)) console.log(`      attested  ${e}`);
  else console.log('      uncorroborated: applied because a one-letter token is not a name in any reading');
  console.log();
}
for (const [key, lang, name, why] of declined) console.log(`  DECLINED  ${key} ${lang} ${JSON.stringify(name)}: ${why}`);

// ---- names.json
if (WRITE) {
  for (const r of repairs) {
    r.entry.name = r.to;
    // Provenance in its own key. NameForms.astro prints `sources` verbatim under the names table,
    // so a repair note put there would be published as though it were a source.
    r.entry.repairedFrom = r.from;
  }
  for (const x of NOT_A_NAME) {
    const list = data.pages[x.key]?.[x.lang];
    if (!list) continue;
    const i = list.findIndex((e) => e.name === x.name);
    if (i !== -1) list.splice(i, 1);
    if (!list.length) delete data.pages[x.key][x.lang];
  }
  fs.writeFileSync(NAMES, `${JSON.stringify(data, null, 2)}\n`);
}

// ---- the answer blocks that publish a damaged name
/** Drop one item from an "also called A, B and C" list, keeping the list grammatical. */
function dropFromList(answer, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return answer
    .replace(new RegExp(`${esc}, `), '')
    .replace(new RegExp(`, ${esc}(?= and )`), '')
    .replace(new RegExp(` and ${esc}(?=[.,])`), '')
    .replace(/also called and /, 'also called ');
}

const answerEdits = [];
for (const rel of fs.readdirSync('content')) {
  const dir = path.join('content', rel);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    const file = path.join(dir, f);
    const raw = fs.readFileSync(file, 'utf8');
    const m = /^answer:\s*"(.*?)"\s*$/m.exec(raw);
    if (!m) continue;
    const key = `${rel}/${f.replace(/\.md$/, '')}`;
    let next = m[1];
    for (const r of repairs) if (r.key === key && next.includes(r.from)) next = next.split(r.from).join(r.to);
    for (const u of UNRECOVERABLE) if (u.key === key && next.includes(u.name)) next = dropFromList(next, u.name);
    if (next === m[1]) continue;
    const v = answerViolations(next, { kind: rel });
    if (v.length) { console.log(`  REFUSED ${key}: ${JSON.stringify(v)}`); continue; }
    answerEdits.push([key, m[1], next]);
    if (WRITE) fs.writeFileSync(file, raw.replace(m[0], `answer: "${next}"`));
  }
}

console.log(`\n${answerEdits.length} answer block(s) also updated:`);
for (const [k, before, after] of answerEdits) {
  console.log(`  ${k}`);
  console.log(`    was: ${before.slice(0, 150)}`);
  console.log(`    now: ${after.slice(0, 150)}`);
}

if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
