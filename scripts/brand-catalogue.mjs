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
 * THREE STAGES, each of which can be the last. `--robots` surveys permission and stops.
 * `--discover` adds a walk of each permitted host's own sitemaps, matching product slugs against
 * the formulations transcribed here, so a candidate is identified BEFORE any product page is read
 * and no page is fetched on the chance that it might be relevant. Without either flag, collection
 * then reads each candidate and records what the page states.
 *
 * COLLECTION RECORDS FACTS ABOUT THE PAGE, NOT JUDGEMENTS. Whether a stated composition matches
 * the formulary entry is a separate step that needs a model. What this records is whether the page
 * names its ingredients at all, whether it gives any of them a quantity, whether it states a dose,
 * and whether it cites any authority, each with the text it was read from. The distinction between
 * a page that publishes no composition and a page this code could not read is kept throughout,
 * because only the first is a claim about the company.
 *
 *   node scripts/brand-catalogue.mjs --robots          # permission survey only, nothing fetched
 *   node scripts/brand-catalogue.mjs --robots --json   # same, machine-readable
 *   node scripts/brand-catalogue.mjs --discover        # survey and discovery, no product read
 *   node scripts/brand-catalogue.mjs                   # survey, discovery, then collection
 */
import fs from 'node:fs';
import path from 'node:path';
import { fetchRobots, groupFor, isAllowed } from './lib/robots.mjs';
import { Fetcher, parseSitemap } from './lib/fetcher.mjs';
import { buildMatcher } from './lib/formulation-names.mjs';
import { extractProduct } from './lib/product-extract.mjs';

const ROBOTS_ONLY = process.argv.includes('--robots');
const AS_JSON = process.argv.includes('--json');

/**
 * WAVE 2: the whole product range, not only the formulary names.
 *
 * Wave 1 identifies a candidate by matching the product's URL slug against the 101 formulary
 * entries transcribed here, which is the right way to fetch nothing on the chance that it might
 * be relevant. It also makes the resulting measurement a sample of one kind of product, and the
 * disclosure comparison states figures like "a list on 48 of 53 pages" that read as facts about a
 * company when they are facts about its classical range.
 *
 * Two things wave 2 answers that wave 1 structurally cannot:
 *
 *   1. Of EVERYTHING a company sells, how much does it document? A company may publish a full
 *      composition for a classical arishta and nothing for its proprietary syrup, or the reverse,
 *      and wave 1 cannot tell the difference.
 *   2. How much does the slug matcher miss? A classical preparation whose URL spells its name a
 *      way the matcher does not reach is invisible to wave 1 and uncounted. Reading the range and
 *      matching on the page's own composition text measures the matcher's recall instead of
 *      assuming it.
 *
 * This is thousands of pages belonging to other people, so the caps are tighter rather than
 * looser: `--limit` bounds the pages read PER HOST, the per-host delay and Crawl-delay are
 * unchanged, and whatever a cap cuts is reported rather than hidden. `--wave2 --discover` counts
 * the population and fetches no product page at all.
 */
