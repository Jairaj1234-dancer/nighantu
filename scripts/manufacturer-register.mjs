#!/usr/bin/env node
/**
 * A register of Indian Ayurvedic manufacturers, with each one's posture toward answer engines.
 *
 * WHY THIS IS WORTH PUBLISHING. There is no public list of who manufactures Ayurvedic medicine in
 * India and what each one publishes about it. AYUSH licences are issued by state licensing
 * authorities and the registers are state-held, mostly offline, and not joined to anything. The
 * trade associations publish member lists as PDFs or not at all. So the question "who makes
 * Ashokarishta and which of them tell you what is in it" has no citable answer anywhere, and
 * neither does the narrower question this project can answer precisely: which of them can be read
 * by an answer engine at all.
 *
 * WHAT MAKES THIS ONE DEFENSIBLE RATHER THAN A SCRAPE. Two separations are kept strictly.
 *
 * Candidates were FOUND by research agents working from association rosters, state directories and
 * trade listings. That work produced 231 distinct hosts and it is not trusted: it proposed a
 * gambling site, a parked domain, a betting blog, two wrong legal entities and one company already
 * counted under another name, every one caught by a verifier or by hand.
 *
 * Everything MEASURED here is measured by this script, deterministically, from the host itself:
 * the robots.txt status and verdict, which paths this agent may read, which named AI crawlers the
 * site addresses, and whether a catalogue is readable at all. The agents' own prose about robots
 * is discarded, because it came back in six different shapes, several of them a paragraph of
 * narrative where a boolean was needed. A field either comes from a fetch this script performed or
 * it is not in the register.
 *
 * THE ETHIC. One request for robots.txt per host, 1.2 seconds apart, identified as NighantuBot
 * with a URL that explains itself. Nothing else is fetched: this register records what each site
 * says about being read, not its contents. A site whose robots.txt cannot be read is recorded as
 * closed and left alone, per RFC 9309 and the note at the top of lib/robots.mjs.
 *
 *   node scripts/manufacturer-register.mjs --candidates <file.json>   measure and write
 *   node scripts/manufacturer-register.mjs --dry-run                  report, fetch nothing
 */
import fs from 'node:fs';
import path from 'node:path';
import { fetchRobots, groupFor, isAllowed } from './lib/robots.mjs';

/**
 * Declared here and not imported from brand-catalogue.mjs, which also exports it.
 *
 * That script runs its survey at module scope, so `import { UA } from './brand-catalogue.mjs'`
 * does not import a constant, it starts a crawl. That has already happened once in this project
 * from a one-line `node -e "import(...)"`, and a register script that silently launches the
 * product collector is a trap worth not building. The string must stay identical to the
 * collector's so the two surveys are comparable; if one changes, both change.
 */
const UA = 'NighantuBot/1.0 (+https://nighantu.ageayurveda.com/about/)';

const ARG = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const DRY = process.argv.includes('--dry-run');
const CANDIDATES = ARG('--candidates');
const OUT = path.join('data', 'brands', 'register.json');
const LIMIT = Number(ARG('--limit') ?? 0);

/** Paths probed per host. The same set the 20-company survey used, so the two are comparable. */
const PROBES = ['/', '/products/', '/product/', '/shop/', '/collections/all', '/product-category/',
  '/sitemap.xml', '/sitemap_index.xml'];
const OTHER_AGENTS = ['Googlebot', 'bingbot', 'GPTBot', 'ClaudeBot', 'CCBot', 'PerplexityBot'];

/**
 * Hosts the finding agents proposed that are not what they were proposed as.
 *
 * Kept as a named list rather than quietly dropped, because each one is a fact about how this
 * research goes wrong and the next pass should not have to rediscover it. All six were caught
 * before anything was published.
 */
const NOT_WHAT_IT_SEEMED = {
  'gurukulpharmacy.com': 'serves a gambling site, not a pharmacy',
  'dhanwanthari.com': 'parked domain',
  'punarnava.com': 'a different company of the same name, not the Ayurvedic manufacturer',
  'banlabs.com': 'wrong legal entity for the company it was proposed as',
  'pulamantholemooss.com': 'demonstration site, carries a Wichita, Kansas address',
  'captainbiotech.in': 'a betting blog',
  'krishnaherbals.com': 'already counted under another name in this register',
};

