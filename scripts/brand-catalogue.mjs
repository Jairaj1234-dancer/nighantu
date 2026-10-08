#!/usr/bin/env node
/**
 * Read what the manufacturers publish about the classical formulations they sell.
 *
 * The comparison pages this feeds state, per formulation, what each company's own page says and
 * what the Ayurvedic Formulary of India says. That only works if every figure on our side can be
 * traced to a page we were permitted to read, so the permission check comes first and is a gate
 * rather than a note: `--robots` runs it alone and fetches nothing else.
 *
 * WHAT IT WILL NOT DO.
 *
 *  - It will not fetch a path robots.txt disallows for this agent, and it will not retry under a
 *    different user agent. A host that refuses is recorded as refusing. That refusal is itself
 *    the finding: a company whose product pages no answer engine may read cannot be cited for its
 *    own product, and an accurate third party becomes the only citable source. Working around it
 *    would destroy exactly the thing being built.
 *  - It will not treat an unreachable robots.txt as permission. A 5xx, a timeout or a reset
 *    reads as unknown, and unknown is closed.
 *  - It will not identify itself as a browser or as another crawler. One agent string, with a
 *    contact URL in it, used consistently, so a site owner who wants to exclude us can.
 *  - It will not hammer a host: one request in flight per host and a delay between them.
 *
 * TWO STAGES SO FAR. `--robots` surveys permission and stops. Without it, the survey runs and
 * then discovery walks each permitted host's own sitemaps and matches product slugs against the
 * formulations transcribed here, so a candidate is identified BEFORE any product page is read and
 * no page is fetched on the chance that it might be relevant. Reading each candidate's label is
 * the next stage and is not written yet.
 *
 *   node scripts/brand-catalogue.mjs --robots          # permission survey only, nothing fetched
 *   node scripts/brand-catalogue.mjs --robots --json   # same, machine-readable
 *   node scripts/brand-catalogue.mjs                   # survey, then sitemap discovery
 */
import fs from 'node:fs';
import path from 'node:path';
import { fetchRobots, groupFor, isAllowed } from './lib/robots.mjs';
import { Fetcher, parseSitemap } from './lib/fetcher.mjs';
import { buildMatcher } from './lib/formulation-names.mjs';

const ROBOTS_ONLY = process.argv.includes('--robots');
const AS_JSON = process.argv.includes('--json');

/**
 * One agent string, honestly named, with somewhere to complain to. Not a browser string: a site
 * that wants to exclude this needs something to write in its robots.txt, and "Mozilla/5.0" gives
 * it nothing.
 */
export const UA = 'NighantuBot/1.0 (+https://nighantu.ageayurveda.com/about/)';

/**
 * The companies whose classical ranges overlap the formulary entries transcribed here. Names and
 * home pages only: what each one does or does not publish is the output of this script, not an
 * input to it, and belongs in the report rather than in a list of targets.
 */
export const BRANDS = [
  { id: 'dabur', name: 'Dabur', origin: 'https://www.dabur.com' },
  { id: 'patanjali', name: 'Patanjali Ayurved', origin: 'https://www.patanjaliayurved.net' },
  { id: 'baidyanath', name: 'Baidyanath', origin: 'https://www.baidyanathayurved.com' },
  { id: 'maharishi', name: 'Maharishi Ayurveda', origin: 'https://maharishiayurvedaindia.com' },
  { id: 'himalaya', name: 'Himalaya Wellness', origin: 'https://himalayawellness.in' },
  { id: 'zandu', name: 'Zandu', origin: 'https://zanducare.com' },
  { id: 'charak', name: 'Charak Pharma', origin: 'https://charak.com' },
  { id: 'aryavaidyasala', name: 'Arya Vaidya Sala Kottakkal', origin: 'https://www.aryavaidyasala.com' },
  { id: 'vaidyaratnam', name: 'Vaidyaratnam Oushadhasala', origin: 'https://vaidyaratnam.com' },
  { id: 'sdl', name: 'Shree Dhootapapeshwar', origin: 'https://www.sdlindia.com' },
  { id: 'unjha', name: 'Unjha Pharmacy', origin: 'https://unjhapharmacy.com' },
];

/**
 * Paths probed for permission. Not guesses at real URLs: these are the shapes a product page
 * takes on a Shopify, WooCommerce or custom catalogue, and the question asked of robots.txt is
 * whether a catalogue path is readable at all, before a single product URL is discovered.
 */
const PROBES = [
  '/', '/products/', '/product/', '/shop/', '/collections/all', '/product-category/',
  '/search?q=triphala', '/sitemap.xml', '/sitemap_index.xml',
];

