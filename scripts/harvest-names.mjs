#!/usr/bin/env node
/**
 * Harvest candidate Indic name forms for herb monographs from Wikidata.
 *
 * Why this exists. Every one of the 648 content pages carries an empty `sanskrit` field, no
 * Devanagari anywhere, and in most cases a "Names and identification" table with a single
 * English row. Readers are already arriving on queries that ask for exactly what is missing:
 * a name in Hindi, Tamil or Sanskrit, or a garbled transliteration of a name someone heard
 * spoken and could not spell.
 *
 * Why Wikidata. src/data/taxonomy.json already resolves 269 of 285 taxa to Wikidata items,
 * so the join keys exist and cost nothing. Wikidata labels and aliases are CC0, retrievable,
 * and attributable to a stable item id, which means a name on one of our pages can be traced
 * back to something a reader can check.
 *
 * WHAT THIS SCRIPT DOES NOT DO, and the reason it matters most.
 *
 * It does not publish. It writes candidates to data/name-candidates.json and nothing else
 * reads that file. Wikidata's vernacular names for plants are genuinely unreliable: in a
 * twelve-item sample it listed `अश्वत्थः` as a Sanskrit alias for both Adhatoda vasica and
 * Aegle marmelos, when aśvattha is Ficus religiosa and neither of those. Importing that in
 * bulk would put botanical misidentifications onto monographs whose entire value is botanical
 * precision. Every candidate has to be corroborated against a second, named source before it
 * reaches a page. That is workflows/verify-names.js.
 *
 * The IAST column is generated mechanically from the Devanagari and is therefore safe: see
 * scripts/lib/devanagari.mjs for why transliterating a string asserts nothing new, while
 * claiming the string is a name for a given plant asserts a great deal.
 *
 *   node scripts/harvest-names.mjs              # harvest all linked taxa
 *   node scripts/harvest-names.mjs --limit 40   # a small slice, for checking the shape
 */
import fs from 'node:fs';
import path from 'node:path';
import { toIAST, asciiKey } from './lib/devanagari.mjs';

const TAXONOMY = path.join('src', 'data', 'taxonomy.json');
const OUT = path.join('data', 'name-candidates.json');

// Only the languages with demonstrated demand in the search data. Adding more is one entry
// here, but each one multiplies the verification pass, and an unverified name is worse than
// an absent one on a reference page.
const LANGS = { hi: 'Hindi', sa: 'Sanskrit', ta: 'Tamil' };

const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i === -1 ? Infinity : Number(process.argv[i + 1]);
})();

const UA = 'nighantu-name-harvest/1.0 (https://nighantu.ageayurveda.com/; reference encyclopedia)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchEntities(ids) {
  const url = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams({
    action: 'wbgetentities',
    ids: ids.join('|'),
    props: 'labels|aliases',
    languages: Object.keys(LANGS).join('|'),
    format: 'json',
    formatversion: '2',
  });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let res;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      /**
       * A THROWN FETCH IS THE SAME EVENT AS A 503, and this retry loop used to handle only one of
       * them. scripts/gsc-coverage.mjs lost a 1,239-call run to exactly this: it retried HTTP
       * status codes and let a `read ETIMEDOUT` throw straight out of the loop and kill the
       * process. The shape of the bug is a retry loop that believes failure only arrives with a
       * status attached.
       */
      if (attempt === 3) throw new Error(`wikidata network: ${e.cause?.code ?? e.message}`);
      await sleep(attempt * 2000);
      continue;
    }
    if (res.ok) {
      const json = await res.json();
      if (json.error) throw new Error(`wikidata: ${json.error.info ?? 'unknown error'}`);
      return json.entities ?? {};
    }
    // 429 and 5xx are worth retrying; a 400 means a malformed batch and will not improve.
    if (res.status < 500 && res.status !== 429) throw new Error(`wikidata HTTP ${res.status}`);
    await sleep(attempt * 2000);
  }
  throw new Error('wikidata: three attempts failed');
}

const taxonomy = JSON.parse(fs.readFileSync(TAXONOMY, 'utf8'));

