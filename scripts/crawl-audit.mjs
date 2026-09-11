#!/usr/bin/env node
/**
 * Crawlability and indexability gate, aimed at the crawlers that actually matter here.
 *
 * AI crawlers behave worse than Googlebot in two measured ways, and both drive what
 * this checks. They do not execute JavaScript: Vercel and MERJ, across more than 500
 * million fetches, found GPTBot, ClaudeBot and PerplexityBot fetch JS files and never
 * run them. And they are poor at URL selection: ChatGPT wasted 34.8% of its fetches on
 * 404s and Claude 34.2%, against Googlebot's 8.2%. So a dead link or a JS-rendered page
 * costs far more crawl budget here than conventional SEO advice implies.
 *
 * This deliberately does NOT check for more schema. Schema markup was tracked across
 * 1,885 pages against matched controls and moved AI Overview citations -4.6%. What it
 * checks instead is that every page is reachable, self-describing, canonical, and
 * readable with JavaScript switched off.
 *
 *   node scripts/crawl-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { SITE, BASE } from './config.mjs';

const DIST = 'dist';
const problems = [];
const fail = (check, detail) => problems.push({ check, detail });

if (!fs.existsSync(DIST)) {
  console.error('dist/ missing. Run `npx astro build` first.');
  process.exit(1);
}

/** Every built HTML page. */
const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'index.html') pages.push(p);
  }
})(DIST);

const urlOf = (p) => `${BASE}/${path.relative(DIST, path.dirname(p))}/`.replace(/\/+/g, '/').replace(/^\/\//, '/');

// ---------------------------------------------------------------- per page
let noCanonical = 0;
let jsDependent = 0;
for (const p of pages) {
  const html = fs.readFileSync(p, 'utf8');
  const url = urlOf(p);

  // 1. Nothing may be excluded from indexing by accident.
  const robotsMeta = /<meta[^>]+name=["']robots["'][^>]*>/i.exec(html);
  if (robotsMeta && /noindex|nofollow|none/i.test(robotsMeta[0])) {
    fail('noindex', `${url} carries ${robotsMeta[0].trim()}`);
  }

  // 2. A canonical, absolute, and pointing at this page. Without it a
  //    near-duplicate cluster picks its own representative and we do not get a say.
  const canon = /<link[^>]+rel=(["'])canonical\1[^>]*href=(["'])((?:(?!\2).)+)\2/i.exec(html);
  if (!canon) { noCanonical += 1; fail('no-canonical', `${url} has no canonical`); }
  else if (!canon[3].startsWith('http')) fail('relative-canonical', `${url} -> ${canon[3]}`);

  // 3. Self-describing: a crawler that reads only the head must learn what this is.
  if (!/<title>[^<]{5,}<\/title>/i.test(html)) fail('no-title', url);
  // Backreference the opening quote: a naive [^"'] class stops at the first apostrophe
  // inside the text, so "Women's Health ..." reads as a 5-character description.
  if (!/<meta[^>]+name=(["'])description\1[^>]*content=(["'])((?:(?!\2).){20,})\2/i.test(html)) {
    fail('no-description', url);
  }
  if (!/<h1[^>]*>[\s\S]{3,}?<\/h1>/i.test(html)) fail('no-h1', url);

  // 4. Content must survive JavaScript being off, because these crawlers never run it.
  //    Scripts that only carry JSON-LD are fine; a script that writes the page is not.
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [, attrs, body] of scripts) {
    if (/type=["']application\/ld\+json["']/i.test(attrs)) continue;
    if (/\bsrc=/i.test(attrs) || body.trim().length > 0) {
      jsDependent += 1;
      fail('js-dependent', `${url} ships executable script`);
      break;
    }
  }

  // 5. JSON-LD must parse. A malformed block is worse than none: it can invalidate
  //    the whole graph for a consumer that parses strictly.
  for (const [, attrs, body] of scripts) {
    if (!/application\/ld\+json/i.test(attrs)) continue;
    try { JSON.parse(body); }
    catch (e) { fail('bad-jsonld', `${url}: ${e.message.slice(0, 70)}`); }
  }
}

// ---------------------------------------------------------------- sitemap
const smIndex = path.join(DIST, 'sitemap-index.xml');
if (!fs.existsSync(smIndex)) fail('no-sitemap', 'dist/sitemap-index.xml missing');
else {
  const sitemapped = new Set();
  for (const f of fs.readdirSync(DIST).filter((x) => /^sitemap-\d+\.xml$/.test(x))) {
    for (const m of fs.readFileSync(path.join(DIST, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
      sitemapped.add(m[1].replace(/^https?:\/\/[^/]+/, '').replace(/\/?$/, '/'));
    }
  }
  const missing = pages.map(urlOf).filter((u) => !sitemapped.has(u));
  // A page absent from the sitemap is a page these crawlers may never find, since
  // almost nothing links to this site yet.
  for (const u of missing.slice(0, 10)) fail('not-in-sitemap', u);
  if (missing.length > 10) fail('not-in-sitemap', `... and ${missing.length - 10} more`);
  console.log(`sitemap      ${sitemapped.size} urls, ${pages.length} built pages, ${missing.length} unlisted`);
}

// ---------------------------------------------------------------- origin-root files
// These are read only from the origin root, so they must exist there after any move.
for (const f of ['robots.txt', 'llms.txt']) {
  if (!fs.existsSync(path.join(DIST, f))) {
    // At a project path the root repo serves robots.txt; at a custom domain this one must.
    if (BASE) console.log(`note         /${f} served by the origin repo while BASE=${BASE}`);
    else fail('missing-root-file', `/${f} absent and BASE is empty, so nothing serves it`);
  }
}

// ---------------------------------------------------------------- markdown twins
const twins = [];
(function walkMd(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkMd(p);
    else if (e.name.endsWith('.md')) twins.push(p);
  }
})(DIST);
let twinsNoCanon = 0;
for (const t of twins) {
  if (!/Canonical version of this page: https?:\/\//.test(fs.readFileSync(t, 'utf8'))) twinsNoCanon += 1;
}
if (twinsNoCanon) fail('twin-no-canonical', `${twinsNoCanon} .md twins do not name their canonical HTML url`);

// ---------------------------------------------------------------- report
console.log(`pages        ${pages.length}`);
console.log(`md twins     ${twins.length}, all naming a canonical: ${twinsNoCanon === 0}`);
console.log(`js-dependent ${jsDependent}`);
console.log(`no canonical ${noCanonical}`);

const byCheck = {};
for (const p of problems) (byCheck[p.check] ??= []).push(p.detail);

if (!problems.length) { console.log('\nPASS: crawlable, indexable, and readable with JavaScript off'); process.exit(0); }
console.error(`\nFAIL: ${problems.length} issue(s)\n`);
for (const [check, details] of Object.entries(byCheck)) {
  console.error(`  ${check} (${details.length})`);
  details.slice(0, 6).forEach((d) => console.error(`    - ${d}`));
  if (details.length > 6) console.error(`    ... and ${details.length - 6} more`);
}
process.exit(1);
