#!/usr/bin/env node
/**
 * Stable per-page publication and modification dates.
 *
 * The layouts previously stamped `new Date()` at build time into the JSON-LD
 * `dateModified` and into the visible "Last reviewed" line. That meant every
 * rebuild told search engines all 752 pages had been revised that day, which is
 * false, is a known spam signal, and quietly undermines the credibility of a
 * reference work whose whole pitch is dated, sourced material. It also made the
 * built HTML unhashable, so IndexNow change detection could never work.
 *
 * This computes a content hash per page and only advances `modified` when the
 * content actually changes. The ledger is committed, so dates survive CI, clean
 * checkouts and rebuilds.
 *
 *   node scripts/stamp-dates.mjs            # update the ledger
 *   node scripts/stamp-dates.mjs --check    # fail if it would change (CI guard)
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk, parseFrontmatter } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import { hash } from './lib/state.mjs';

const LEDGER = path.join('src', 'data', 'page-dates.json');
const previousLedger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : {};
const CHECK = process.argv.includes('--check');
/** Adopt new hashes without advancing any date: only for a change to the hash DEFINITION. */
const REHASH = process.argv.includes('--rehash');
const TODAY = (process.env.STAMP_DATE || new Date().toISOString()).slice(0, 10);

const sources = [];
if (fs.existsSync('content')) {
  for (const rel of walk('content')) {
    const kind = rel.split(path.sep)[0];
    const slug = path.basename(rel, '.md');
    sources.push({ key: `${kind}/${slug}`, file: path.join('content', rel) });
  }
}
if (fs.existsSync('guides')) {
  for (const f of fs.readdirSync('guides').filter((x) => x.endsWith('.md'))) {
    sources.push({ key: `guide/${path.basename(f, '.md')}`, file: path.join('guides', f) });
  }
}

/**
 * DATA-BACKED PAGES, which had no ledger entry at all and therefore no sitemap lastmod.
 *
 * THE SAME BUG CLASS AS THE ONE DOCUMENTED ABOVE, one layer out. That comment records widening
 * the hash so the ledger could see changes arriving through src/data, after the sitemap spent
 * three weeks telling Google nothing had been modified. It fixed the hash for pages that have a
 * file in content/. It did not notice that some collections have no file in content/ at all.
 *
 * `sources` was built only from content/ and guides/, so every collection rendered straight from
 * a data file was invisible to it: 277 lexicon pages, 28 concept records, 40 family pages, 25
 * research tiers, 16 dravyaguna facets and 7 verification runs. 421 of 1,239 sitemap URLs shipped
 * with no <lastmod>.
 *
 * HOW THIS WAS FOUND, because it was not found by reading the code. Bing's webmaster API was
 * asked about 53 sampled URLs. Of the 35 that carry a lastmod, Bing holds 25. Of the 18 that do
 * not, Bing holds 2. That is 71% against 11%, Fisher exact p = 3.4e-05. The lexicon, the second
 * largest collection on the site, scored 0 of 11.
 *
 * ON CAUSATION, honestly: the two groups also differ in internal link depth, 7 inbound links
 * against 2 at the median, and 53 URLs cannot separate the two explanations. So this is not proof
 * that the missing lastmod caused the missing index entry. It does not need to be. A sitemap that
 * omits a documented crawl-scheduling signal for a third of its URLs is a defect on its own terms,
 * and it is the cheapest of the candidate fixes.
 *
 * The loop that acts on this sits below, after `stable` is defined.
 */

/**
 * A page's content is its markdown AND the data records that render into it.
 *
 * This used to hash the markdown body alone, which made the ledger blind to every change
 * that arrives through src/data. On 6 October a names table in up to fifteen languages
 * appeared on 271 monographs, dose and anupana on 62 formulations, and a 48-row ingredient
 * table on Chyawanprash. A reader sees all of that, and the ledger recorded no change, so the
 * sitemap kept telling Google nothing had been modified since 19 September while Google had
 * indexed nothing since 19 September.
 *
 * review.json is deliberately NOT in here. The practitioner credit is a byline, not a
 * revision of the page's content, and treating it as one would have bumped all 815 pages for
 * the addition of one line. That is the freshness-faking this script exists to prevent, and
 * the distinction between "the page now says more" and "the page now says who read it" is the
 * whole reason the two cases are separated.
 */
const DATA = Object.fromEntries(
  ['names', 'composition', 'citations', 'identity', 'brand-disclosure']
    .map((n) => [n, path.join('src', 'data', `${n}.json`)])
    .filter(([, p]) => fs.existsSync(p))
    .map(([n, p]) => [n, JSON.parse(fs.readFileSync(p, 'utf8'))]),
);