const WAVE2 = process.argv.includes('--wave2');
const limitIdx = process.argv.indexOf('--limit');
const PER_HOST_LIMIT = limitIdx > -1 ? Number(process.argv[limitIdx + 1]) : Infinity;

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
  /**
   * Our own store is FIRST and is measured by exactly the same instrument as everyone else.
   *
   * A survey of what other companies publish, run by a company that sells into the same category
   * and exempted itself from the survey, would be worthless. So Age Ayurveda is a row like any
   * other, its pages are read the same way, and whatever the measurement says about it is what
   * gets published. It currently publishes no composition for its Chyawanprash, which is the same
   * finding the survey records against several of the companies below.
   */
  { id: 'ageayurveda', name: 'Age Ayurveda', origin: 'https://ageayurveda.com', ours: true },
  { id: 'dabur', name: 'Dabur', origin: 'https://www.dabur.com' },
  { id: 'patanjali', name: 'Patanjali Ayurved', origin: 'https://www.patanjaliayurved.net' },
  { id: 'baidyanath', name: 'Baidyanath', origin: 'https://www.baidyanathayurved.com' },
  { id: 'maharishi', name: 'Maharishi Ayurveda', origin: 'https://maharishiayurvedaindia.com' },
  { id: 'himalaya', name: 'Himalaya Wellness', origin: 'https://himalayawellness.in' },
  { id: 'zandu', name: 'Zandu', origin: 'https://zanducare.com' },
  { id: 'charak', name: 'Charak Pharma', origin: 'https://charak.com' },
  { id: 'aryavaidyasala', name: 'Arya Vaidya Sala Kottakkal', origin: 'https://www.aryavaidyasala.com' },
  /**
   * vaidyaratnam.com 301-redirects to vaidyaratnammooss.com, and the survey had been reading the
   * redirect stub: 64 bytes, no sitemap, so the company was published for two runs as one whose
   * "catalogue could not be enumerated". The real domain allows everything (`Disallow:` with an
   * empty value) and serves a working sitemap. The finding was about our own list of origins.
   */
  { id: 'vaidyaratnam', name: 'Vaidyaratnam Oushadhasala', origin: 'https://vaidyaratnammooss.com' },
  { id: 'sdl', name: 'Shree Dhootapapeshwar', origin: 'https://www.sdlindia.com' },
  { id: 'unjha', name: 'Unjha Pharmacy', origin: 'https://unjhapharmacy.com' },

  /**
   * WAVE 3: the classical pharmacies, added because the survey was measuring the wrong industry.
   *
   * The twelve above are mostly consumer FMCG houses. Four of them are classical pharmacies and
   * three of those produced nothing: Arya Vaidya Sala declined the crawler, Vaidyaratnam and Unjha
   * publish no readable sitemap. So the entire classical-pharmacy segment rested on Shree
   * Dhootapapeshwar, which is also the best discloser in the survey by a wide margin, at 89%.
   *
   * One data point cannot carry that, and it is the segment where the measurement matters most:
   * a company whose proposition IS the classical formulation is the company a reader most wants to
   * check against the formulary entry. A survey that reads six consumer brands and one classical
   * pharmacy and then says something about "Ayurvedic manufacturers" is describing the first group
   * and implying the second.
   *
   * Every origin here was confirmed against the company's own site before being added, because
   * publishing "this company publishes nothing" about a lookalike domain would be worse than not
   * publishing at all. Oushadhi is owned by the Government of Kerala and states roughly 450
   * formulations, which makes it the single most interesting catalogue in the survey.
   */
  { id: 'avp', name: 'The Arya Vaidya Pharmacy, Coimbatore', origin: 'https://avpayurveda.com' },
  { id: 'oushadhi', name: 'Oushadhi', origin: 'https://www.oushadhi.org' },
  { id: 'keralaayurveda', name: 'Kerala Ayurveda', origin: 'https://keralaayurveda.com' },
  { id: 'nagarjuna', name: 'Nagarjuna Herbal Concentrates', origin: 'https://www.nagarjunaayurveda.com' },
  { id: 'sitaram', name: 'Sitaram Ayurveda', origin: 'https://sitaramayurveda.com' },
  { id: 'sna', name: 'SNA Oushadhasala', origin: 'https://www.snaoushadhasala.com' },
  { id: 'avn', name: 'AVN Ayurveda', origin: 'https://www.avnayurveda.com' },
  { id: 'sandu', name: 'Sandu Pharmaceuticals', origin: 'https://sandu.in' },
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
/**
 * Two kinds added after two published figures came out wrong, both against the company.
 *
 *   asset      A stylesheet, script, font or image is not a product, and it reached the candidate
 *              set because a catalogue page links to its own CSS. Vaidyaratnam was credited with
 *              four stylesheets among "44 products".
 *   furniture  About, contact, privacy, careers, login: every site has them and none of them is a
 *              product. Of Vaidyaratnam's 44 candidates, not one was a product and most were
 *              these; of Oushadhi's 142, fifty-five were, which turned 76% quantity disclosure
 *              into 47% by padding the denominator.
 *
 * Both are classified ahead of everything else, because the point is that no later rule can
 * promote them. The checks are cheap and they are the ones that have actually fired: hand
 * inspection caught both of these, and hand inspection does not scale past about twenty companies.
 */
