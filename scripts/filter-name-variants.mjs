#!/usr/bin/env node
/**
 * Filter agent-proposed formulation name variants before any of them reaches PubMed.
 *
 * THE DIVISION OF LABOUR THIS ENFORCES. A workflow of 13 agents proposed 142 alternate spellings
 * for 67 formulation pages that deterministic querying found no literature for, and an audit phase
 * with an explicit bias toward rejection removed 7. Those 7 were well judged: a dosage-form swap
 * (Rasayana to Avaleha), the coarse powder mistaken for the decoction, a different herb group, an
 * ambiguous English translation, and the "-adya" element that names a separate formulary entry.
 *
 * It still passed three things it should not have, and one of them was dangerous. So this exists:
 * judgement proposes, and deterministic rules with access to the actual corpus decide.
 *
 *   node scripts/filter-name-variants.mjs --in variants.json --out names.json
 *
 * Input: { "Formulation Title": ["Variant", ...], ... }
 * Output: { "formulation/slug": ["Variant", ...], ... } ready for formulation-research --names
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk, parseFrontmatter } from './lib.mjs';

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const IN = argOf('--in', null);
const OUT = argOf('--out', null);
if (!IN || !fs.existsSync(IN)) {
  console.error('Pass --in <file> with { "Title": ["variant", ...] }.');
  process.exit(1);
}

const FORM_WORDS = new Set([
  'churna', 'choorna', 'curna', 'churnam', 'choornam', 'vati', 'vatika', 'bati', 'gutika',
  'gulika', 'taila', 'tailam', 'thailam', 'thaila', 'ghrita', 'ghritam', 'ghrta', 'ghrit',
  'ghrutham', 'kashayam', 'kashaya', 'kwath', 'kwatha', 'kwatham', 'kvatha', 'qwath',
  'arishta', 'arista', 'arishtam', 'asava', 'asavam', 'asav', 'avaleha', 'leham', 'rasayana',
  'rasayanam', 'guggulu', 'guggul', 'bhasma', 'lepa', 'arka', 'svarasa', 'swarasa', 'swaras',
  'khanda', 'mandura', 'parpati', 'malahara', 'oil', 'ghee', 'powder', 'tablet', 'keram',
  'kuzhambu',
]);

const sq = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');
const words = (s) => String(s ?? '').toLowerCase().replace(/[^a-z\s]/g, ' ').trim().split(/\s+/).filter(Boolean);

// ---------------------------------------------------------------- the corpus, as ground truth
const byTitle = new Map();
const pages = [];
for (const rel of walk('content')) {
  if (rel.split(path.sep)[0] !== 'formulation') continue;
  const slug = path.basename(rel, '.md');
  const { data } = parseFrontmatter(fs.readFileSync(path.join('content', rel), 'utf8'));
  const title = data.title ?? slug;
  pages.push({ slug, title });
  byTitle.set(sq(title), slug);
}

/**
 * RULE 1: a variant that is another page's title is refused, whatever the truth about the drugs.
 *
 * This is the one the audit got wrong and it is the dangerous one. It accepted
 * "Amalaka Rasayana" -> "Amalaki Rasayana", judging it a respelling. "Amalaki Rasayana" is a
 * SEPARATE PAGE on this site holding ten papers, so using that variant would import one page's
 * literature onto another's.
 *
 * The rule holds either way the underlying question falls, which is why it is a rule rather than a
 * judgement. If the two pages really are one drug, the correct remedy is an alias declaration in
 * src/data/duplicates.json, which consolidates the canonical and leaves the citations where they
 * were earned; it is not cross-attribution of papers. If they are different drugs, cross-matching
 * is a false citation. Refuse, and flag the pair for alias review.
 *
 * It also catches the Hingvashtak/Hingwashtak pair proposing each other, which is harmless but
 * redundant: they are already aliases and the primary finds its own literature.
 */
function collidesWithAnotherPage(ownTitle, variant) {
  const hit = byTitle.get(sq(variant));
  return hit && sq(variant) !== sq(ownTitle) ? hit : null;
}

/**
 * RULE 2: swapping the dosage-form word is refused.
 *
 * The audit applied this correctly to "Lavangadi Vati" -> "Lavangadi Gutika" and then passed
 * "Chitrakadi Vati" -> "Chitrakadi Gutika", which is the same transformation. Vati, Gutika and
 * Gulika are synonyms in general usage and NOT interchangeable as formulary entry names: distinct
 * preparations exist under each across the Bhaishajya Ratnavali, the Sharngadhara Samhita and the
 * Kerala tradition.
 *
 * Orthographic variants of one form word are fine, because they are spelling: tailam/thailam/taila,
 * kashayam/kashaya, churna/choorna. Those share a stem; vati and gutika do not.
 */
