#!/usr/bin/env node
/**
 * Fill the empty `family` field on monographs whose taxon is already resolved.
 *
 * src/data/taxonomy.json resolves this site's taxa against GBIF and records the family. Hundreds of
 * monographs carry an empty `family` field anyway, so the fact is in the repository and absent from
 * the pages that are about it.
 *
 * WHAT THE FIELD ACTUALLY FEEDS, checked rather than assumed. I first justified this pass by saying
 * those pages were missing from their own family hub. That was WRONG: src/pages/family/index.astro
 * calls familyGroups(taxonomy) and derives membership from taxonomy.json directly, so the hubs have
 * always listed them. The real consumers are the two surfaces this project exists to serve:
 *
 *   [slug].jsonld.ts  emits it as `botanicalFamily` inside additionalProperty, and that array is
 *                     filtered on truthiness, so an empty family is simply absent from the
 *                     structured data an answer engine reads.
 *   [slug].md.ts      emits it as the `Family` row of the markdown twin, which is the copy written
 *                     for machine readers.
 *   answer.mjs        composes "from the X family" into the answer block, which is the meta
 *                     description.
 *
 * So the gap is in the structured data and the machine-readable copy, which is worse than a missing
 * hub listing, not better.
 *
 * THE JOIN IS taxonomy.json's OWN `pages` ARRAY, not a botanical-name string match. Each taxon
 * records which pages carry it, which is the join families.ts already trusts, and it avoids every
 * normalisation question about "Aloe barbadensis Mill. (syn. Aloe vera (L.) Burm.f.)" matching
 * anything at all.
 *
 * ONLY status ok AND matchType EXACT, which is the same bar families.ts sets before it will file a
 * page under a family. A fuzzy taxonomic match is a guess about which plant the page is about, and
 * filing a monograph under the wrong family is exactly the error a botanical reference may not
 * make. lib/families.ts states the reason: an approximation silently filed under a family reads to
 * a reader as a fact.
 *
 * IT WILL NOT OVERWRITE. A page with a family already set keeps it, including the richer
 * parenthetical forms like "Fabaceae (Leguminosae)" and "Lamiaceae (formerly Verbenaceae)" that
 * carry information GBIF's accepted name does not.
 *
 *   node scripts/backfill-family.mjs            report what would change
 *   node scripts/backfill-family.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');

const taxonomy = JSON.parse(fs.readFileSync(path.join('src', 'data', 'taxonomy.json'), 'utf8'));

const filled = [];
const skipped = { 'family already set': 0, 'page file not found': 0, 'no family field in frontmatter': 0 };
const refused = [];
let taxaUsed = 0;

/**
 * A GENUS-RANK MATCH DETERMINES THE FAMILY, and that is a taxonomic fact rather than a tolerance.
 *
 * lib/families.ts takes EXACT matches only, and its comment gives the reason: "A fuzzy or
 * higher-rank match is an approximation, and an approximation silently filed under a family reads
 * to a reader, and to anything parsing the page, as a determination." That is right about FUZZY and
 * it collapses two different things.
 *
 *   FUZZY             GBIF guessed which name was meant, so WHICH ORGANISM is uncertain, and
 *                     therefore so is its family. Excluded here, all 1 of it.
 *   HIGHERRANK, GENUS the genus matched and the species epithet did not. The genus is determined,
 *                     and family membership is a property of the genus, so the family is determined
 *                     even though the species is not.
 *
 * The three cases all show it. khadira's "Acacia catechu" resolves to Senegalia because the species
 * was reassigned, and Acacia and Senegalia are both Fabaceae. rudraksha's "Elaeocarpus ganitrus"
 * resolves to Elaeocarpus, Elaeocarpaceae. vathada's "Prunus dulcis", the almond, resolves to
 * Prunus, Rosaceae. In each one the family is invariant across the whole genus, which is the actual
 * test: not whether the match was exact, but whether the answer depends on the part that did not
 * match.
 *
 * THE FAMILY HUBS ARE DELIBERATELY NOT WIDENED TO MATCH, and the reason is presentational rather
 * than taxonomic. A hub promises "Ayurvedic dravyas in <family>, with their accepted binomials",
 * and renders `t.canonicalName || t.query`. For a genus-rank match that is "Senegalia", a genus
 * where a binomial is promised. So these three pages will state a family that their family hub does
 * not list them under. That is a real inconsistency and it is the conservative direction: the page
 * asserts a fact it can support, and the hub omits an entry it cannot present honestly. Withholding
 * a determinable family from the structured data to keep a listing tidy would be the worse trade.
 */
const familyIsDetermined = (t) => t.status === 'ok' && Boolean(t.family)
  && (t.matchType === 'EXACT' || (t.matchType === 'HIGHERRANK' && t.rank === 'GENUS'));

for (const t of taxonomy.taxa ?? []) {
  if (!familyIsDetermined(t)) continue;
  const family = String(t.family).trim();
  if (!family) continue;
  let usedThis = false;

  for (const p of t.pages ?? []) {
    const file = path.join('content', p.kind, `${p.slug}.md`);
    if (!fs.existsSync(file)) { skipped['page file not found'] += 1; continue; }
    const raw = fs.readFileSync(file, 'utf8');
    const m = /^family:\s*"([^"]*)"\s*$/m.exec(raw);
    if (!m) { skipped['no family field in frontmatter'] += 1; continue; }
    if (m[1].trim()) { skipped['family already set'] += 1; continue; }

    if (family.includes('"')) { refused.push([`${p.kind}/${p.slug}`, 'family name contains a quote']); continue; }
    const next = raw.replace(m[0], `family: "${family}"`);
    if (next === raw) { refused.push([`${p.kind}/${p.slug}`, 'substitution made no change']); continue; }

    filled.push({ page: `${p.kind}/${p.slug}`, family, binomial: t.canonicalName ?? t.scientificName ?? t.query });
    usedThis = true;
    if (WRITE) fs.writeFileSync(file, next);
  }
  if (usedThis) taxaUsed += 1;
}

const byFamily = {};
for (const f of filled) byFamily[f.family] = (byFamily[f.family] || 0) + 1;
const byKind = {};
for (const f of filled) { const k = f.page.split('/')[0]; byKind[k] = (byKind[k] || 0) + 1; }

console.log(`${filled.length} family fields filled from ${taxaUsed} GBIF-resolved taxa.`);
console.log(`by collection: ${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')}`);
console.log(`${Object.keys(byFamily).length} distinct families.\n`);

for (const f of filled.slice(0, 20)) {
  console.log(`  ${f.page.padEnd(30)} ${String(f.binomial).slice(0, 36).padEnd(38)} ${f.family}`);
}
if (filled.length > 20) console.log(`  ... and ${filled.length - 20} more`);

console.log('\nmost common families filled:');
for (const [fam, n] of Object.entries(byFamily).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`   ${String(n).padStart(3)}  ${fam}`);
}
console.log('\nnot touched:');
for (const [why, n] of Object.entries(skipped)) if (n) console.log(`   ${String(n).padStart(4)}  ${why}`);
if (refused.length) {
  console.log('\nREFUSED:');
  for (const [k, why] of refused) console.log(`   ${k}  ${why}`);
}
if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