const ASSET_EXT = /\.(css|js|mjs|json|xml|txt|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|pdf|zip|mp4|webm|mp3)$/i;
const FURNITURE = new RegExp('(^|/)(' + [
  'about', 'about-us', 'contact', 'contact-us', 'privacy', 'privacy-policy', 'terms',
  'terms-conditions', 'refund_returns', 'shipping-policy', 'career', 'careers', 'jobs',
  'login', 'register', 'signin', 'sign-in', 'account', 'cart', 'checkout', 'search',
  'gallery', 'photo-gallery', 'testimonials', 'awards', 'awards-and-recognitions',
  'services', 'clinics', 'hospital', 'doctors', 'tenders', 'downloads', 'rti-act',
  'quality-policy', 'publications', 'research', 'research-institute', 'academic', 'museum',
  'manufacturing', 'directors', 'officers', 'departments', 'notice-board', 'newsletter',
  'sitemap', 'faq', 'franchise', 'dealers', 'distributors', 'vendorlogin', 'consultonline',
].join('|') + ')(/|$)', 'i');

export const urlKind = (u) => {
  const p = new URL(u).pathname.toLowerCase();
  if (ASSET_EXT.test(p)) return 'asset';
  if (/(^|\/)(blogs?|blog-detail|press-releases?|news|articles?|media|stories|pages)(\/|$)/.test(p)) return 'editorial';
  if (/~n\d+$/.test(p)) return 'editorial';
  if (/(^|\/)(collections?|category|categories|shop)(\/|$)/.test(p)) return 'collection';
  if (/(^|\/)(products?|our-brand|item)(\/|$)/.test(p)) return 'product';
  if (FURNITURE.test(p)) return 'furniture';
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

/**
 * When a host publishes no sitemap, walk its own links instead, bounded hard.
 *
 * Three companies in this survey publish nothing a sitemap walk can read, and they were recorded
 * for two runs as catalogues that "could not be enumerated". One of those was our own stale
 * origin. The other two are real: Oushadhi 302-redirects every sitemap path to a soft 404, and
 * Unjha Pharmacy 404s all of them. Oushadhi is owned by the Government of Kerala and states
 * roughly 450 formulations, which makes it the single catalogue in this survey most worth reading,
 * and "they have no sitemap" is a fact about their web stack rather than a reason to say nothing
 * about them.
 *
 * So: start at the home page, follow only links that look like a catalogue listing, and collect
 * same-host URLs. Bounded three ways, because this is a crawl of someone else's site without the
 * map they would have given us if they had one: a cap on pages FETCHED, a depth cap, and
 * same-host only. Whatever a cap cuts is reported. The per-host delay and robots check are the
 * Fetcher's and are unchanged, so this is not a faster or looser crawl, only a blinder one.
 */
const LISTING = /(^|\/)(products?|shop|collections?|product-category|catalogue|catalog|medicines?|patent-products|s-products)(\/|$)/i;

const walkLinks = async (fetcher, origin, { maxFetch = 120, maxDepth = 3 } = {}) => {
  const host = new URL(origin).hostname.replace(/^www\./, '');
  const pages = new Set();
  /**
   * URLs found on a page that is itself a catalogue listing. This is the only reliable way to know
   * a product page when the URL does not say so: a company's catalogue is what its catalogue page
   * links to. Vaidyaratnam serves proprietary products as top-level slugs (/wormivos-tablets,
   * /trigonil-tablet) with no formulary name to match on and no /product/ segment to classify by,
   * so neither the name matcher nor urlKind can see them. Its /products page can.
   */
  const fromListing = new Set();
  const seen = new Set();
  const notes = [];
  let queue = [{ url: origin.replace(/\/$/, '') + '/', depth: 0 }];
  let fetched = 0;

  while (queue.length && fetched < maxFetch) {
    const { url, depth } = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);

    const res = await fetcher.get(url);
    fetched += 1;
    if (res.refused) { notes.push(`refused: ${url} (${res.refused})`); continue; }
    if (!res.body || res.status !== 200) { notes.push(`${res.status ?? res.error}: ${url}`); continue; }

    const next = [];
    for (const m of res.body.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
      let u;
      try { u = new URL(m[1], url); } catch { continue; }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') continue;
      if (u.hostname.replace(/^www\./, '') !== host) continue;
      u.hash = '';
      u.search = '';
      const clean = u.toString();
      pages.add(clean);
      // Linked FROM a listing page, and not itself one, so it is a leaf of the catalogue.
      if (LISTING.test(new URL(url).pathname) && !LISTING.test(u.pathname)) fromListing.add(clean);
      if (depth < maxDepth && LISTING.test(u.pathname) && !seen.has(clean)) next.push({ url: clean, depth: depth + 1 });
    }
    // Listing pages first, so the fetch cap is spent on the catalogue rather than on the About page.
    queue = [...queue, ...next];
  }
  if (queue.length) notes.push(`link-crawl fetch cap reached after ${fetched} pages, ${queue.length} listing page(s) not followed`);
  notes.push(`link crawl: ${pages.size} url(s) from ${fetched} page(s) fetched, `
    + `${fromListing.size} of them linked from a catalogue listing`);
  return { pages: [...pages], fromListing, docs: fetched, notes };
};

