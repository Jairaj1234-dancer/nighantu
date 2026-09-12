#!/usr/bin/env node
/**
 * Resolve every botanical name on the site against GBIF's taxonomic backbone.
 *
 * Two things come out of one lookup, and the second is the more valuable.
 *
 * The obvious one is data: an accepted name, family, order, taxonomic status and a
 * stable GBIF key, which is a real external identifier other systems already use.
 * That makes the corpus joinable to the rest of the biodiversity web instead of
 * being a closed island of strings.
 *
 * The useful one is verification, free. GBIF reports how it matched: EXACT, FUZZY,
 * HIGHERRANK or NONE. A binomial that only matches fuzzily is probably misspelled;
 * one that matches nothing is probably not a binomial at all. The botanical pass
 * earlier in this project cost a forty-agent workflow, and this re-checks its output
 * deterministically for the price of one HTTP request each. Where GBIF says the name
 * we publish is a synonym, it says what the accepted name is, which is exactly the
 * correction a reference should carry.
 *
 * Nothing here overwrites a page. It records what GBIF says, including when GBIF
 * disagrees with us, and the disagreements are reported rather than silently applied.
 *
 *   node scripts/enrich-taxonomy.mjs [--limit N] [--retry-misses]
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './lib.mjs';
import { resolveAll, saveCache, getJson, RATE } from './lib/enrich.mjs';

const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) ?? '').split('=')[1]) || Infinity;
const RETRY = process.argv.includes('--retry-misses');

/** Every distinct botanical on the site, with the pages that carry it. */
const byName = new Map();
for (const kind of fs.readdirSync('content')) {
  const dir = path.join('content', kind);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const { data } = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    const b = (data.botanical || '').trim();
    if (!b) continue;
    // Some entries are honestly descriptive rather than binomial: a fermented composite
    // preparation names several species and is not itself a taxon. Taking its first two
    // words would ask GBIF about "Fermented grain" and report a miss that is really a
    // category error on our side.
    if (/\b(formulation|composite|mixture|blend|preparation|various|multiple|and others|etc\.?)\b/i.test(b)) continue;
    if ((b.match(/,/g) ?? []).length >= 2) continue;   // a species list, not one name

    // GBIF matches on the name, not the authority string, and authorities are
    // inconsistently transcribed in the source material.
    const query = b.replace(/\s*\(.*?\)\s*/g, ' ').split(/\s+/).slice(0, 2).join(' ');
    if (!/^[A-Z][a-z]+ [a-z-]+$/.test(query)) continue;
    if (!byName.has(query)) byName.set(query, { asPublished: b, pages: [] });
    byName.get(query).pages.push({ kind, slug: data.slug || f.replace(/\.md$/, ''), title: data.title || '' });
  }
}

console.log(`distinct botanicals on the site: ${byName.size}`);

async function lookup(name) {
  const r = await getJson(`https://api.gbif.org/v1/species/match?strict=false&name=${encodeURIComponent(name)}`);
  if (!r.ok) return { status: 'error', error: r.error ?? `http ${r.status}` };
  const d = r.data ?? {};
  if (!d.usageKey || d.matchType === 'NONE') return { status: 'not-found', matchType: d.matchType ?? 'NONE' };
  return {
    status: 'ok',
    gbifKey: d.usageKey,
    scientificName: d.scientificName ?? '',
    canonicalName: d.canonicalName ?? '',
    rank: d.rank ?? '',
    taxonomicStatus: d.status ?? '',
    matchType: d.matchType ?? '',
    confidence: d.confidence ?? null,
    kingdom: d.kingdom ?? '',
    family: d.family ?? '',
    order: d.order ?? '',
    genus: d.genus ?? '',
    // GBIF returns the accepted name when the queried name is a synonym.
    acceptedName: d.accepted ?? '',
    acceptedKey: d.acceptedUsageKey ?? null,
  };
}

/**
 * The match endpoint reports that a name is a synonym but frequently does not say what
 * it is a synonym OF, which is the half a reader actually needs. The species endpoint
 * does. One extra request, only for the names that need it.
 */