/** Other agents' verdicts, for the same paths. A company that admits Google and refuses the
 *  answer engines has made a choice, and the choice is the finding. */
const OTHER_AGENTS = ['Googlebot', 'bingbot', 'GPTBot', 'ClaudeBot', 'CCBot', 'PerplexityBot'];

const pad = (s, n) => String(s).padEnd(n);
const survey = [];

for (const brand of BRANDS) {
  const r = await fetchRobots(brand.origin, UA);
  const group = r.groups ? groupFor(r.groups, UA) : null;
  // Unknown is closed. See the note at the top of lib/robots.mjs.
  const closed = r.verdict === 'unknown';
  const paths = {};
  for (const p of PROBES) {
    paths[p] = closed ? false : isAllowed(group, p.split('?')[0]);
  }
  const others = {};
  for (const a of OTHER_AGENTS) {
    const g = r.groups ? groupFor(r.groups, a) : null;
    others[a] = closed ? null : isAllowed(g, '/products/');
  }
  survey.push({
    ...brand,
    robots: { status: r.status, verdict: r.verdict, note: r.note ?? null, groups: r.groups?.length ?? 0 },
    // Named groups tell us whether the site addressed AI crawlers by name at all, which is a
    // different fact from whether it allows them.
    namesUsByName: Boolean(r.groups?.some((g) => g.agents.some((a) => a !== '*' && UA.toLowerCase().includes(a)))),
    aiAgentsNamed: (r.groups ?? []).flatMap((g) => g.agents)
      .filter((a) => /gpt|claude|ccbot|perplexity|anthropic|openai|google-extended|applebot-extended|bytespider|meta-external/i.test(a)),
    allowed: paths,
    otherAgents: others,
    // Whether anything resembling a catalogue is readable by us at all.
    catalogueReadable: Object.entries(paths).some(([p, ok]) => ok && p !== '/' && !p.startsWith('/sitemap')),
  });
  await new Promise((res) => setTimeout(res, 1200));
}

if (AS_JSON) {
  const out = path.join('data', 'brands', 'robots-survey.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify({ agent: UA, surveyedOn: new Date().toLocaleDateString('en-CA'), brands: survey }, null, 2)}\n`);
  console.log(`wrote ${out}`);
}

console.log(`agent  ${UA}\n`);
console.log(`${pad('brand', 16)}${pad('robots', 10)}${pad('us', 12)}${pad('catalogue', 11)}AI agents the file names`);
for (const b of survey) {
  const us = b.robots.verdict === 'unknown' ? 'CLOSED' : (b.allowed['/'] ? 'allowed' : 'DISALLOWED');
  const named = b.aiAgentsNamed.length ? [...new Set(b.aiAgentsNamed)].join(' ') : '(none)';
  console.log(`${pad(b.id, 16)}${pad(b.robots.verdict, 10)}${pad(us, 12)}${pad(b.catalogueReadable ? 'readable' : 'no', 11)}${named}`);
}

const unknown = survey.filter((b) => b.robots.verdict === 'unknown');
const refused = survey.filter((b) => b.robots.verdict !== 'unknown' && !b.catalogueReadable);
const open = survey.filter((b) => b.catalogueReadable);

console.log('');
console.log(`readable  ${open.length} of ${survey.length}: ${open.map((b) => b.id).join(', ') || 'none'}`);
if (refused.length) console.log(`refused   ${refused.length}: ${refused.map((b) => b.id).join(', ')} (robots.txt disallows the catalogue for this agent)`);
if (unknown.length) console.log(`unknown   ${unknown.length}: ${unknown.map((b) => `${b.id} (${b.robots.note})`).join(', ')}`);
console.log('');
console.log('A refusal is recorded and obeyed, never worked around. It is also a finding: a product');
console.log('page no answer engine may read cannot be cited for its own product.');

if (ROBOTS_ONLY) {
  console.log('\n--robots: permission survey only. No product page was fetched.');
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------
// Discovery. Candidate product URLs come from each host's OWN sitemap and from nowhere else.
// ---------------------------------------------------------------------------------------------

/**
 * The formulations to look for: every entry with a transcribed composition, under its page title
 * and its aliases. All 101, not a hand-picked shortlist, because which of them a company actually
 * sells is a finding and should not be assumed on the way in.
 */
const loadFormulations = () => {
  const comp = JSON.parse(fs.readFileSync(path.join('src', 'data', 'composition.json'), 'utf8'));
  const out = [];
  for (const slug of Object.keys(comp.records ?? {})) {
    const file = path.join('content', 'formulation', `${slug}.md`);
    const names = new Set();
    if (fs.existsSync(file)) {
      const fm = fs.readFileSync(file, 'utf8');
      const title = fm.match(/^title:\s*"([^"]+)"/m)?.[1];
      if (title) names.add(title);
      const aliases = fm.match(/^aliases:\s*(\[[^\]]*\])/m)?.[1];
      if (aliases) { try { for (const a of JSON.parse(aliases)) names.add(a); } catch { /* ignore */ } }
    }
    // The slug is a name too, and sometimes the only one that carries the regional spelling.
    names.add(slug.replace(/-/g, ' '));
    out.push({ slug, names: [...names] });
  }
  return out;
};

