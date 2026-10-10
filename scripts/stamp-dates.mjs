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
  ['names', 'composition', 'citations', 'identity']
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
    h = hash(`${data.title ?? ''} ${data.answer ?? ''} ${body.trim()} ${dataFor(key, slug)}`);
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

const removed = Object.keys(previous).filter((k) => !(k in next));
const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
const serialised = JSON.stringify(sorted, null, 2) + '\n';
const current = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf8') : '';

console.log(`pages ${sources.length}  new ${added}  revised ${revised}  removed ${removed.length}`);

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
