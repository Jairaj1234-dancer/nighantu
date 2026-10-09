#!/usr/bin/env node
/**
 * Does a company really name no formulary preparation, or does its URLs just not say so?
 *
 * WHY THIS HAS TO EXIST BEFORE THE FINDING CAN BE PUBLISHED. The discovery pass matches the 101
 * formulary names against a product URL's SLUG, and on that basis 53 of 111 surveyed manufacturers
 * yielded nothing at all, including four with catalogues over a thousand pages. That is either a
 * strong finding about the industry or an artefact of the matcher, and the two are
 * indistinguishable from the sitemap alone: a company selling Ashokarishta at /product/12345 looks
 * identical to one that does not sell it.
 *
 * So this samples real pages from each zero-yield host and matches the formulary names against the
 * page TITLE, which is where a product's name appears when the URL is opaque. The twenty-company
 * survey already measured this effect on hosts that did match and found 31 slug-matcher misses, so
 * the effect is known to be real and the only question is its size on the hosts that matched
 * nothing.
 *
 * A HIT HERE DISPROVES THE FINDING for that host, which is the point. This is written to try to
 * break the claim rather than to confirm it, and the claim is only publishable for the hosts where
 * it survives.
 *
 * THE ETHIC. robots.txt is fetched per host and obeyed, a host that refuses is recorded and left
 * alone, and the sample is capped so no company is read heavily to answer a question about
 * absence. Pages come from the host's own sitemap as discovery recorded it.
 *
 *   node scripts/formulary-name-check.mjs --sample 20 [--hosts 12]
 */
import fs from 'node:fs';
import path from 'node:path';
import { Fetcher } from './lib/fetcher.mjs';
import { fetchRobots, groupFor, isAllowed } from './lib/robots.mjs';
import { buildMatcher, loadFormulations } from './lib/formulation-names.mjs';

const UA = 'NighantuBot/1.0 (+https://nighantu.ageayurveda.com/about/)';
const ARG = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const SAMPLE = ARG('--sample', 20);
const HOSTS = ARG('--hosts', Infinity);
const DISC = path.join('data', 'brands', 'discovery-extended.json');
const OUT = path.join('data', 'brands', 'formulary-name-check.json');

if (!fs.existsSync(DISC)) { console.error(`Need ${DISC}. Run the extended discovery first.`); process.exit(2); }
const disc = JSON.parse(fs.readFileSync(DISC, 'utf8'));
const register = fs.existsSync(path.join('src', 'data', 'manufacturer-register.json'))
  ? JSON.parse(fs.readFileSync(path.join('src', 'data', 'manufacturer-register.json'), 'utf8')).companies ?? []
  : [];