// One Wikidata item can back several pages: a species whose root and leaf are separate
// monographs, or an accepted name our pages reach by two synonyms. Keep every page.
const linked = taxonomy.taxa
  .filter((t) => t.wikidata && Array.isArray(t.pages) && t.pages.length)
  .slice(0, LIMIT);

console.log(`${linked.length} taxa with a Wikidata item, of ${taxonomy.taxa.length} total`);

const batches = [];
for (let i = 0; i < linked.length; i += 50) batches.push(linked.slice(i, i + 50));

const entities = {};
for (const [i, batch] of batches.entries()) {
  process.stdout.write(`  batch ${i + 1}/${batches.length} (${batch.length} ids)\r`);
  Object.assign(entities, await fetchEntities(batch.map((t) => t.wikidata)));
  if (i < batches.length - 1) await sleep(400);
}
console.log(`\nfetched ${Object.keys(entities).length} Wikidata items`);

/** Label plus every alias, in one language, deduplicated and order-preserved. */
function formsFor(entity, lang) {
  const out = [];
  const seen = new Set();
  const push = (v) => {
    const t = String(v ?? '').trim();
    if (!t) return;
    const k = `${t}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  push(entity?.labels?.[lang]?.value);
  for (const a of entity?.aliases?.[lang] ?? []) push(a.value);
  return out;
}

const candidates = [];
const perPage = new Map();

for (const taxon of linked) {
  const entity = entities[taxon.wikidata];
  if (!entity) continue;

  for (const page of taxon.pages) {
    for (const [lang, langName] of Object.entries(LANGS)) {
      for (const name of formsFor(entity, lang)) {
        const iast = toIAST(name);
        const key = `${page.kind}/${page.slug}|${lang}|${asciiKey(iast || name)}`;
        if (perPage.has(key)) continue;
        perPage.set(key, true);
        candidates.push({
          kind: page.kind,
          slug: page.slug,
          title: page.title,
          botanical: taxon.canonicalName ?? taxon.scientificName ?? taxon.query,
          wikidata: taxon.wikidata,
          lang,
          langName,
          name,
          // Empty when the label is not in Devanagari, which is every Tamil form.
          iast,
          // Recorded per candidate so a page can cite where its name came from, and so a
          // later harvest from a different source does not look like this one.
          source: 'wikidata',
          verdict: 'unverified',
        });
      }
    }
  }
}

const byLang = Object.fromEntries(Object.keys(LANGS).map((l) => [l, candidates.filter((c) => c.lang === l).length]));
const pagesTouched = new Set(candidates.map((c) => `${c.kind}/${c.slug}`)).size;

const payload = {
  _note: 'CANDIDATES, NOT PUBLISHED CONTENT. Harvested from Wikidata and not yet corroborated. '
    + 'Wikidata vernacular plant names carry real misidentifications: it lists aśvattha, which is '
    + 'Ficus religiosa, as a Sanskrit alias for both Adhatoda vasica and Aegle marmelos. Nothing '
    + 'here reaches a page until a second named source confirms it. See workflows/verify-names.js.',
  generatedBy: 'scripts/harvest-names.mjs',
  source: { name: 'Wikidata', licence: 'CC0-1.0', api: 'wbgetentities labels|aliases' },
  languages: LANGS,
  summary: {
    taxaQueried: linked.length,
    itemsReturned: Object.keys(entities).length,
    candidates: candidates.length,
    pagesTouched,
    byLanguage: byLang,
  },
  candidates: candidates.sort((a, b) =>
    `${a.slug}${a.lang}${a.name}`.localeCompare(`${b.slug}${b.lang}${b.name}`)),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`candidates   ${candidates.length}`);
console.log(`pages        ${pagesTouched}`);
console.log(`by language  ${Object.entries(byLang).map(([l, n]) => `${LANGS[l]} ${n}`).join(', ')}`);
console.log(`wrote        ${OUT}`);
console.log('\nNothing is published. Corroborate with workflows/verify-names.js before any of this renders.');
