#!/usr/bin/env node
/**
 * Sweep the built site for the defects the other gates do not look for.
 *
 * WHY A SEPARATE SWEEP. The existing gates are narrow on purpose and each one guards a specific
 * failure this project has already had: audit.mjs guards compliance, linkcheck.mjs guards internal
 * links, crawl-audit.mjs guards crawlability, dose-provenance.mjs guards one figure. None of them
 * asks the blunt question "is any page on this site broken", and the site passed all six while
 * carrying four dangling dataset identifiers in its knowledge graph and a markdown twin that named
 * no canonical.
 *
 * WHAT IT CHECKS, and what each check exists because of.
 *
 *   empty-ish pages      A route that renders but says almost nothing. The lexicon added 277
 *                        pages in one commit; a schema change that emptied a section would show
 *                        up here and nowhere else.
 *   broken jsonld        Every ld+json block must parse and carry a @type. A template that
 *                        interpolates undefined produces valid HTML and invalid JSON-LD, which is
 *                        invisible to a reader and fatal to a crawler.
 *   dangling @id         An @id pointing at a #fragment on this site that nothing mints. The
 *                        knowledge graph did exactly this to four dataset nodes for weeks.
 *   duplicate titles     Two pages claiming the same <title> compete with each other and a
 *                        retrieval index picks one without asking.
 *   missing canonical    Covered for twins by crawl-audit; checked here for HTML too.
 *   build-time dates     A dateModified equal to today on a page whose content did not change
 *                        today is the spam signal stamp-dates.mjs was written to stop, and that
 *                        ledger only covers content/ files, not generated routes.
 *   advertised downloads Every dataset URL named in llms.txt, on /datasets/ and in the knowledge
 *                        graph must exist in dist and parse. A dataset advertised and absent is
 *                        worse than one never advertised.
 *   orphans              A page no other page links to. Not always a bug, so reported and not
 *                        failed: an index may legitimately be reachable only from llms.txt.
 *   oversized pages      A page so large it will be truncated by a retrieval pipeline.
 *
 *   node scripts/site-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = 'dist';
const SITE = 'https://nighantu.ageayurveda.com';

const failures = [];
const warnings = [];
const fail = (check, detail) => failures.push({ check, detail });
const warn = (check, detail) => warnings.push({ check, detail });

/** Every built HTML page, as {rel, url, html}. */
const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'index.html') {
      const rel = `/${path.relative(DIST, path.dirname(p)).split(path.sep).join('/')}/`.replace('//', '/');
      pages.push({ rel, file: p, html: fs.readFileSync(p, 'utf8') });
    }
  }
})(DIST);

const textOf = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z#0-9]+;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const LEDGER = JSON.parse(fs.readFileSync(path.join('src', 'data', 'page-dates.json'), 'utf8'));
const ALIASES = (() => {
  const f = path.join('src', 'data', 'duplicates.json');
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')).aliases ?? {}) : {};
})();

// ------------------------------------------------------------------ per page
const titles = new Map();
const mintedIds = new Set();
const referencedIds = [];
const linkedTo = new Set();
let jsonldBlocks = 0;

