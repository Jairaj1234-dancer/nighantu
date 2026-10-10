#!/usr/bin/env node
/**
 * Replace the answer block's filler opener on committed pages, using names this site already holds.
 *
 * WHAT WAS WRONG. 336 of the 802 answer blocks on this site, 42%, opened with "is a plant used in
 * Ayurveda". scripts/answer.mjs writes that when a page has no `Ayurvedic Category`, which is true
 * of every one of them. The answer block is three things at once: the passage a reader sees first,
 * the passage an answer engine is most likely to lift verbatim, and the meta description Google
 * shows in a result. So the filler is not cosmetic. It is the sentence a searcher is shown.
 *
 * /herb/kapikachhu/ is the measured cost. It is the highest-demand page on this site, 236
 * impressions in a month on the bare query "kapikachhu", at position 13.0, with ZERO clicks, and
 * its description read "Kapikachhu (Mucuna pruriens) is a plant used in Ayurveda." followed by
 * decarboxylase-inhibitor pharmacokinetics. It passes every safety check: it is not unsafe, it is
 * useless.
 *
 * WHY A REPAIR AS WELL AS A GENERATOR FIX. answer.mjs now says "is a plant drug" and takes the
 * classical names, but ingest only runs where ATLAS_VAULT is set, and the committed pages are the
 * published site. Same division as the mineral-placeholder repair.
 *
 * NOTHING IS INVENTED. The replacement is built only from the page's own `family` field and from
 * src/data/names.json, which held Sanskrit and Hindi forms for 251 of these pages and was being
 * used by none of them. A page with neither is left exactly as it is: 47 of the 336, and a filler
 * opener is better than a fabricated one.
 *
 *   node scripts/fix-generic-answers.mjs            report what would change
 *   node scripts/fix-generic-answers.mjs --write    apply it
 *   node scripts/fix-generic-answers.mjs --limit 5  a small slice, for inspection
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk } from './lib.mjs';
import { answerViolations } from './lib/answer-safety.mjs';

const WRITE = process.argv.includes('--write');
const li = process.argv.indexOf('--limit');
const LIMIT = li === -1 ? Infinity : Number(process.argv[li + 1]);

const GENERIC = /\bis a (?:plant|herb|substance|drug) used in Ayurveda\b/;
const names = JSON.parse(fs.readFileSync(path.join('src', 'data', 'names.json'), 'utf8')).pages ?? {};

/**
 * IAST to the letters a person types.
 *
 * names.json stores Devanagari and IAST with diacritics. A meta description exists to be matched
 * against what someone typed into a search box, and nobody types "ātmaguptā". The plain form is
 * what belongs here; the diacritical form stays in the names table on the page, where precision is
 * the point.
 */
const PLAIN = {
  ā: 'a', ī: 'i', ū: 'u', ṛ: 'ri', ṝ: 'ri', ḷ: 'li', ṃ: 'm', ṁ: 'm', ḥ: 'h',
  ṭ: 't', ḍ: 'd', ṇ: 'n', ś: 's', ṣ: 's', ñ: 'n', ṅ: 'n', ĕ: 'e', ŏ: 'o',
};
const plain = (s) => [...String(s)].map((c) => PLAIN[c] ?? PLAIN[c.toLowerCase()] ?? c).join('');
const title = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

const changed = [];
const skipped = [];
const refused = [];

