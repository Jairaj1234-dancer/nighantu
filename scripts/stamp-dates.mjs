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

const previous = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : {};
const next = {};
let added = 0;
let revised = 0;

for (const { key, file } of sources) {
  const raw = fs.readFileSync(file, 'utf8');
  // Hash the body and the meaningful frontmatter, not the whole file, so a
  // formatting-only reserialisation of frontmatter does not read as a revision.
  const { data, body } = parseFrontmatter(raw);
  const h = hash(`${data.title ?? ''} ${data.answer ?? ''} ${body.trim()}`);

  const prev = previous[key];
  if (!prev) {
    next[key] = { hash: h, published: TODAY, modified: TODAY };
    added += 1;
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