/** Stable stringify, so a key reordering in a data file is not read as a content change. */
const stable = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
};

function dataFor(key, slug) {
  const parts = [
    DATA.names?.pages?.[key],
    DATA.citations?.pages?.[key],
    DATA.composition?.records?.[slug],
    DATA.identity?.records?.[slug],
    /**
     * The manufacturer-disclosure table, which src/components/Disclosure.astro renders on 63
     * formulation pages from src/data/brand-disclosure.json.
     *
     * It is here for the reason the whole of dataFor exists: that section is visible page content
     * arriving through src/data rather than through the markdown body, so without it a re-survey
     * would change what 63 pages say about named companies while the ledger reported the pages
     * unmodified. The dates on those pages are a claim about when their content last changed, and
     * a claim nobody is checking is the one that goes wrong.
     *
     * SCOPED TO formulation/ BECAUSE THE SLUG IS NOT UNIQUE ACROSS COLLECTIONS. Matching on slug
     * alone also hit practice/brahma-rasayana, which shares a slug with a preparation and does not
     * render the section, since the component only renders for kind 'formulation'. That page would
     * then have had its revision date advanced by a survey it does not show. The condition here
     * has to mirror the component's, or the ledger dates a page for content it never displayed.
     */
    key.startsWith('formulation/')
      ? DATA['brand-disclosure']?.preparations?.find((p) => p.slug === slug)
      : undefined,
  ].filter((x) => x !== undefined);
  return parts.length ? stable(parts) : '';
}

const DATA_BACKED = [
  { kind: 'lexicon', file: path.join('src', 'data', 'lexicon.json') },
  { kind: 'concept', file: path.join('src', 'data', 'concepts.json') },
];
for (const { kind, file } of DATA_BACKED) {
  if (!fs.existsSync(file)) continue;
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const rec of doc.records ?? []) {
    if (!rec?.slug) continue;
    /**
     * `since` is the record's OWN date, not today's.
     *
     * These 305 pages have been live for days. A first ledger run would otherwise stamp them
     * published and modified today, which is a freshness claim about pages that did not change,
     * and this script's entire purpose is to not make that claim. The lexicon records carry
     * verifiedOn, 137 on 7 October and 137 on 8 October, and the file carries updatedAt as the
     * fallback for the three that have neither.
     *
     * The whole record is the page's content, so the whole record is what gets hashed. A file
     * mtime would move on every rebuild, which is the same fault from the other direction.
     */
    const since = String(rec.verifiedOn ?? doc.updatedAt ?? TODAY).slice(0, 10);
    sources.push({ key: `${kind}/${rec.slug}`, text: stable(rec), since });
  }
}

/**
 * THE PRACTITIONER DIRECTORY, rendered from src/data/practitioners.json with no file per page, so
 * 2,805 of its URLs shipped with no lastmod: every listing, locality, city and state page.
 *
 * Each page is keyed by its URL path and hashed on exactly the records it renders, so a listing is
 * revised when its own record changes and a city page when any practice in it does. `since` is the
 * newest checkedOn among those records, the date the details on the page were last read at source.
 *
 * The paths must match src/lib/practitioners.ts (slug, cityOf, localityOf, stateOf), including the
 * city-state suffix for a city name used in two states. A key that matches no URL is written and
 * never read, which is the failure the ROOT PAGES note below warns about.
 */