async function resolveAccepted(entry) {
  if (entry.status !== 'ok') return entry;
  if (!entry.taxonomicStatus || entry.taxonomicStatus === 'ACCEPTED') return entry;
  if (entry.acceptedName) return entry;

  // Two cases, and getting them the wrong way round returns nothing. If the match
  // endpoint already gave an acceptedUsageKey, that key IS the accepted taxon, so its
  // own scientificName is the answer and it carries no "accepted" field of its own.
  // If it did not, we look up the synonym itself, and that record names its accepted
  // taxon. The first version of this only handled the second case and silently produced
  // an empty accepted name for all 25 synonyms.
  if (entry.acceptedKey) {
    const r = await getJson(`https://api.gbif.org/v1/species/${entry.acceptedKey}`);
    if (!r.ok) return entry;
    const d = r.data ?? {};
    return { ...entry, acceptedName: d.scientificName ?? d.canonicalName ?? '' };
  }

  const r = await getJson(`https://api.gbif.org/v1/species/${entry.gbifKey}`);
  if (!r.ok) return entry;
  const d = r.data ?? {};
  return {
    ...entry,
    acceptedName: d.accepted ?? '',
    acceptedKey: d.acceptedKey ?? null,
  };
}

const { cache, stats } = await resolveAll('gbif', [...byName.keys()], lookup, {
  rateMs: RATE.gbif, retryMisses: RETRY, label: 'GBIF', limit: LIMIT,
});
// Fill in accepted names for the synonyms, which needs a second endpoint.
{
  const needing = Object.entries(cache.entries)
    .filter(([, e]) => e.status === 'ok' && e.taxonomicStatus && e.taxonomicStatus !== 'ACCEPTED' && !e.acceptedName);
  if (needing.length) {
    console.log(`\nresolving accepted names for ${needing.length} synonym(s)`);
    for (const [k, e] of needing) {
      await new Promise((r) => setTimeout(r, RATE.gbif));
      cache.entries[k] = await resolveAccepted(e);
    }
  }
}

saveCache('gbif', cache);

// ------------------------------------------------------------------ report
const rows = [];
for (const [query, info] of byName) {
  const e = cache.entries[query];
  if (!e) continue;
  rows.push({ query, ...info, ...e });
}

const ok = rows.filter((r) => r.status === 'ok');
const exact = ok.filter((r) => r.matchType === 'EXACT');
const fuzzy = ok.filter((r) => r.matchType === 'FUZZY');
const higher = ok.filter((r) => r.matchType === 'HIGHERRANK');
const synonyms = ok.filter((r) => r.taxonomicStatus && r.taxonomicStatus !== 'ACCEPTED');
const notFound = rows.filter((r) => r.status === 'not-found');

console.log(`\nresolved        ${ok.length}`);
console.log(`  exact match   ${exact.length}`);
console.log(`  fuzzy match   ${fuzzy.length}   <- likely misspelled, review`);
console.log(`  higher rank   ${higher.length}   <- matched a genus or family, not a species`);
console.log(`  a synonym     ${synonyms.length}   <- GBIF gives a different accepted name`);
console.log(`not found       ${notFound.length}   <- GBIF knows no such name`);

if (fuzzy.length) {
  console.log('\nfuzzy matches (what we publish -> what GBIF thinks it is):');
  for (const r of fuzzy.slice(0, 12)) console.log(`  ${r.query}  ->  ${r.canonicalName}  (${r.confidence}%)`);
}
if (synonyms.length) {
  console.log('\nsynonyms (we publish a name GBIF treats as superseded):');
  for (const r of synonyms.slice(0, 12)) console.log(`  ${r.query}  [${r.taxonomicStatus}]  ->  ${r.acceptedName || '(no accepted name given)'}`);
}
if (notFound.length) {
  console.log('\nnot found in GBIF:');
  for (const r of notFound.slice(0, 12)) console.log(`  ${r.query}`);
}

// The dataset the site reads. Fuzzy and higher-rank matches are carried with their
// matchType so a page can decline to show a taxonomy it does not trust.
const payload = {
  updatedAt: cache.updatedAt,
  source: 'GBIF Backbone Taxonomy, https://www.gbif.org/dataset/d7dddbf4-2cf0-4f39-9b2a-bb099caae36c',
  summary: {
    botanicals: byName.size, resolved: ok.length, exact: exact.length, fuzzy: fuzzy.length,
    higherRank: higher.length, synonyms: synonyms.length, notFound: notFound.length,
  },
  taxa: rows.sort((a, b) => a.query.localeCompare(b.query)),
};
fs.mkdirSync(path.join('src', 'data'), { recursive: true });
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync(path.join('src', 'data', 'taxonomy.json'), JSON.stringify(payload, null, 1));
fs.writeFileSync(path.join('public', 'taxonomy.json'), JSON.stringify({
  name: 'Age Ayurveda Nighantu taxonomy resolution',
  description: 'Every botanical name used in this reference resolved against the GBIF Backbone '
    + 'Taxonomy, with accepted name, family, order, taxonomic status and GBIF key, and with the '
    + 'match type recorded so a reader can see which identifications are exact and which are not.',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  ...payload,
}, null, 1));
console.log('\nwrote src/data/taxonomy.json and public/taxonomy.json');