const FORMULATIONS = loadFormulations();
const matchName = buildMatcher(FORMULATIONS);

/**
 * What kind of page a URL is, from its path alone.
 *
 * This filter exists because the first discovery run matched 25 Dabur press releases and 41 blog
 * posts: "akshay-kumar-new-face-dabur-chyawanprash" names the formulation and is a campaign
 * announcement, not a product page, and a composition read off it would be a composition read off
 * a press release. Editorial pages are counted and dropped, not silently skipped.
 *
 *   product    the page that carries the label: /products/x, /product/a/b/x, and Dabur's
 *              /our-brand/x, which is where Dabur puts a product's ingredients
 *   collection a category or listing page: real, but it holds no single product's composition
 *   editorial  a blog post, press release, article or static page
 */
export const urlKind = (u) => {
  const p = new URL(u).pathname.toLowerCase();
  if (/(^|\/)(blogs?|blog-detail|press-releases?|news|articles?|media|stories|pages)(\/|$)/.test(p)) return 'editorial';
  if (/~n\d+$/.test(p)) return 'editorial';
  if (/(^|\/)(collections?|category|categories|shop)(\/|$)/.test(p)) return 'collection';
  if (/(^|\/)(products?|our-brand|item)(\/|$)/.test(p)) return 'product';
  return 'other';
};

/**
 * Walk a host's sitemaps breadth-first and return every page URL found.
 *
 * Bounded three ways, because a sitemap index can point at hundreds of sitemaps and this is
 * someone else's bandwidth: a cap on how many sitemap documents are read per host, a depth cap
 * on nesting, and a refusal to leave the host. Whatever the caps cut is reported, not hidden.
 */
const walkSitemaps = async (fetcher, origin, { maxDocs = 40, maxDepth = 3 } = {}) => {
  const host = new URL(origin).hostname.replace(/^www\./, '');
  const seen = new Set();
  const pages = new Set();
  const notes = [];

  // Seeds: the Sitemap: lines in robots.txt first, because that is where the host says to look,
  // then the two conventional paths.
  const seeds = [];
  const rob = await fetchRobots(origin, UA);
  if (rob.verdict === 'unknown') return { pages: [], docs: 0, notes: [`robots.txt unreadable: ${rob.note}`] };
  const robTxt = await fetcher.get(`${origin}/robots.txt`);
  for (const m of String(robTxt.body ?? '').matchAll(/^\s*sitemap:\s*(\S+)/gim)) seeds.push(m[1]);
  seeds.push(`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`);

  let queue = [...new Set(seeds)].map((u) => ({ url: u, depth: 0 }));
  let docs = 0;

  while (queue.length && docs < maxDocs) {
    const { url, depth } = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    let u;
    try { u = new URL(url); } catch { continue; }
    if (u.hostname.replace(/^www\./, '') !== host) { notes.push(`off-host sitemap not followed: ${url}`); continue; }
    if (/\.gz$/i.test(u.pathname)) { notes.push(`gzipped sitemap not read: ${url}`); continue; }

    const res = await fetcher.get(url);
    docs += 1;
    if (res.refused) { notes.push(`refused: ${url} (${res.refused})`); continue; }
    if (!res.body || res.status !== 200) { notes.push(`${res.status ?? res.error}: ${url}`); continue; }
    if (!/<(?:urlset|sitemapindex)/i.test(res.body)) { notes.push(`not a sitemap: ${url}`); continue; }

    const { isIndex, locs } = parseSitemap(res.body);
    if (isIndex) {
      if (depth >= maxDepth) { notes.push(`depth cap reached at ${url}, ${locs.length} child sitemaps not read`); continue; }
      // Catalogue sitemaps first: on a Shopify or WooCommerce host the product sitemap says so in
      // its name, and reading it before the blog archive means the caps bite on the blog.
      const ranked = locs.sort((a, b) => (/(product|collection|catalog|shop|item)/i.test(b) ? 1 : 0) - (/(product|collection|catalog|shop|item)/i.test(a) ? 1 : 0));
      for (const l of ranked) queue.push({ url: l, depth: depth + 1 });
    } else {
      for (const l of locs) pages.add(l);
    }
  }
  if (queue.length) notes.push(`document cap reached, ${queue.length} sitemaps not read`);
  return { pages: [...pages], docs, notes };
};