const nameOf = Object.fromEntries(register.map((c) => [
  c.host.replace(/\.[a-z.]+$/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase(), c.name]));
const stateOf = Object.fromEntries(register.map((c) => [
  c.host.replace(/\.[a-z.]+$/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase(), c.state]));

const named = (b) => (b.candidates ?? []).filter((c) => c.slug).length;
const zero = disc.brands
  .filter((b) => !b.skipped && named(b) === 0 && (b.pages ?? 0) > 0)
  .sort((a, b) => (b.pages ?? 0) - (a.pages ?? 0));

console.log(`zero-yield hosts to test   ${zero.length}`);
console.log(`sample per host            up to ${SAMPLE} pages`);

// The same 101 formulary names and the same matcher the collector uses, so a miss here means
// the same thing a miss there means.
const matchName = buildMatcher(loadFormulations());
const fetcher = new Fetcher({ ua: UA, cacheDir: path.join('data', 'brands', 'cache') });

/**
 * Prefer URLs that look like product pages, then fall back to a spread across the sitemap.
 *
 * A spread rather than the first N: sitemaps are often ordered, so the first twenty urls of a
 * 95,527-page site are all one section and tell you nothing about the rest.
 */
const pick = (pages, n) => {
  const products = pages.filter((u) => /\/(product|products|item|shop)\//i.test(u));
  const pool = products.length >= n ? products : pages;
  if (pool.length <= n) return pool;
  return Array.from({ length: n }, (_, i) => pool[Math.floor((i * pool.length) / n)]);
};

/**
 * The host's own sitemap, read directly rather than from discovery.
 *
 * discovery-extended.json records a page COUNT for every host but keeps the url list only where
 * candidates were found, so for exactly the hosts this script exists to test there is nothing
 * stored to sample. Reading one or two sitemap documents here is enough: the question is whether
 * ANY sampled title names a formulation, so a representative handful settles it and the collector's
 * full ranked multi-document walk would be more requests for no more certainty.
 */
const SITEMAP_PATHS = ['/sitemap.xml', '/sitemap_index.xml', '/product-sitemap.xml', '/sitemap-products.xml'];

const sitemapUrls = async (origin, group, depth = 0) => {
  const out = [];
  for (const sp of (depth === 0 ? SITEMAP_PATHS : [origin])) {
    const u = depth === 0 ? `${origin}${sp}` : sp;
    let parsed;
    try { parsed = new URL(u); } catch { continue; }
    if (!isAllowed(group, parsed.pathname)) continue;
    const res = await fetcher.get(u);
    if (!res.body || res.status !== 200 || !/<(?:urlset|sitemapindex)/i.test(res.body)) continue;
    const locs = [...res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
      .map((m) => { try { return new URL(m[1], u).href; } catch { return null; } })
      .filter(Boolean);
    if (/<sitemapindex/i.test(res.body) && depth < 1) {
      // One level of index, product sitemaps first, and at most three documents.
      const ranked = locs.sort((a, b) => (/(product|item|shop)/i.test(b) ? 1 : 0) - (/(product|item|shop)/i.test(a) ? 1 : 0));
      for (const doc of ranked.slice(0, 3)) out.push(...await sitemapUrls(doc, group, depth + 1));
    } else {
      out.push(...locs);
    }
    if (out.length) break;
  }
  return [...new Set(out)];
};

const titleOf = (html) => {
  const m = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return m[1].replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
};

const results = [];
const batch = Number.isFinite(HOSTS) ? zero.slice(0, HOSTS) : zero;
console.log(`testing                    ${batch.length}\n`);

for (const b of batch) {
  const origin = b.origin ?? `https://${b.host ?? b.id}`;
  const r = await fetchRobots(origin, UA);
  if (r.verdict === 'unknown') {
    results.push({ id: b.id, name: nameOf[b.id] ?? b.id, pages: b.pages ?? 0, refused: 'robots.txt unreadable' });
    console.log(`${String(b.id).slice(0, 26).padEnd(28)}robots unreadable, left alone`);
    continue;
  }
  const group = r.groups ? groupFor(r.groups, UA) : null;
  const all = await sitemapUrls(origin, group);
  const urls = pick(all, SAMPLE);
  if (!urls.length) {
    results.push({ id: b.id, name: nameOf[b.id] ?? b.id, pages: b.pages ?? 0,
      sampled: 0, note: 'no sitemap url could be read for a sample' });
    console.log(`${String(b.id).slice(0, 26).padEnd(28)}no sitemap url readable`);
    continue;
  }

  let sampled = 0; let hits = 0; const examples = [];
  for (const u of urls) {
    let p;
    try { p = new URL(u); } catch { continue; }
    if (!isAllowed(group, p.pathname)) continue;
    const res = await fetcher.get(u);
    if (!res.body || res.status !== 200) continue;
    sampled += 1;
    const t = titleOf(res.body);
    const m = matchName(t);
    // matchName returns match objects, not strings: `matched: m[0]` printed [object Object].
    if (m.length) {
      hits += 1;
      if (examples.length < 4) {
        examples.push({ url: u, title: t.slice(0, 110), matched: m[0].slug, matchedOn: m[0].matched });
      }
    }
  }
  results.push({ id: b.id, name: nameOf[b.id] ?? b.id, state: stateOf[b.id] ?? null,
    pages: b.pages ?? 0, sampled, titlesNamingAFormulation: hits, examples });
  console.log(`${String(b.id).slice(0, 26).padEnd(28)}sampled ${String(sampled).padStart(3)}   titles naming a formulation ${hits}`
    + (hits ? `   e.g. ${examples[0].matched}` : ''));
}

const tested = results.filter((r) => (r.sampled ?? 0) > 0);
const withHits = tested.filter((r) => r.titlesNamingAFormulation > 0);
console.log('');
console.log(`hosts sampled              ${tested.length}`);
console.log(`  a title named a formulation in ${withHits.length}`);
console.log(`  none found in            ${tested.length - withHits.length}`);
console.log(`pages sampled              ${tested.reduce((a, r) => a + r.sampled, 0)}`);
console.log(`fetch stats: ${JSON.stringify(fetcher.stats ?? {})}`);
if (withHits.length) {
  console.log('\nThe slug matcher missed these, so the zero-yield finding does NOT hold for them:');
  for (const r of withHits) {
    console.log(`  ${r.name}: ${r.titlesNamingAFormulation} of ${r.sampled} sampled`);
    for (const e of r.examples) console.log(`     ${e.matched}  <-  ${e.title}`);
  }
}

fs.writeFileSync(OUT, `${JSON.stringify({
  agent: UA,
  checkedOn: new Date().toLocaleDateString('en-CA'),
  samplePerHost: SAMPLE,
  note: 'Tests whether a host that matched no formulary name in its URL slugs names one in its '
    + 'page titles instead. Written to try to break the zero-yield finding, not to confirm it.',
  hostsTested: tested.length,
  hostsWhereATitleNamedAFormulation: withHits.length,
  results,
}, null, 2)}\n`);
console.log(`\nwrote ${OUT}`);