/**
 * GUARD: a survey that cannot read a quarter of its hosts is a BROKEN RUN, not a finding.
 *
 * "Unknown reads as closed" is the right politeness rule and it is kept. What it must not do is
 * combine with "write whatever you collected" to destroy a good dataset. On one run 13 of 20
 * hosts returned an unreadable robots.txt for transient reasons, every one of them was correctly
 * closed, the collection therefore had nothing to read, and the script wrote `complete: true` with
 * zero records over a complete 6,099-record file. Each step behaved as designed and the result was
 * data loss.
 *
 * The likely cause is worth recording too: three research workflows were running at the same time,
 * roughly 38 agents fetching Ayurvedic company sites through their own HTTP client, which does not
 * share this Fetcher's per-host delay. Do not run the collector and a fetching workflow against the
 * same estate at once.
 */
const UNREADABLE_LIMIT = 0.25;
const unreadable = survey.filter((b) => b.robots.verdict === 'unknown');
if (unreadable.length > survey.length * UNREADABLE_LIMIT) {
  console.error('');
  console.error(`ABORTING: robots.txt was unreadable for ${unreadable.length} of ${survey.length} hosts.`);
  console.error('That is a transport failure, not a set of refusals, and a run that proceeds from here');
  console.error('collects almost nothing and would overwrite the previous dataset with it.');
  for (const b of unreadable.slice(0, 8)) console.error(`  ${b.id}: ${b.robots.note ?? 'unreadable'}`);
  console.error('');
  console.error('Check connectivity, make sure no fetching workflow is running against these hosts,');
  console.error('and re-run. Nothing was written.');
  process.exit(1);
}

console.log('\n--- discovery: candidate products from each host\'s own sitemap ---\n');

const fetcher = new Fetcher({ ua: UA, cacheDir: path.join('data', 'brands', 'cache') });
const discovery = [];