const FORM_FAMILIES = [
  ['taila', 'tailam', 'thailam', 'thaila'],
  ['kashayam', 'kashaya', 'kwath', 'kwatha', 'kwatham', 'kvatha', 'qwath'],
  ['churna', 'choorna', 'curna', 'churnam', 'choornam'],
  ['ghrita', 'ghritam', 'ghrta', 'ghrit', 'ghrutham'],
  ['vati', 'vatika', 'bati'],
  ['gutika', 'gulika'],
  ['arishta', 'arista', 'arishtam'],
  ['asava', 'asavam', 'asav'],
  ['rasayana', 'rasayanam'],
  ['guggulu', 'guggul'],
  ['svarasa', 'swarasa', 'swaras'],
];
const familyOf = (w) => FORM_FAMILIES.findIndex((f) => f.includes(w));

function swapsTheFormWord(ownTitle, variant) {
  const a = words(ownTitle);
  const b = words(variant);
  const fa = a.filter((w) => FORM_WORDS.has(w));
  const fb = b.filter((w) => FORM_WORDS.has(w));
  if (!fa.length || !fb.length) return null;
  const ia = familyOf(fa[fa.length - 1]);
  const ib = familyOf(fb[fb.length - 1]);
  if (ia === -1 || ib === -1) return null;
  return ia === ib ? null : `${fa[fa.length - 1]} -> ${fb[fb.length - 1]}`;
}

/**
 * RULE 3: dropping the dosage-form word entirely is refused.
 *
 * "Agastya Haritaki Rasayana" -> "Agastya Haritaki" and "Agnitundi Vati" -> "Agnitundi" are not
 * respellings, they are broader searches. A bare stem matches every preparation built on it, and
 * Agnitundi Rasa is a different drug from Agnitundi Vati. The page's own title query already finds
 * any paper that names the full form, because the name check is a containment test, so the
 * truncation adds reach only in the direction of the wrong drug.
 *
 * SANDHI IS NOT TRUNCATION, and the first version of this rule got that wrong. It rejected
 * "Ajamoda Arka" -> "Ajamodarka", which is the ordinary Sanskrit compound of exactly those two
 * words: ajamoda + arka. The form word is still present, fused rather than dropped, and splitting
 * on whitespace cannot see it. So the test is made on the squashed string, where "ajamodarka" still
 * contains "arka", instead of on the word list.
 */
function dropsTheFormWord(ownTitle, variant) {
  const a = words(ownTitle);
  const hadForm = a.filter((w) => FORM_WORDS.has(w));
  if (!hadForm.length) return false;
  const vs = sq(variant);
  // Present as a whole word, or fused into a compound: either way it has not been dropped.
  const stillThere = words(variant).some((w) => FORM_WORDS.has(w))
    || hadForm.some((w) => vs.includes(sq(w)))
    || FORM_FAMILIES.some((fam) => fam.some((w) => hadForm.includes(w))
      && fam.some((w) => vs.includes(sq(w))));
  return !stillThere && vs.length < sq(ownTitle).length;
}

// ---------------------------------------------------------------- apply
const input = JSON.parse(fs.readFileSync(IN, 'utf8'));
const out = {};
const refused = [];
let kept = 0;

for (const [title, variants] of Object.entries(input)) {
  const slug = byTitle.get(sq(title));
  if (!slug) { refused.push({ title, variant: '(whole page)', rule: 'no page with this title' }); continue; }
  const ok = [];
  for (const v of (Array.isArray(variants) ? variants : [])) {
    const clash = collidesWithAnotherPage(title, v);
    if (clash) { refused.push({ title, variant: v, rule: `collides with page ${clash}` }); continue; }
    const swap = swapsTheFormWord(title, v);
    if (swap) { refused.push({ title, variant: v, rule: `swaps the dosage form (${swap})` }); continue; }
    if (dropsTheFormWord(title, v)) { refused.push({ title, variant: v, rule: 'drops the dosage form' }); continue; }
    ok.push(v);
  }
  if (ok.length) { out[`formulation/${slug}`] = ok; kept += ok.length; }
}

const proposed = Object.values(input).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
console.log(`proposed ${proposed} variants across ${Object.keys(input).length} names`);
console.log(`refused  ${refused.length}`);
console.log(`kept     ${kept} across ${Object.keys(out).length} pages\n`);
for (const r of refused) console.log(`  ${r.title}  ->  "${r.variant}"\n      ${r.rule}`);

if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`\nWrote ${OUT}`);
}
