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
 *   node scripts/brand-catalogue.mjs --robots          # permission survey only, no product fetches
 *   node scripts/brand-catalogue.mjs --robots --json   # same, machine-readable
 */
import fs from 'node:fs';
import path from 'node:path';
import { fetchRobots, groupFor, isAllowed } from './lib/robots.mjs';

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
const pad = (s, n) => String(s).padEnd(n);
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

console.log('\nProduct collection is not implemented yet. Run with --robots.');