for (const b of survey) {
  if (b.robots.verdict === 'unknown' || !b.catalogueReadable) {
    discovery.push({ ...b, skipped: 'robots.txt does not permit the catalogue', pages: 0, candidates: [] });
    console.log(`${pad(b.id, 16)}skipped, ${b.robots.verdict === 'unknown' ? 'robots.txt unreadable' : 'catalogue disallowed'}`);
    continue;
  }
  let { pages, docs, notes } = await walkSitemaps(fetcher, b.origin);
  /**
   * The link crawl runs when the sitemap gave us no PRODUCT, not only when it gave us no page.
   *
   * Vaidyaratnam's sitemap lists 216 URLs and classifies as one product, because its products are
   * top-level slugs. Reporting that as a one-product company would have been our classifier's
   * limitation published as a fact about them, which is the same mistake the Nagarjuna case was
   * nearly recorded as. So where the sitemap yields nothing product-shaped, the catalogue page is
   * asked instead, and the two sets are unioned.
   */
  /**
   * PROMOTING A LISTING'S LINKS TO PRODUCTS WAS A MISTAKE, and it is recorded rather than quietly
   * removed, because it produced wrong figures about two named companies before it was caught.
   *
   * The idea was that a company's catalogue is whatever its catalogue page links to, which is true
   * of a catalogue page and false of the page a catalogue link actually lands on. A `/products`
   * page links to its navigation, its stylesheets and its dosage-form categories as well. Promoted
   * wholesale, Vaidyaratnam acquired 44 "products" of which not one was a product: /about-us,
   * /clinics, /privacy, and four CSS files. Oushadhi acquired 55 pieces of furniture alongside its
   * 87 real ones, which pushed its quantity disclosure from 76% of its product pages down to 47%
   * of a denominator full of favicons. Both errors ran against the company.
   *
   * What survives, and is enough: the link crawl as a way to DISCOVER urls where no sitemap exists.
   * Oushadhi's product pages live under /product/, which urlKind already recognises, so discovery
   * was the only thing missing. Vaidyaratnam serves its products as top-level slugs that nothing
   * here can tell apart from /clinics or /about-us, so its individual product pages stay
   * unidentified and the page says so instead of publishing a number built out of its navigation.
   */
  if (!pages.some((u) => urlKind(u) === 'product')) {
    const viaLinks = await walkLinks(fetcher, b.origin);
    pages = [...new Set([...pages, ...viaLinks.pages])];
    docs += viaLinks.docs;
    notes = [...notes, ...viaLinks.notes];
  }

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
    let kind = urlKind(url);
    /**
     * A product page that lives at the site root, which `urlKind` cannot recognise and which is
     * not the same situation as a company having no product pages at all.
     *
     * Vaidyaratnam serves every product as a top-level slug: /thrunapanchamooladi-kashayam,
     * /vyoshadigulgulu-tablet. No /product/ segment anywhere, so all of them classified as "other"
     * and the company was reported as selling one product out of a 216-URL sitemap. Nagarjuna
     * genuinely has no product pages; this is our classifier failing to see them, and the two must
     * not read the same in the output.
     *
     * The promotion is deliberately narrow, because the kind filter exists to stop a blog post
     * that merely mentions a formulation being read as a product. It applies only where the slug
     * ALREADY matched a formulary name and the path is a single segment. Vaidyaratnam's 170 blog
     * posts live under /blog/ and so cannot qualify, and a page like /ayurveda matches no name.
     */
    if (kind === 'other' && hits.length && segs.length === 1) kind = 'product';
    for (const h of hits) {
      const row = { url, slug: h.slug, matchedOn: seg, via: h.matched, kind };
      if (kind === 'product') candidates.push(row); else dropped.push(row);
    }
  }
  /**
   * In wave 2 every product-kind URL is a candidate, whether or not its slug matched a formulary
   * name. The slug match is kept on the rows that have one, because knowing which pages wave 1
   * would also have found is what makes the two waves comparable.
   */
  if (WAVE2) {
    const already = new Set(candidates.map((c) => c.url));
    for (const url of pages) {
      if (already.has(url)) continue;
      if (urlKind(url) !== 'product') continue;
      const segs = decodeURIComponent(new URL(url).pathname).split('/').filter(Boolean);
      while (segs.length && /^\d+$/.test(segs[segs.length - 1])) segs.pop();
      candidates.push({ url, slug: null, matchedOn: segs[segs.length - 1] ?? '', via: null, kind: 'product' });
      already.add(url);
    }
  }

  const distinct = new Set(candidates.map((c) => c.slug).filter(Boolean));
  const droppedBy = {};
  for (const d of dropped) droppedBy[d.kind] = (droppedBy[d.kind] ?? 0) + 1;
  discovery.push({ ...b, pages: pages.length, sitemapDocs: docs, notes, candidates, droppedNonProduct: droppedBy });
  const dropNote = Object.entries(droppedBy).map(([k, v]) => `${v} ${k}`).join(', ');
  console.log(`${pad(b.id, 16)}${pad(`${pages.length} urls`, 12)}${pad(`${docs} sitemaps`, 13)}${pad(`${candidates.length} products / ${distinct.size} formulations`, 34)}${dropNote ? `dropped ${dropNote}` : ''}`);
  for (const note of notes.slice(0, 3)) console.log(`${' '.repeat(16)}note: ${note}`);
}

/**
 * The same collapse guard as the products file, because the failed run took this one too.
 *
 * discovery.json carries each host's page count, candidate list and the notes that brand-disclosure
 * turns into the sentence a reader sees explaining why a company has no measured page. When the
 * aborted run wrote zeros here, Nagarjuna's row changed from "its sitemap lists no individual
 * product page" to "no readable sitemap was found" — a different and false statement about a named
 * company, produced with no code change at all. Guarding only the products file was half a fix.
 */
