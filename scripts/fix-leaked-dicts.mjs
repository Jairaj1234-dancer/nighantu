#!/usr/bin/env node
/**
 * Render 37 leaked Python dicts as prose, on the four most hazardous pages in the corpus.
 *
 * WHAT A READER CURRENTLY SEES, live, on /herb/vatsanabha/:
 *
 *   Recent safety updates {'type': 'Poisoning case', 'detail': '2025: Mass poisoning event from
 *   mislabelled aconite spice product - 11 patients hospitalized with onset within minutes.
 *   Perioral paraesthesia was the hallmark symptom (91% of cases). All survived with aggressive
 *   supportive care.'}
 *
 * Ingest serialised a structure into prose and nothing caught it. It is confined to four pages and
 * they are the four that matter most: vatsanabha (aconite), bhanga (cannabis), jayapala (croton)
 * and ahiphena (opium). Every one is tagged safety-concern and pharmacopoeia-listed.
 *
 * THE CONTENT IS GOOD AND IS KEPT WHOLE. These are real poisoning case reports, including a fatal
 * paediatric case and a 2025 mass poisoning from a mislabelled spice product. Exactly the material
 * a reference work should carry on a plant poison. Only the format is wrong, so this is a
 * transformation and not a deletion: no sentence is dropped.
 *
 * TWO SHAPES, WHICH IS ALL THERE ARE:
 *   {'type': 'Poisoning case', 'detail': '...'}   23 of them, under "Recent safety updates"
 *   {'use': 'Antipyretic (Jvarahara)', 'validation': '...'}   10, under the traditional-uses heading
 *
 * THE ANSWER BLOCK IS TREATED DIFFERENTLY FROM THE BODY, deliberately, and that is this site's own
 * rule rather than a new one. lib/answer-safety.mjs bars a dose or a disease claim from the answer
 * while allowing both in the body, because the body keeps its framing heading and the answer is
 * what a search result shows. So a use/validation dict in the body becomes prose under the heading
 * "Which traditional uses are supported by research?", which is reporting literature. The same dict
 * in the answer field is removed entirely and replaced with identity, because
 * "{'use': 'Analgesic and pain management', 'validation': 'Morphine remains the gold standard
 * analgesic'}" as the meta description of an opium page is not reporting, it is advertising.
 *
 *   node scripts/fix-leaked-dicts.mjs            report
 *   node scripts/fix-leaked-dicts.mjs --write    apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { answerViolations } from './lib/answer-safety.mjs';

const WRITE = process.argv.includes('--write');
const PAGES = ['vatsanabha', 'bhanga', 'jayapala', 'ahiphena'];

/**
 * A value in either quote style. jayapala uses double quotes for one value because the content has
 * an apostrophe ("Croton oil's powerful purgative action"), so a single-quote-only parser drops it.
 */
const VAL = `(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")`;
const TYPE_DETAIL = new RegExp(`\\{\\s*'type'\\s*:\\s*${VAL}\\s*,\\s*'detail'\\s*:\\s*${VAL}\\s*\\}`, 'g');
const USE_VALID = new RegExp(`\\{\\s*'use'\\s*:\\s*${VAL}\\s*,\\s*'validation'\\s*:\\s*${VAL}\\s*\\}`, 'g');

const unescape = (s) => String(s ?? '').replace(/\\(['"\\])/g, '$1').trim();
const tidy = (s) => {
  const t = unescape(s);
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/** Identity-only answers, built from each page's own title, binomial and classical synonyms. */
const ANSWERS = {
  vatsanabha: 'Vatsanabha (Aconitum ferox) is a plant drug, also called Sthavaravisha, Vatsanagaka '
    + 'and Bachhnaag in Hindi. Sthavaravisha names it as a plant poison, and the Ayurvedic texts '
    + 'require shodhana, purificatory processing, before any use. This page records documented '
    + 'poisoning cases; read its cautions before anything else on it.',
  bhanga: 'Bhanga (Cannabis sativa, Cannabis indica) is a plant drug, also called Vijaya and Ganja '
    + 'in Hindi. It is a controlled substance in most jurisdictions and its legal status governs '
    + 'whether it may be supplied at all. This page records documented poisoning cases, including '
    + 'from synthetic cannabinoid adulteration; read its cautions before anything else on it.',
  jayapala: 'Jayapala (Croton tiglium) is a plant drug, also called Mukula and Jamalgota in Hindi. '
    + 'It is one of the drastic purgatives of the classical materia medica and the Ayurvedic texts '
    + 'require shodhana, purificatory processing, before any use. This page records documented '
    + 'poisoning cases; read its cautions before anything else on it.',
  ahiphena: 'Ahiphena (Papaver somniferum) is a plant drug, also called Ahiphenam, Afima and '
    + 'Khashkhash. It is the opium poppy and a controlled substance in most jurisdictions. This '
    + 'page records documented poisoning cases, including a fatal paediatric one; read its cautions '
    + 'before anything else on it.',
};

let dicts = 0;
let answers = 0;
const refused = [];

for (const slug of PAGES) {
  const file = path.join('content', 'herb', `${slug}.md`);
  const raw = fs.readFileSync(file, 'utf8');
  const split = /^(---\n[\s\S]*?\n---\n)([\s\S]*)$/.exec(raw);
  if (!split) { refused.push([slug, 'frontmatter did not parse']); continue; }
  let [, front, body] = split;

  // --- the answer field: identity only, the dict removed rather than reformatted
  const am = /^answer:\s*"(.*?)"\s*$/m.exec(front);
  if (am && ANSWERS[slug]) {
    const v = answerViolations(ANSWERS[slug]);
    if (v.length) { refused.push([slug, `replacement answer violates: ${JSON.stringify(v)}`]); continue; }
    if (ANSWERS[slug].includes('"')) { refused.push([slug, 'quote would break frontmatter']); continue; }
    front = front.replace(am[0], `answer: "${ANSWERS[slug]}"`);
    answers += 1;
  }

  // --- the body: every dict becomes a labelled sentence, content intact
  const before = body;
  body = body.replace(TYPE_DETAIL, (_m, t1, t2, d1, d2) => {
    dicts += 1;
    return `**${unescape(t1 ?? t2)}.** ${tidy(d1 ?? d2)}`;
  });
  body = body.replace(USE_VALID, (_m, u1, u2, v1, v2) => {
    dicts += 1;
    return `**${unescape(u1 ?? u2)}.** ${tidy(v1 ?? v2)}`;
  });

  const left = (body.match(/\{\s*'[a-z_]+'\s*:/g) ?? []).length;
  if (left) refused.push([slug, `${left} dict(s) still unparsed, shape not recognised`]);

  console.log(`  ${slug.padEnd(12)} body dicts converted, ${left} left, answer ${am ? 'replaced' : 'absent'}`);
  if (WRITE && body !== before) fs.writeFileSync(file, `${front}${body}`);
  else if (WRITE) fs.writeFileSync(file, `${front}${body}`);
}

console.log(`\n${dicts} dicts rendered as prose across ${PAGES.length} pages, ${answers} answers replaced.`);
if (refused.length) {
  console.log('\nREFUSED:');
  for (const [s, why] of refused) console.log(`   ${s}: ${why}`);
  process.exitCode = 1;
}
if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