const host = (u) => {
  const m = String(u ?? '').match(/^(?:https?:\/\/)?(?:www\.)?([^\/?#:]+)/i);
  return m ? m[1].toLowerCase() : null;
};

if (!CANDIDATES) {
  console.error('Need --candidates <file.json>: the merged finding-agent output.');
  process.exit(2);
}
const raw = JSON.parse(fs.readFileSync(CANDIDATES, 'utf8'));

/**
 * Only `confirmed` candidates are measured.
 *
 * The finding workflows recorded a status per candidate and the non-confirmed values are all
 * reasons not to publish a row: squatted, unreachable, not-ayurvedic, wrong-entity, duplicate. A
 * candidate with no status at all was never verified by anything, so it is carried as a lead and
 * not measured, rather than promoted by silence. That distinction is the whole discipline here:
 * the last time a collector promoted unverified rows it put four CSS files and an /about-us page
 * into one company's product count.
 */
const excluded = [];
const leads = [];
const toMeasure = [];
for (const c of raw) {
  const h = host(c.domain) ?? c.host;
  if (!h) { excluded.push({ ...c, why: 'no host' }); continue; }
  if (NOT_WHAT_IT_SEEMED[h]) { excluded.push({ host: h, name: c.name, why: NOT_WHAT_IT_SEEMED[h] }); continue; }
  if (!c.status) { leads.push({ host: h, name: c.name, state: c.state ?? null }); continue; }
  if (c.status !== 'confirmed') { excluded.push({ host: h, name: c.name, why: `finding agents recorded status "${c.status}"` }); continue; }
  toMeasure.push({ host: h, name: c.name, state: c.state ?? null, origin: `https://${h}`,
    sellsClassical: c.sellsClassical === true, catalogueUrl: c.catalogueUrl ?? null });
}

console.log(`candidates read          ${raw.length}`);
console.log(`  confirmed, to measure  ${toMeasure.length}`);
console.log(`  leads, never verified  ${leads.length}`);
console.log(`  excluded               ${excluded.length}`);
for (const e of excluded.slice(0, 12)) console.log(`     ${String(e.host).padEnd(32)}${e.why}`);

if (DRY) {
  console.log('\nDry run. No host was contacted.');
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
let rows = [];

/**
 * Re-publish from the saved measurement without contacting anybody.
 *
 * The publishing half of this script changes far more often than the measurement does, and a
 * register that had to re-crawl 164 third-party hosts every time a CSV column was renamed would
 * be both slow and rude. The measurement is the expensive, externally-visible part; it is done
 * once and read back.
 */
const REPUBLISH = process.argv.includes('--republish');
const batch = LIMIT > 0 ? toMeasure.slice(0, LIMIT) : toMeasure;

if (REPUBLISH) {
  if (!fs.existsSync(OUT)) {
    console.error(`--republish needs ${OUT}, which does not exist. Run the measurement first.`);
    process.exit(1);
  }
  rows = JSON.parse(fs.readFileSync(OUT, 'utf8')).companies ?? [];
  console.log(`\nre-publishing ${rows.length} hosts from ${OUT}. No host contacted.`);
} else {
  console.log(`\nmeasuring ${batch.length} hosts, one robots.txt each\n`);
  console.log(`${pad('host', 34)}${pad('verdict', 10)}${pad('us', 10)}${pad('catalogue', 11)}AI crawlers named`);
}

for (const c of (REPUBLISH ? [] : batch)) {
  let r;
  try {
    r = await fetchRobots(c.origin, UA);
  } catch (err) {
    rows.push({ ...c, robots: { status: null, verdict: 'unknown', note: String(err?.message ?? err), groups: 0 },
      allowed: null, otherAgents: null, catalogueReadable: false, aiAgentsNamed: [] });
    console.log(`${pad(c.host, 34)}${pad('error', 10)}${pad('closed', 10)}${pad('no', 11)}`);
    await new Promise((res) => setTimeout(res, 1200));
    continue;
  }
  const group = r.groups ? groupFor(r.groups, UA) : null;
  const closed = r.verdict === 'unknown';
  const allowed = {};
  for (const p of PROBES) allowed[p] = closed ? false : isAllowed(group, p.split('?')[0]);
  const others = {};
  for (const a of OTHER_AGENTS) {
    const g = r.groups ? groupFor(r.groups, a) : null;
    others[a] = closed ? null : isAllowed(g, '/products/');
  }
  const aiAgentsNamed = [...new Set((r.groups ?? []).flatMap((g) => g.agents)
    .filter((a) => /gpt|claude|ccbot|perplexity|anthropic|openai|google-extended|applebot-extended|bytespider|meta-external/i.test(a)))];
  const catalogueReadable = Object.entries(allowed)
    .some(([p, ok]) => ok && p !== '/' && !p.startsWith('/sitemap'));

  rows.push({ ...c,
    robots: { status: r.status, verdict: r.verdict, note: r.note ?? null, groups: r.groups?.length ?? 0 },
    allowed, otherAgents: others, aiAgentsNamed, catalogueReadable });
  console.log(`${pad(c.host, 34)}${pad(r.verdict, 10)}${pad(closed ? 'closed' : (allowed['/'] ? 'allowed' : 'blocked'), 10)}`
    + `${pad(catalogueReadable ? 'readable' : 'no', 11)}${aiAgentsNamed.join(' ') || '(none)'}`);
  await new Promise((res) => setTimeout(res, 1200));
}

/**
 * The refusal gate, carried from the collector for the same reason it exists there.
 *
 * A pass where almost nothing could be read is far more likely to be this end of the connection
 * than 150 companies simultaneously closing their doors, and the first version of the product
 * collector wrote `complete: true` over 6,099 good records after 13 hosts transiently failed.
 * Writing nothing is recoverable. Overwriting a good register with a bad one is not.
 */
const unreadable = rows.filter((r) => r.robots.verdict === 'unknown').length;
if (rows.length >= 20 && unreadable / rows.length > 0.3) {
  console.error(`\nREFUSING TO WRITE: ${unreadable} of ${rows.length} hosts gave no readable robots.txt.`);
  console.error('That rate means this end of the connection, not that many sites closing at once.');
  process.exit(1);
}

/**
 * The state as the finding agents recorded it, reduced to the state.
 *
 * They returned "Uttar Pradesh", "Uttar Pradesh (Kasganj)", "Uttar Pradesh (Agra)" and
 * "Kerala (HQ); AYUSH plant at Bhagwanpur, Haridwar, Uttarakhand" as four different values, which
 * splits one state into four rows in any count by state. The city is dropped rather than kept in a
 * second field, because a city recorded by a research agent and never verified by a fetch does not
 * meet the standard the rest of this file is held to.
 */
const STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Jammu and Kashmir', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttarakhand', 'Uttar Pradesh',
  'West Bengal', 'Delhi', 'Puducherry', 'Chandigarh', 'Ladakh'];
const stateOf = (s) => STATES.find((st) => String(s ?? '').toLowerCase().startsWith(st.toLowerCase())) ?? null;
for (const r of rows) { r.stateAsReported = r.state; r.state = stateOf(r.state); }

const byVerdict = {};
for (const r of rows) byVerdict[r.robots.verdict] = (byVerdict[r.robots.verdict] ?? 0) + 1;
const blocksAnyAi = rows.filter((r) => r.otherAgents
  && ['GPTBot', 'ClaudeBot', 'CCBot', 'PerplexityBot'].some((a) => r.otherAgents[a] === false));
const namesAnyAi = rows.filter((r) => r.aiAgentsNamed.length > 0);

console.log('');
console.log(`hosts measured           ${rows.length}`);
console.log(`  robots verdicts        ${JSON.stringify(byVerdict)}`);
console.log(`  catalogue readable     ${rows.filter((r) => r.catalogueReadable).length}`);
console.log(`  address an AI crawler  ${namesAnyAi.length}`);
console.log(`  block at least one     ${blocksAnyAi.length}`);
console.log(`  states represented     ${new Set(rows.map((r) => r.state).filter(Boolean)).size}`);


/**
 * THE REGISTER IS MERGED, NEVER REPLACED.
 *
 * This wrote `companies: rows`, so running it with a candidates file containing only newly
 * verified hosts replaced the whole register with those hosts. Measuring 32 newly confirmed leads
 * therefore deleted the 164 already in it, and the only reason nothing was lost is that
 * src/data/manufacturer-register.json is committed and the previous version was one `git show`
 * away. data/brands/register.json is gitignored and had no such safety net.
 *
 * That is the second instance of exactly this fault in one day: check-retractions had the same
 * shape, where a later run could only see currently-cited papers and overwriting would have
 * un-blocked ten retracted ones. The lesson is the same both times. A file that accumulates
 * measurements must merge on its key and refuse to shrink, because the natural way to write it is
 * to write what this run produced, and the natural way to run it is on a subset.
 *
 * A host measured again is refreshed in place, so re-measuring is how a stale row is updated. A
 * host absent from this run keeps the measurement it had, with the date it was taken.
 */
const priorRows = fs.existsSync(OUT)
  ? (JSON.parse(fs.readFileSync(OUT, 'utf8')).companies ?? [])
  : [];
const mergedRows = new Map(priorRows.map((r) => [r.host, r]));
let freshlyMeasured = 0;
let refreshedRows = 0;
for (const r of rows) {
  if (mergedRows.has(r.host)) refreshedRows += 1; else freshlyMeasured += 1;
  mergedRows.set(r.host, { ...r, measuredOn: new Date().toLocaleDateString('en-CA') });
}
if (mergedRows.size < priorRows.length) {
  console.error(`\nREFUSING TO WRITE: the merged register (${mergedRows.size}) is smaller than the`);
  console.error(`one on disk (${priorRows.length}). A register must never shrink.`);
  process.exit(1);
}
rows = [...mergedRows.values()].sort((a, b) => String(a.host).localeCompare(String(b.host)));
console.log('');
console.log(`register merged          ${rows.length} hosts `
  + `(${freshlyMeasured} new, ${refreshedRows} refreshed, ${rows.length - freshlyMeasured - refreshedRows} retained)`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({
  agent: UA,
  measuredOn: new Date().toLocaleDateString('en-CA'),
  note: 'Candidates were found by research agents and are not trusted. Every field under `robots`, '
    + '`allowed`, `otherAgents`, `aiAgentsNamed` and `catalogueReadable` was measured by '
    + 'scripts/manufacturer-register.mjs from one robots.txt fetch per host. Nothing else was '
    + 'fetched. A host whose robots.txt could not be read is recorded as closed and was left alone.',
  companies: rows,
  leads,
  excluded,
}, null, 2)}\n`);
console.log(`\nwrote ${OUT}`);

/**
 * The published copy, which deliberately carries less than the working one.
 *
 * `leads` are candidates no verifier ever reached: the fourth finding wave lost all eleven of its
 * verification agents to a session limit, so its 127 names have nothing behind them but one
 * agent's say-so. Publishing a list of real companies on that basis would be the exact failure
 * this project refuses elsewhere, so only the COUNT is published and the names stay local until
 * something checks them.
 *
 * `excluded` is published, with reasons, because the reasons are observations about what a domain
 * serves rather than claims about a company, and because a register that silently dropped 14
 * candidates would be hiding the shape of its own gaps.
 */
const PUB = {
  name: 'Indian Ayurvedic manufacturers and what their websites permit',
  description: `${rows.length} Ayurvedic manufacturers in India, each with the website it publishes, `
    + 'the state it operates from, and what its robots.txt permits, measured one host at a time.',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  agent: UA,
  measuredOn: new Date().toLocaleDateString('en-CA'),
  method: 'Candidates were found by research agents working from association rosters, government '
    + 'directories and trade listings, and are not trusted: that work also proposed a gambling '
    + 'site, a parked domain and two wrong legal entities. Every permission field here was measured '
    + 'by one robots.txt fetch per host, 1.2 seconds apart, identified as NighantuBot. No product '
    + 'page was fetched. A host whose robots.txt could not be read is recorded as closed.',
  limits: 'This records what each site permits, not what it publishes or the quality of anything it '
    + 'makes. A company absent from this register is not absent from the industry. '
    + `${leads.length} further candidates are held back because no verification pass reached them.`,
  summary: {
    companies: rows.length,
    states: new Set(rows.map((r) => r.state).filter(Boolean)).size,
    robotsVerdicts: byVerdict,
    catalogueReadable: rows.filter((r) => r.catalogueReadable).length,
    nameAnyAiCrawler: namesAnyAi.length,
    blockAtLeastOneAiCrawler: blocksAnyAi.length,
    sellClassicalPreparations: rows.filter((r) => r.sellsClassical).length,
    unverifiedCandidatesHeldBack: leads.length,
  },
  companies: rows.map((r) => ({
    name: r.name, host: r.host, state: r.state, sellsClassical: r.sellsClassical,
    robots: r.robots, catalogueReadable: r.catalogueReadable, aiAgentsNamed: r.aiAgentsNamed,
    permits: r.otherAgents,
  })),
  excluded,
};
fs.writeFileSync(path.join('src', 'data', 'manufacturer-register.json'), `${JSON.stringify(PUB, null, 2)}\n`);
fs.writeFileSync(path.join('public', 'manufacturer-register.json'), `${JSON.stringify(PUB, null, 2)}\n`);

const cell = (v) => (v == null || v === '' ? '' : `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`);
const csv = [['company', 'website', 'state', 'sells_classical_preparations', 'robots_status',
  'robots_verdict', 'catalogue_readable_by_us', 'names_ai_crawlers', 'allows_googlebot',
  'allows_bingbot', 'allows_gptbot', 'allows_claudebot', 'allows_ccbot', 'allows_perplexitybot',
].join(',')];
for (const r of rows) {
  csv.push([r.name, r.host, r.state, r.sellsClassical ? 'yes' : 'no', r.robots.status,
    r.robots.verdict, r.catalogueReadable ? 'yes' : 'no', r.aiAgentsNamed.join(' '),
    ...['Googlebot', 'bingbot', 'GPTBot', 'ClaudeBot', 'CCBot', 'PerplexityBot']
      .map((a) => (r.otherAgents?.[a] === true ? 'yes' : r.otherAgents?.[a] === false ? 'no' : 'unreadable')),
  ].map(cell).join(','));
}
fs.writeFileSync(path.join('public', 'manufacturer-register.csv'), `${csv.join('\n')}\n`);
console.log(`wrote src/data/manufacturer-register.json, public/manufacturer-register.json and .csv (${rows.length} companies)`);
console.log(`held back ${leads.length} unverified candidates: names not published`);