console.log('\n--- discovery: candidate products from each host\'s own sitemap ---\n');

const fetcher = new Fetcher({ ua: UA, cacheDir: path.join('data', 'brands', 'cache') });
const discovery = [];

for (const b of survey) {
  if (b.robots.verdict === 'unknown' || !b.catalogueReadable) {
    discovery.push({ ...b, skipped: 'robots.txt does not permit the catalogue', pages: 0, candidates: [] });
    console.log(`${pad(b.id, 16)}skipped, ${b.robots.verdict === 'unknown' ? 'robots.txt unreadable' : 'catalogue disallowed'}`);
    continue;
  }
  const { pages, docs, notes } = await walkSitemaps(fetcher, b.origin);
  const candidates = [];
  const dropped = [];
  for (const url of pages) {
    // Match on the URL's last NAME-BEARING path segment. A product's slug carries its name on
    // every platform these hosts use, and matching the slug rather than the page's own title
    // means a candidate is identified BEFORE it is fetched, so no page is fetched on the chance
    // that it might be relevant.
    //
    // The segment is not always the last one. Patanjali's product URLs end in a numeric id
    // (/product/.../patanjali-divya-triphala-churna/4345), and taking the last segment read 1,411
    // of their product pages as the number 4345 and matched three of them. So a purely numeric
    // tail is stepped over.
    const segs = decodeURIComponent(new URL(url).pathname).split('/').filter(Boolean);
    while (segs.length && /^\d+$/.test(segs[segs.length - 1])) segs.pop();
    const seg = segs[segs.length - 1] ?? '';
    const hits = matchName(seg);
    if (!hits.length) continue;
    const kind = urlKind(url);
    for (const h of hits) {
      const row = { url, slug: h.slug, matchedOn: seg, via: h.matched, kind };
      if (kind === 'product') candidates.push(row); else dropped.push(row);
    }
  }
  const distinct = new Set(candidates.map((c) => c.slug));
  const droppedBy = {};
  for (const d of dropped) droppedBy[d.kind] = (droppedBy[d.kind] ?? 0) + 1;
  discovery.push({ ...b, pages: pages.length, sitemapDocs: docs, notes, candidates, droppedNonProduct: droppedBy });
  const dropNote = Object.entries(droppedBy).map(([k, v]) => `${v} ${k}`).join(', ');
  console.log(`${pad(b.id, 16)}${pad(`${pages.length} urls`, 12)}${pad(`${docs} sitemaps`, 13)}${pad(`${candidates.length} products / ${distinct.size} formulations`, 34)}${dropNote ? `dropped ${dropNote}` : ''}`);
  for (const note of notes.slice(0, 3)) console.log(`${' '.repeat(16)}note: ${note}`);
}

const out = path.join('data', 'brands', 'discovery.json');
fs.writeFileSync(out, `${JSON.stringify({
  agent: UA,
  discoveredOn: new Date().toLocaleDateString('en-CA'),
  formulationsLookedFor: FORMULATIONS.length,
  brands: discovery,
}, null, 2)}\n`);

const total = discovery.reduce((a, b) => a + (b.candidates?.length ?? 0), 0);
const byFormulation = new Map();
for (const b of discovery) for (const c of b.candidates ?? []) {
  if (!byFormulation.has(c.slug)) byFormulation.set(c.slug, new Set());
  byFormulation.get(c.slug).add(b.id);
}
const ranked = [...byFormulation.entries()].sort((a, b) => b[1].size - a[1].size);

console.log(`\n${total} candidate product pages across ${byFormulation.size} of ${FORMULATIONS.length} formulations.`);
console.log(`fetch stats: ${fetcher.stats.fetched} fetched, ${fetcher.stats.cached} from cache, ${fetcher.stats.refused} refused, ${fetcher.stats.failed} failed\n`);
console.log('Formulations carried by the most companies, which are the ones a comparison can cover:');
for (const [slug, brands] of ranked.slice(0, 30)) {
  console.log(`  ${pad(slug, 30)}${brands.size}  ${[...brands].join(' ')}`);
}
console.log(`\nwrote ${out}`);
