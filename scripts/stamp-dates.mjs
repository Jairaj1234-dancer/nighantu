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
import { hash } from './lib/state.mjs';

const LEDGER = path.join('src', 'data', 'page-dates.json');
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

const previous = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : {};
const next = {};
let added = 0;
let revised = 0;

for (const { key, file } of sources) {
  const raw = fs.readFileSync(file, 'utf8');
  // Hash the body and the meaningful frontmatter, not the whole file, so a
  // formatting-only reserialisation of frontmatter does not read as a revision.
  const { data, body } = parseFrontmatter(raw);
  const slug = key.slice(key.indexOf('/') + 1);
  const h = hash(`${data.title ?? ''} ${data.answer ?? ''} ${body.trim()} ${dataFor(key, slug)}`);

  const prev = previous[key];
  if (!prev) {
    next[key] = { hash: h, published: TODAY, modified: TODAY };
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