const out = path.join('data', 'brands', 'discovery.json');
const previousPages = fs.existsSync(out)
  ? (() => { try { return (JSON.parse(fs.readFileSync(out, 'utf8')).brands ?? []).reduce((a, b) => a + (b.pages ?? 0), 0); } catch { return 0; } })()
  : 0;
const thisPages = discovery.reduce((a, b) => a + (b.pages ?? 0), 0);
if (previousPages && thisPages < previousPages * 0.5 && !process.argv.includes('--force')) {
  console.error('');
  console.error(`REFUSING TO WRITE ${out}: this run enumerated ${thisPages} pages; the file holds ${previousPages}.`);
  console.error('A drop that size means hosts were unreachable, not that their catalogues shrank. The');
  console.error('existing file is untouched. Investigate, or pass --force if the drop is real.');
  process.exit(1);
}

fs.writeFileSync(out, `${JSON.stringify({
  agent: UA,
  discoveredOn: new Date().toLocaleDateString('en-CA'),
  formulationsLookedFor: FORMULATIONS.length,
  brands: discovery,
}, null, 2)}\n`);

if (process.argv.includes('--discover')) {
  console.log('\n--discover: candidate discovery only. No product page was read.');
}

// ---------------------------------------------------------------------------------------------
// Collection. Read each candidate and record what the page states, as facts about the page.
// ---------------------------------------------------------------------------------------------

const products = [];

/**
 * The output path and the writer, hoisted so collection can checkpoint after every host.
 *
 * A wave-2 run died of heap exhaustion 48 minutes and nine hosts into a crawl of other people's
 * servers, and because the file was written once at the end, every one of those nine hosts was
 * lost and had to be read again. The cost of being wrong here is not our time, it is their
 * bandwidth. So the file is rewritten after each host: a crash now costs the host in flight.
 */
const outP = path.join('data', 'brands', WAVE2 ? 'products-wave2.json' : 'products.json');
/**
 * The checkpoint write has to be ATOMIC, because hosts now finish concurrently.
 *
 * writeProducts runs after each host completes, and with 16 hosts in flight two of them can finish
 * inside the same tick. Two overlapping writeFileSync calls on one path can leave a half-written
 * file on disk, and the whole point of checkpointing is that a crash leaves something valid. So
 * the payload goes to a temp file and is renamed over the target: rename is atomic on this
 * filesystem, so a reader sees either the previous complete file or the new one, never a partial.
 */
/**
 * GUARD: never replace a dataset with a drastically smaller one without being told to.
 *
 * The companion to the abort above, and the one that would have saved the file regardless of why
 * the run went wrong. A published figure's denominator lives in this file; a run that collects a
 * fraction of the last one has either lost hosts or lost its mind, and in both cases the right
 * move is to keep what is known and say so.
 */
const PREVIOUS = fs.existsSync(outP)
  ? (() => { try { return JSON.parse(fs.readFileSync(outP, 'utf8')).products?.length ?? 0; } catch { return 0; } })()
  : 0;
const COLLAPSE_LIMIT = 0.5;
const FORCE = process.argv.includes('--force');

const writeProducts = (complete) => {
  if (complete && PREVIOUS && products.length < PREVIOUS * COLLAPSE_LIMIT && !FORCE) {
    console.error('');
    console.error(`REFUSING TO WRITE: this run collected ${products.length} records; ${outP} already holds ${PREVIOUS}.`);
    console.error('A collapse that size means hosts were lost, not that the industry shrank.');
    console.error('The existing file is untouched. Investigate, or pass --force if the drop is real.');
    process.exitCode = 1;
    return;
  }
  const tmp = `${outP}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({
    agent: UA,
    wave: WAVE2 ? 2 : 1,
    perHostLimit: Number.isFinite(PER_HOST_LIMIT) ? PER_HOST_LIMIT : null,
    collectedOn: new Date().toLocaleDateString('en-CA'),
    // Set only when the run reached the end. A consumer must be able to tell a complete survey
    // from one that stopped partway, because the difference is a denominator.
    complete,
    brandsCollected: [...new Set(products.map((p) => p.brand))],
    note: (WAVE2
      ? 'Wave 2: every product-kind page on each permitted host, not only those whose slug matched '
        + 'a formulary name. A record with a null `formulation` is one wave 1 would not have found. '
      : '')
      + 'Facts about each page as it was served to this agent on the date recorded. A composition '
      + 'state of "absent" means the page carried substantial readable text and no composition in it; '
      + '"unreadable" means the page carried almost no text, which on these sites means it renders '
      + 'client-side. The two are never merged, because only the first is a claim about the company.',
    products,
  }, null, 2)}\n`);
  fs.renameSync(tmp, outP);
};