/** State hub key -> the city keys it lists, dated after the main loop like the collection indexes. */
const PRACTITIONER_HUBS = new Map();
const PAGES_DIR_P = path.join('src', 'pages', 'practitioners');
const PRACTITIONERS = path.join('src', 'data', 'practitioners.json');
if (fs.existsSync(PRACTITIONERS)) {
  const recs = JSON.parse(fs.readFileSync(PRACTITIONERS, 'utf8')).practices ?? [];
  const pslug = (x) => String(x).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const statesOf = new Map();
  for (const p of recs) {
    const c = pslug(p.address.city);
    if (!statesOf.has(c)) statesOf.set(c, new Set());
    if (p.address.state) statesOf.get(c).add(p.address.state);
  }
  const shared = (p) => (statesOf.get(pslug(p.address.city))?.size ?? 0) > 1 && !!p.address.state;
  const cityOf = (p) => (shared(p) ? pslug(`${p.address.city} ${p.address.state}`) : pslug(p.address.city));
  // A record's state, else the city's entry in CITY_STATE, read from the TS module so there is one map.
  const ts = fs.readFileSync(path.join('src', 'lib', 'practitioners.ts'), 'utf8');
  const mapSrc = /const CITY_STATE[^=]*=\s*\{([\s\S]*?)\n\};/.exec(ts)?.[1] ?? '';
  const CITY_STATE = Object.fromEntries([...mapSrc.matchAll(/'?([a-z0-9-]+)'?:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
  const stateOf = (p) => p.address.state ?? CITY_STATE[cityOf(p)] ?? '';
  const groups = new Map();
  const add = (key, p) => { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p); };
  for (const p of recs) {
    const c = cityOf(p);
    add(`practitioners/${c}/${pslug(p.address.locality)}/${p.id}`, p);
    add(`practitioners/${c}/${pslug(p.address.locality)}`, p);
    add(`practitioners/${c}`, p);
  }
  for (const [key, ps] of groups) {
    const since = ps.map((p) => p.checkedOn).sort().at(-1);
    sources.push({ key, text: stable(ps.map(({ geo, ...rest }) => rest)), since });
  }
  // A city sits under the state of its first record in display order, as states() in the TS module has it.
  const byCity = new Map();
  for (const p of recs) { const c = cityOf(p); if (!byCity.has(c)) byCity.set(c, []); byCity.get(c).push(p); }
  for (const [c, ps] of byCity) {
    const first = [...ps].sort((a, b) => a.address.locality.localeCompare(b.address.locality) || a.practiceName.localeCompare(b.practiceName))[0];
    const st = stateOf(first);
    if (!st) continue;
    const k = `practitioners/state/${pslug(st)}`;
    if (!PRACTITIONER_HUBS.has(k)) PRACTITIONER_HUBS.set(k, []);
    PRACTITIONER_HUBS.get(k).push(`practitioners/${c}`);
  }
  for (const sub of ['about', 'submit']) {
    const file = path.join(PAGES_DIR_P, `${sub}.astro`);
    if (fs.existsSync(file)) sources.push({ key: `practitioners/${sub}`, file, astro: true, since: gitDate(file) ?? TODAY });
  }
}

/**
 * ROOT PAGES, which are .astro files and were also absent from the ledger.
 *
 * /datasets/, /manufacturers/, /corrections/, /crosswalk/ and the collection indexes are real
 * pages making real claims, and they shipped with no lastmod for the same reason the lexicon did:
 * `sources` only ever looked in content/ and guides/.
 *
 * A KNOWN LIMITATION, stated rather than hidden: hashing the .astro source catches a change to the
 * page's own markup and prose, and does NOT catch a change that arrives purely through the data it
 * renders. /datasets/ is the clearest case. That is the same blindness the comment above describes
 * fixing for monographs via dataFor, and it is not fixed here, because each of these pages pulls
 * from different data and wiring them individually is a larger job than this one. The failure mode
 * is a missed revision date, not a false one, which is the safe direction.
 *
 * THE KEY SHAPE IS NOT FREE. astro.config.mjs looks the ledger up by the URL path with its
 * slashes stripped, so /datasets/ is the key `datasets` and the home page is the empty string. A
 * key of `page/datasets` would be written, committed, and never read by anything. Checked against
 * the serialize() function rather than assumed.
 */

/**
 * The first date for a page the ledger has never seen, from git rather than from today.
 *
 * These pages are weeks old and stamping them as published today would be exactly the freshness
 * claim this script exists to refuse. git knows when the file last changed.
 *
 * It is consulted ONLY for a page with no ledger entry, and the ledger is committed, so a shallow
 * CI checkout never reaches this: by then every entry exists. The fallback is still TODAY, because
 * a missing date must not crash a build.
 */
function gitDate(file) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * Root pages, found on disk rather than listed by hand so a new one is not silently missed.
 *
 * src/pages/about.astro serves /about/ and src/pages/herb/index.astro serves /herb/. Skipped:
 * dynamic routes, which are the per-record pages already covered above, and the endpoint files
 * (.md.ts, .txt.ts, .xml.ts) which are alternate representations rather than pages.
 */
const PAGES_DIR = path.join('src', 'pages');
const rootPages = [];
if (fs.existsSync(PAGES_DIR)) {
  for (const e of fs.readdirSync(PAGES_DIR, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.astro') && !e.name.includes('[')) {
      const name = path.basename(e.name, '.astro');
      rootPages.push({ key: name === 'index' ? '' : name, file: path.join(PAGES_DIR, e.name) });
    } else if (e.isDirectory() && !e.name.startsWith('[')) {
      const idx = path.join(PAGES_DIR, e.name, 'index.astro');
      if (fs.existsSync(idx)) rootPages.push({ key: e.name, file: idx });
    }
  }
}
for (const { key, file } of rootPages) {
  if (previousLedger[key]) {
    sources.push({ key, file, astro: true });
  } else {
    sources.push({ key, file, astro: true, since: gitDate(file) ?? TODAY });
  }
}

/**
 * The one-time migration, and why it is not a mass bump.
 *
 * Widening the hash changes every page's hash at once, so a plain run would mark all 815 as
 * revised today, which is precisely the false signal being avoided. Instead, --migrate
 * records the new hashes and advances `modified` ONLY for the pages that demonstrably gained
 * content in the three commits of 6 October: the 271 with a names entry, the 62 with a dose
 * or anupana, and Chyawanprash. Every other page keeps the date it already had.
 */
const MIGRATE = process.argv.includes('--migrate');
const genuinelyChangedToday = new Set();
if (MIGRATE) {
  for (const k of Object.keys(DATA.names?.pages ?? {})) genuinelyChangedToday.add(k);
  for (const [slug, rec] of Object.entries(DATA.composition?.records ?? {})) {
    if (rec.dose || rec.anupana || rec.counts) genuinelyChangedToday.add(`formulation/${slug}`);
  }
}

const previous = previousLedger;
const next = {};
let added = 0;
let revised = 0;
let rehashed = 0;

for (const { key, file, text, since, astro } of sources) {
  const slug = key.slice(key.indexOf('/') + 1);
  let h;
  if (file && astro) {
    // An .astro file's "frontmatter" is JS, not YAML, so parseFrontmatter does not apply.
    h = hash(fs.readFileSync(file, 'utf8').trim());
  } else if (file) {
    const raw = fs.readFileSync(file, 'utf8');
    // Hash the body and the meaningful frontmatter, not the whole file, so a
    // formatting-only reserialisation of frontmatter does not read as a revision.
    const { data, body } = parseFrontmatter(raw);
    /**
     * EVERY FRONTMATTER FIELD THAT RENDERS, not just title and answer.
     *
     * THIS IS THE THIRD TIME THIS LEDGER HAS BEEN BLIND TO A REAL CHANGE, and the comment above
     * records the first two. It once hashed the markdown body alone and missed everything arriving
     * through src/data. It was widened to cover those, and still covered only `title` and `answer`
     * out of the frontmatter.
     *
     * So a backfill of 189 `family` fields reported "revised 0". That field renders as
     * `botanicalFamily` in [slug].jsonld.ts, as the `Family` row of the markdown twin, and through
     * answer.mjs into the answer block itself. The pages had changed on all three surfaces and the
     * sitemap would have gone on telling Google they had not, which is precisely the failure that
     * left the index frozen for three weeks in September.
     *
     * The list is DERIVED FROM THE RENDER TARGETS rather than chosen: these are the fields
     * [slug].md.ts and [slug].jsonld.ts actually read. `tags`, `aliases`, `words` and `srcRel` are
     * left out because nothing renders them as prose, and `review.json` stays out for the reason
     * given above: a byline is not a revision.
     */
    const RENDERED = ['title', 'answer', 'botanical', 'family', 'sanskrit', 'ayurvedicCategory', 'whoStatus', 'partsUsed', 'sources'];
    const front = RENDERED.map((k) => `${k}=${stable(data[k] ?? '')}`).join(' ');
    h = hash(`${front} ${body.trim()} ${dataFor(key, slug)}`);
  } else {
    // A data-backed page: its record IS its content, already stably stringified. dataFor is still
    // consulted so a citation added to one of these pages counts as a revision, exactly as it does
    // for a file-backed page.
    h = hash(`${text} ${dataFor(key, slug)}`);
  }

  const prev = previous[key];
  if (!prev) {
    // `since` carries a data-backed page's own date so a first run does not claim it is new.
    const first = since ?? TODAY;
    next[key] = { hash: h, published: first, modified: first };
    added += 1;
  } else if (MIGRATE) {
    // Record the wider hash, but only date the pages that actually gained content today.
    const changed = genuinelyChangedToday.has(key);
    next[key] = {
      hash: h,
      published: prev.published ?? TODAY,
      modified: changed ? TODAY : prev.modified,
    };
    if (changed) revised += 1;
  } else if (prev.hash !== h && REHASH) {
    /**
     * A CHANGE TO THE HASH DEFINITION IS NOT A CHANGE TO THE PAGES.
     *
     * Widening what goes into the hash makes every hash differ, so every page looks revised. On 11
     * October widening it to cover the rendered frontmatter fields reported "revised 819" when 189
     * pages had actually changed. Writing that would have told search engines 819 pages were
     * revised in one day, which is false, is a known spam signal, and is the exact behaviour the
     * header of this file says it exists to prevent. The ledger would have been faking freshness in
     * the name of reporting it.
     *
     * So `--rehash` adopts the new hashes and leaves every date alone. The procedure is: revert the
     * real content change, run --rehash to re-baseline against the new definition, re-apply the
     * change, then run normally so only the pages that genuinely moved are stamped.
     */
    next[key] = { hash: h, published: prev.published ?? TODAY, modified: prev.modified };
    rehashed += 1;
  } else if (prev.hash !== h) {
    next[key] = { hash: h, published: prev.published ?? TODAY, modified: TODAY };
    revised += 1;
  } else {
    next[key] = prev;
  }
}

/**
 * COLLECTION INDEX PAGES, which are generated by src/pages/[kind]/ and so have no file of their own.
 *
 * /herb/, /formulation/, /device/, /reference/ and /text/ list their collection. A listing page's
 * honest modification date is the newest date among the things it lists: the page genuinely changes
 * when a member is added or revised, because the list it renders changes.
 *
 * This runs AFTER the main loop because it reads the dates that loop just computed.
 *
 * The four remaining collections without a lastmod are left alone deliberately: /family/<x>,
 * /dravyaguna/<facet>, /research/<tier> and /verification/<run> are facets over the herb corpus
 * and over run data, so the same rule would give all 40 family pages one shared date that moves
 * whenever any of 505 herbs changes. That is a freshness signal with no information in it, and
 * this script exists to refuse exactly that. 88 URLs therefore still ship with no lastmod, which
 * is the honest state rather than a padded one.
 */
const INDEXED_KINDS = ['herb', 'formulation', 'device', 'reference', 'text'];
for (const kind of INDEXED_KINDS) {
  const members = Object.entries(next).filter(([k]) => k.startsWith(`${kind}/`));
  if (!members.length) continue;
  const newest = members.map(([, v]) => v.modified).sort().at(-1);
  const oldest = members.map(([, v]) => v.published).sort()[0];
  const prev = previous[kind];
  next[kind] = {
    // The hash is of the member set and their dates, so the index is revised when the list is.
    hash: hash(members.map(([k, v]) => `${k}:${v.hash}`).join('|')),
    published: prev?.published ?? oldest,
    modified: newest,
  };
  if (!prev) added += 1;
  else if (prev.modified !== newest) revised += 1;
}

/**
 * DIRECTORY HUBS, dated by the rule above: a state page is revised when a city it lists is, and the
 * directory front door when anything in the directory is. The front door is an .astro root page whose
 * own hash only sees its markup, so its date is the newer of that and its newest member.
 */
for (const [key, members] of PRACTITIONER_HUBS) {
  const rows = members.filter((k) => next[k]).map((k) => [k, next[k]]);
  if (!rows.length) continue;
  const newest = rows.map(([, v]) => v.modified).sort().at(-1);
  const prev = previous[key];
  next[key] = {
    hash: hash(rows.map(([k, v]) => `${k}:${v.hash}`).join('|')),
    published: prev?.published ?? rows.map(([, v]) => v.published).sort()[0],
    modified: newest,
  };
  if (!prev) added += 1;
  else if (prev.modified !== newest) revised += 1;
}
if (next.practitioners) {
  const newest = Object.entries(next).filter(([k]) => k.startsWith('practitioners/')).map(([, v]) => v.modified).sort().at(-1);
  if (newest && newest > next.practitioners.modified) next.practitioners = { ...next.practitioners, modified: newest };
}

const removed = Object.keys(previous).filter((k) => !(k in next));
const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
const serialised = JSON.stringify(sorted, null, 2) + '\n';
const current = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf8') : '';

console.log(`pages ${sources.length}  new ${added}  revised ${revised}  removed ${removed.length}${rehashed ? `  rehashed ${rehashed} (dates untouched)` : ''}`);

if (CHECK) {
  if (serialised !== current) {
    console.error('The date ledger is stale. Run `node scripts/stamp-dates.mjs` and commit the result.');
    process.exit(1);
  }
  console.log('ledger is current');
  process.exit(0);
}

fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
fs.writeFileSync(LEDGER, serialised);
if (serialised !== current) console.log(`wrote ${LEDGER}`);