for (const rel of walk('content')) {
  if (rel.split(path.sep)[0] !== 'herb') continue;
  const file = path.join('content', rel);
  const raw = fs.readFileSync(file, 'utf8');
  const m = /^answer:\s*"(.*?)"\s*$/m.exec(raw);
  if (!m || !GENERIC.test(m[1])) continue;
  if (changed.length >= LIMIT) break;

  const slug = path.basename(rel, '.md');
  const key = `herb/${slug}`;
  const pageTitle = (/^title:\s*"([^"]+)"/m.exec(raw) ?? [, slug])[1];

  // Classical names, plain-spelled, excluding any that is just the title again.
  const entry = names[key] ?? {};
  const alsoCalled = [];
  for (const lang of ['sa', 'hi']) {
    for (const e of entry[lang] ?? []) {
      const v = plain(e.iast || e.name || '').trim();
      if (!v || !/^[A-Za-z][A-Za-z .'-]*$/.test(v)) continue;
      if (squash(v) === squash(pageTitle)) continue;
      if (alsoCalled.some((x) => squash(x) === squash(v))) continue;
      alsoCalled.push(title(v));
    }
  }
  /**
   * A PLACEHOLDER IS NOT A FAMILY. The `family` field carries literal "Unknown" on some pages, and
   * the first run of this composed "Nikochaka (Alangium salviifolium) is a plant drug, from the
   * Unknown family", which states a non-fact in the sentence a searcher is shown. Exactly the
   * error class this whole pass exists to remove, reintroduced by the fix for it.
   */
  const famRaw = (/^family:\s*"([^"]+)"/m.exec(raw) ?? [, ''])[1].trim();
  const family = /^(unknown|n\/?a|none|tbd|-{1,2}|\?)$/i.test(famRaw) ? '' : famRaw;

  if (!family && !alsoCalled.length) {
    skipped.push([key, 'no family and no classical names: a filler opener beats an invented one']);
    continue;
  }

  // Rewrite only the opener. Everything else the answer says is left alone, with one exception
  // below: a family clause already in the text that names a placeholder rather than a family.
  let next = m[1].replace(GENERIC, 'is a plant drug');
  /**
   * STRIP a pre-existing placeholder family clause as well as declining to add one.
   *
   * The first run left "Nikochaka (Alangium salviifolium) is a plant drug, also called Ankolah,
   * Akola and Nikocaka, from the Unknown family." The guard stopped this script ADDING that clause
   * and did nothing about the one already in the sentence, which the generator had written from the
   * same placeholder. Declining to introduce a non-fact is not the same as removing it.
   */
  next = next.replace(/,?\s*from the (?:unknown|n\/?a|none|tbd)\s+family/gi, '');
  const clause = [];
  /**
   * A PLAIN STRING TEST, not a regex, because the family name is data and data is not a pattern.
   * "Asteraceae (Compositae)" interpolated into a regex compiles its parentheses as a capture
   * group, so the guard never matched and the clause would have been written twice: "is a plant
   * drug, from the Asteraceae (Compositae) family, also called ..., from the Asteraceae
   * (Compositae) family." Caught in the dry run, which is what the dry run is for.
   */
  if (family && !next.toLowerCase().includes(`${family.toLowerCase()} family`)) {
    clause.push(`from the ${family} family`);
  }
  if (alsoCalled.length) {
    const list = alsoCalled.slice(0, 3);
    clause.push(`also called ${list.length > 1
      ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
      : list[0]}`);
  }
  if (clause.length) {
    next = next.replace(/is a plant drug/, `is a plant drug, ${clause.join(', ')}`);
  }

  /**
   * REFUSE RATHER THAN PUBLISH A FAULT. answerViolations catches a dose or a disease claim in the
   * answer block, and this edit must not introduce either. It should not be able to, since it only
   * rewrites an opener from names and a family, but "should not be able to" is how the four false
   * measurements of this project happened.
   */
  const v = answerViolations(next);
  if (v.length) { refused.push([key, JSON.stringify(v)]); continue; }
  if (next.includes('"')) { refused.push([key, 'quote in the composed answer would break frontmatter']); continue; }

  changed.push([key, m[1], next]);
  if (WRITE) fs.writeFileSync(file, raw.replace(m[0], `answer: "${next}"`));
}

console.log(`${changed.length} answers rewritten, ${skipped.length} left alone, ${refused.length} refused.\n`);
for (const [k, before, after] of changed.slice(0, 6)) {
  console.log(`  ${k}`);
  console.log(`    was: ${before.slice(0, 150)}`);
  console.log(`    now: ${after.slice(0, 150)}`);
  console.log();
}
if (refused.length) {
  console.log('REFUSED, nothing written for these:');
  for (const [k, why] of refused) console.log(`   ${k}  ${why}`);
}
if (skipped.length) console.log(`\n${skipped.length} skipped for want of grounded data, which is the right outcome.`);
if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