/**
 * ACROSS HOSTS IN PARALLEL, within each host still one request at a time.
 *
 * The per-host floor is the politeness guarantee and it is untouched: Fetcher keeps `lastAt` per
 * ORIGIN, and each host is handled by exactly one task here, so no origin ever has two requests in
 * flight and the stated Crawl-delay still governs. What changes is only that different companies'
 * servers are read at the same time, which is no different from two people browsing two shops.
 *
 * The reason is arithmetic. 20 companies took about 75 minutes sequentially; 70 would be most of a
 * day in one process, and a crawl that long is one that gets interrupted, which is how two runs
 * already produced nothing. The cap is deliberately well under the host count so the machine is
 * not opening seventy sockets at once.
 *
 * This is NOT a licence to raise the rate. If a future change makes two tasks share an origin, the
 * guarantee breaks silently, so the assertion below exists: one task per origin, checked.
 */
const HOST_CONCURRENCY = 16;

const mapHosts = async (items, worker) => {
  const origins = items.map((b) => new URL(b.origin).origin);
  if (new Set(origins).size !== origins.length) {
    throw new Error('two brands share an origin, so parallel hosts would double that host\'s rate');
  }
  const queue = [...items];
  const runners = Array.from({ length: Math.min(HOST_CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const b = queue.shift();
      if (b) await worker(b);
    }
  });
  await Promise.all(runners);
};