for (const p of pages) {
  const body = textOf(p.html);

  // 1. a page that renders but says nothing
  if (body.length < 400) fail('thin-page', `${p.rel} renders only ${body.length} characters of text`);

  // 2. JSON-LD must parse and be typed
  for (const m of p.html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    jsonldBlocks += 1;
    let parsed;
    try {
      parsed = JSON.parse(m[1]);
    } catch (err) {
      fail('jsonld-invalid', `${p.rel}: ${err.message.slice(0, 90)}`);
      continue;
    }
    /**
     * Minted ids come from the WHOLE tree, not just the top level and @graph.
     *
     * The first version flattened only those two, and /datasets/ mints its seven Dataset ids
     * inside the DataCatalog's `dataset` array. So it reported all seven as dangling: an audit
     * accusing the site of a bug the audit itself could not see. A node is a node wherever it sits.
     */
    const nodes = [];
    (function collect(v) {
      if (Array.isArray(v)) { v.forEach(collect); return; }
      if (!v || typeof v !== 'object') return;
      if (v['@type'] || v['@id']) nodes.push(v);
      for (const key of Object.keys(v)) if (key !== '@type') collect(v[key]);
    })(parsed);

    for (const n of nodes) {
      // A bare {"@id": "..."} is a REFERENCE to a node defined elsewhere and carries no type by
      // design; a node with other properties and no type is a template bug.
      const keys = Object.keys(n).filter((k) => k !== '@id');
      if (!n['@type'] && keys.length) fail('jsonld-untyped', `${p.rel}: a node with ${keys.length} properties and no @type`);
      if (JSON.stringify(n).includes('"undefined"')) fail('jsonld-undefined', `${p.rel}: a field is the string "undefined"`);
      // Only a node that DEFINES something mints its id.
      if (typeof n['@id'] === 'string' && n['@id'].startsWith(SITE) && (n['@type'] || keys.length)) mintedIds.add(n['@id']);
    }
    for (const r of JSON.stringify(parsed).matchAll(/"@id":"([^"]+#[^"]+)"/g)) {
      if (r[1].startsWith(SITE)) referencedIds.push({ id: r[1], on: p.rel });
    }
  }

  // 3. one canonical, pointing at itself
  const canon = [...p.html.matchAll(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/gi)].map((m) => m[1]);
  if (!canon.length) fail('no-canonical', `${p.rel} names no canonical`);
  else if (canon.length > 1) fail('multiple-canonical', `${p.rel} names ${canon.length} canonicals`);
  else if (!canon[0].endsWith(p.rel) && canon[0] !== `${SITE}${p.rel}`) {
    // A duplicate page deliberately points at its primary through src/data/duplicates.json. That
    // is the mechanism working, so it is only reported when the page is not a declared alias.
    const aslug = p.rel.split('/').filter(Boolean).pop();
    if (!ALIASES[aslug]) warn('canonical-elsewhere', `${p.rel} points its canonical at ${canon[0]}`);
  }

  // 4. duplicate titles
  const title = p.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  if (!title) fail('no-title', `${p.rel} has no title`);
  else {
    if (!titles.has(title)) titles.set(title, []);
    titles.get(title).push(p.rel);
  }

  /**
   * 5. The stamp must agree with the ledger.
   *
   * The first version flagged only a date equal to today, as a warning, and 105 pages tripped it
   * of which 52 were legitimately modified today. Buried in the other 53 was a real production
   * defect: content/reference/*.md declares `kind: "hub"` while the ledger keys those pages under
   * `reference/`, so every lookup missed and the fallback stamped build time. All 53 were telling
   * search engines they had been revised on every deploy, which is the precise signal the ledger
   * exists to stop.
   *
   * Comparing against the ledger catches that and says nothing about a page that really did
   * change today. It is a FAILURE and not a warning, because a warning is what let it sit live.
   */
  const segs = p.rel.split('/').filter(Boolean);
  const pslug = segs[segs.length - 1];
  const stamped = [...p.html.matchAll(/"dateModified":"(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  if (stamped.length && pslug) {
    /**
     * Resolved by the page's own DIRECTORY, not by a bare slug search.
     *
     * Two slugs exist under two kinds each, brahma-rasayana as formulation and practice, and
     * shirodhara as guide and practice. A bare-slug search took whichever came first in the
     * ledger and then accused both practice pages of a date mismatch they did not have, which is
     * the same class of error as the one this check exists to find.
     */
    const dir = segs.length > 1 ? segs[segs.length - 2] : '';
    const entry = LEDGER[`${dir}/${pslug}`]
      ?? Object.entries(LEDGER).filter(([k]) => k.endsWith(`/${pslug}`)).map(([, v]) => v)[0];
    const candidates = Object.entries(LEDGER).filter(([k]) => k.endsWith(`/${pslug}`));
    // Only assert when the key is unambiguous or the directory resolved it.
    if (entry && (LEDGER[`${dir}/${pslug}`] || candidates.length === 1)
      && !stamped.includes(entry.modified)) {
      fail('date-disagrees-with-ledger', `${p.rel} stamps ${stamped[0]}, the ledger says ${entry.modified}`);
    }
  }

  // 6. page size
  if (p.html.length > 900_000) warn('oversized', `${p.rel} is ${(p.html.length / 1024).toFixed(0)} KB`);

  // 7. collect internal links, for the orphan pass
  for (const m of p.html.matchAll(/href=["'](?:https:\/\/nighantu\.ageayurveda\.com)?(\/[^"'#?]*)/g)) {
    linkedTo.add(m[1].endsWith('/') || /\.[a-z0-9]+$/i.test(m[1]) ? m[1] : `${m[1]}/`);
  }
}

for (const [title, where] of titles) {
  if (where.length > 1) fail('duplicate-title', `${where.length} pages share the title "${title.slice(0, 70)}": ${where.slice(0, 4).join(', ')}`);
}

// ------------------------------------------------------------------ dangling @id
const unminted = referencedIds.filter((r) => !mintedIds.has(r.id));
for (const r of unminted.slice(0, 20)) fail('dangling-id', `${r.on} references ${r.id}, which nothing mints`);
if (unminted.length > 20) fail('dangling-id', `and ${unminted.length - 20} more`);

// ------------------------------------------------------------------ advertised downloads
const advertised = new Set();
const sources = ['llms.txt', 'llms-full.txt', 'datasets.md', 'knowledge-graph.jsonld'];
for (const f of sources) {
  const p = path.join(DIST, f);
  if (!fs.existsSync(p)) { fail('missing-file', `${f} is advertised by the site and absent from dist`); continue; }
  const txt = fs.readFileSync(p, 'utf8');
  for (const m of txt.matchAll(/https:\/\/nighantu\.ageayurveda\.com(\/[^\s)"'<>,]+\.(?:jsonld|json|csv|parquet|txt|md))/g)) advertised.add(m[1]);
}
for (const p of pages) {
  for (const m of p.html.matchAll(/href=["'](?:https:\/\/nighantu\.ageayurveda\.com)?(\/[^"']+\.(?:jsonld|json|csv|parquet))["']/g)) advertised.add(m[1]);
}
let parsedOk = 0;
for (const url of [...advertised].sort()) {
  const f = path.join(DIST, url.replace(/^\//, ''));
  if (!fs.existsSync(f)) { fail('advertised-missing', `${url} is linked from the site and does not exist in dist`); continue; }
  if (fs.statSync(f).size === 0) { fail('advertised-empty', `${url} exists and is empty`); continue; }
  if (/\.(json|jsonld)$/.test(url)) {
    try { JSON.parse(fs.readFileSync(f, 'utf8')); parsedOk += 1; } catch (err) { fail('advertised-unparseable', `${url}: ${err.message.slice(0, 80)}`); }
  } else parsedOk += 1;
}

// ------------------------------------------------------------------ sitemap
const smFiles = fs.readdirSync(DIST).filter((f) => /^sitemap.*\.xml$/.test(f));
const inSitemap = new Set();
for (const f of smFiles) {
  for (const m of fs.readFileSync(path.join(DIST, f), 'utf8').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const u = m[1].replace(SITE, '').replace(/&amp;/g, '&');
    if (u.endsWith('.xml')) continue;
    inSitemap.add(u.endsWith('/') ? u : `${u}/`);
  }
}
const missingFromSitemap = pages.map((p) => p.rel).filter((r) => !inSitemap.has(r));
if (missingFromSitemap.length) {
  warn('not-in-sitemap', `${missingFromSitemap.length} built pages are absent from the sitemap, e.g. ${missingFromSitemap.slice(0, 5).join(', ')}`);
}

// ------------------------------------------------------------------ orphans
const orphans = pages.map((p) => p.rel).filter((r) => r !== '/' && !linkedTo.has(r));
if (orphans.length) {
  warn('orphan', `${orphans.length} pages are linked from no other page, e.g. ${orphans.slice(0, 6).join(', ')}`);
}

// ------------------------------------------------------------------ report
console.log(`pages              ${pages.length}`);
console.log(`json-ld blocks     ${jsonldBlocks}, all parsing: ${!failures.some((f) => f.check.startsWith('jsonld'))}`);
console.log(`distinct titles    ${titles.size}`);
console.log(`@id minted         ${mintedIds.size}, referenced ${referencedIds.length}, dangling ${unminted.length}`);
console.log(`downloads          ${advertised.size} advertised, ${parsedOk} present and readable`);
console.log(`in sitemap         ${pages.length - missingFromSitemap.length} of ${pages.length}`);
console.log('');

if (warnings.length) {
  console.log(`WARNINGS (${warnings.length}), not failures:`);
  const byCheck = {};
  for (const w of warnings) (byCheck[w.check] ??= []).push(w.detail);
  for (const [k, v] of Object.entries(byCheck)) {
    console.log(`  ${k} (${v.length})`);
    for (const d of v.slice(0, 4)) console.log(`     ${d}`);
    if (v.length > 4) console.log(`     and ${v.length - 4} more`);
  }
  console.log('');
}

if (failures.length) {
  console.log(`FAILURES (${failures.length}):`);
  const byCheck = {};
  for (const f of failures) (byCheck[f.check] ??= []).push(f.detail);
  for (const [k, v] of Object.entries(byCheck)) {
    console.log(`  ${k} (${v.length})`);
    for (const d of v.slice(0, 6)) console.log(`     ${d}`);
    if (v.length > 6) console.log(`     and ${v.length - 6} more`);
  }
  console.log('');
  console.log('FAIL: the site has defects no other gate looks for.');
  process.exit(1);
}
console.log('PASS: no broken page, no invalid structured data, no dangling identifier, no missing download.');