if (!process.argv.includes('--discover')) {
  console.log(`\n--- collection: reading each candidate product page, ${HOST_CONCURRENCY} hosts at a time ---\n`);
  await mapHosts(discovery, async (b) => {
    const all = b.candidates ?? [];
    if (!all.length) return;
    /**
     * The per-host cap, applied so that a formulary-name match is never the thing it cuts: those
     * are what the published comparison rests on, and a wave-2 run that silently dropped some of
     * them would move figures already on a page. Everything else follows in sitemap order.
     */
    const ranked = [...all].sort((x, y) => (y.slug ? 1 : 0) - (x.slug ? 1 : 0));
    const cands = Number.isFinite(PER_HOST_LIMIT) ? ranked.slice(0, PER_HOST_LIMIT) : ranked;
    if (cands.length < all.length) {
      console.log(`${' '.repeat(16)}note: per-host limit cut ${all.length - cands.length} of ${all.length} pages, all of them unmatched by name`);
    }
    // One record per (product URL, formulation), because a combo pack genuinely names two.
    for (const c of cands) {
      const res = await fetcher.get(c.url);
      if (res.refused) { products.push({ brand: b.id, ...c, outcome: 'refused', detail: res.refused }); continue; }
      if (!res.body || res.status !== 200) { products.push({ brand: b.id, ...c, outcome: 'unavailable', status: res.status ?? null, detail: res.error ?? null }); continue; }
      /**
       * FLATTEN the extracted strings, or the whole crawl is held in memory.
       *
       * Everything extractProduct returns is a substring of the page: the composition snippet,
       * each quantity's `raw` context, the product name. V8 represents those as sliced strings,
       * which keep a pointer to the ENTIRE parent. So one 15-character product name holds its
       * 500 KB of HTML alive, and the array of them holds every page ever read.
       *
       * This is why two wave-2 runs died of heap exhaustion at 2 GB while the records they had
       * accumulated measured 4.2 MB on disk. Measured, not guessed: 30 ten-character slices of
       * 2 MB strings retain 58 MB. A JSON round-trip builds fresh flat strings and drops every
       * parent reference, and it is the whole fix.
       */
      const x = JSON.parse(JSON.stringify(extractProduct(res.body)));
      products.push({
        brand: b.id,
        brandName: b.name,
        formulation: c.slug,
        matchedByName: Boolean(c.slug),
        url: c.url,
        matchedOn: c.matchedOn,
        outcome: 'read',
        fetchedAt: res.fetchedAt,
        httpStatus: res.status,
        // Carried on every record: a figure here is only usable if we can still say the page
        // permitted being read at the moment it was read.
        robots: res.robots ?? null,
        ...x,
      });
    }
    const read = products.filter((p) => p.brand === b.id && p.outcome === 'read');
    const found = read.filter((p) => p.composition.state === 'found');
    const withQty = read.filter((p) => p.quantityCount > 0);
    const unreadable = read.filter((p) => p.composition.state === 'unreadable');
    console.log(`${pad(b.id, 16)}${pad(`${read.length} read`, 10)}${pad(`${found.length} with a composition`, 24)}${pad(`${withQty.length} with a quantity`, 22)}${unreadable.length ? `${unreadable.length} render client-side` : ''}`);
    writeProducts(false);
    // Printed per host so heap growth is visible during the run rather than inferred from a crash.
    console.log(`${' '.repeat(16)}heap ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB after ${products.length} records`);
  });

  writeProducts(true);

  const read = products.filter((p) => p.outcome === 'read');
  const found = read.filter((p) => p.composition.state === 'found');
  const withQty = read.filter((p) => p.quantityCount > 0);
  const citesAfi = read.filter((p) => (p.authorities ?? []).some((a) => a.id === 'afi'));
  const citesAny = read.filter((p) => (p.authorities ?? []).length > 0);
  const doseFound = read.filter((p) => p.dose.state === 'found');

  console.log('');
  // A host dropped for an unreadable robots.txt makes the whole dataset smaller, and a smaller
  // dataset that does not announce itself is how a transient failure becomes a published number.
  const dropped = survey.filter((b) => b.robots.verdict === 'unknown');
  if (dropped.length) {
    console.log('');
    console.log(`WARNING: ${dropped.length} host(s) were skipped because robots.txt could not be read, so this`);
    console.log('run covers less than the last one did. Re-run before using the result:');
    for (const b of dropped) console.log(`  ${b.id}: ${b.robots.note}`);
    console.log('');
  }
  console.log(`read                       ${read.length} of ${products.length} candidate pages`);
  console.log(`name their ingredients     ${found.length}`);
  console.log(`state any quantity         ${withQty.length}`);
  console.log(`state a dose               ${doseFound.length}`);
  console.log(`cite the formulary         ${citesAfi.length}`);
  console.log(`cite any authority at all  ${citesAny.length}`);
  console.log(`fetch stats: ${fetcher.stats.fetched} fetched, ${fetcher.stats.cached} from cache, ${fetcher.stats.refused} refused, ${fetcher.stats.failed} failed`);
  console.log(`\nwrote ${outP}`);
}

const total = discovery.reduce((a, b) => a + (b.candidates?.length ?? 0), 0);
const byFormulation = new Map();
for (const b of discovery) for (const c of b.candidates ?? []) {
  if (!byFormulation.has(c.slug)) byFormulation.set(c.slug, new Set());
  byFormulation.get(c.slug).add(b.id);
}
const ranked = [...byFormulation.entries()].sort((a, b) => b[1].size - a[1].size);

console.log(`\n${total} candidate product pages across ${byFormulation.size} of ${FORMULATIONS.length} formulations`
  + (WAVE2 ? `, of which ${discovery.reduce((a, b) => a + (b.candidates ?? []).filter((c) => !c.slug).length, 0)} matched no formulary name.` : '.'));
console.log(`fetch stats: ${fetcher.stats.fetched} fetched, ${fetcher.stats.cached} from cache, ${fetcher.stats.refused} refused, ${fetcher.stats.failed} failed\n`);
console.log('Formulations carried by the most companies, which are the ones a comparison can cover:');
for (const [slug, brands] of ranked.slice(0, 30)) {
  console.log(`  ${pad(slug, 30)}${brands.size}  ${[...brands].join(' ')}`);
}
console.log(`\nwrote ${out}`);
