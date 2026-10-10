#!/usr/bin/env node
/**
 * What does Bing actually hold of this site? The reachability question, asked of the one engine
 * whose webmaster API this project can read.
 *
 * WHY THIS EXISTS. Across every citation log, nighantu.ageayurveda.com has never once been cited:
 * 27 cited rows all time, every one of them the commercial store. The dashboard shows 40 Bing
 * impressions and 0 clicks. Two explanations fit that equally well and they call for opposite work:
 * the pages are not reachable, or they are reachable and lose. Nothing in this repository could
 * tell them apart, because GitHub Pages serves no logs and Search Console access for this property
 * is held by someone else.
 *
 * Bing can answer it. GetUrlInfo reports, per URL, whether Bing has a record of the page at all and
 * when it last crawled it. GetCrawlStats reports what the crawler met when it came. Together they
 * say whether this site is in the index, which is the thing every other measurement has assumed.
 *
 * WHY NOT IN CI, UNLIKE THE ZENODO DEPOSIT. The deposit runs in CI precisely so the token is never
 * handled by a person. This cannot: THIS REPOSITORY IS PUBLIC, so Actions logs and artifacts are
 * public too, and the output here is this project's own index coverage. data/DASHBOARD.md is
 * deliberately committed rather than published for exactly that reason. Running a scoreboard
 * through a public log would undo that decision silently.
 *
 * So the key stays in a local gitignored .env and the report is written to a gitignored path.
 *
 *   echo 'BING_API_KEY=...' >> .env          # .env and .env.* are gitignored
 *   node --env-file=.env scripts/bing-coverage.mjs
 *   node --env-file=.env scripts/bing-coverage.mjs --sample 120
 *
 * NEVER LOG A REQUEST URL FROM THIS FILE. The key travels as a querystring parameter, lib/fetch.mjs
 * returns the resolved url on the result object, and one console.log of that object would publish
 * the key into a terminal transcript. Everything printed here goes through redact().
 *
 * The parsing and sampling live in lib/bing-coverage.mjs so they can be tested; see
 * scripts/test/bing-coverage.test.mjs for why the date parser in particular is load-bearing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { get } from './lib/fetch.mjs';
import { SITE, BASE } from './monitors/config.mjs';
import { dotNetDate, sectionOf, stratify, redactor } from './lib/bing-coverage.mjs';

const KEY = process.env.BING_API_KEY;
const SITE_URL = process.env.BING_SITE_URL || `${SITE}${BASE}/`;
const API = 'https://ssl.bing.com/webmaster/api.svc/json';
const OUT_DIR = 'data/coverage';

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const SAMPLE = Number(argOf('--sample', 80));

/** Strip the key from anything before it reaches a log line or a written file. */
const redact = redactor(KEY);

if (!KEY) {
  console.error('BING_API_KEY is not set.');
  console.error('');
  console.error('Put it in a local .env, which is gitignored, and run with --env-file:');
  console.error("   echo 'BING_API_KEY=your-key' >> .env");
  console.error('   node --env-file=.env scripts/bing-coverage.mjs');
  console.error('');
  console.error('The key is in Bing Webmaster Tools under Settings, API Access, API Key.');
  console.error('Do not paste it into a chat transcript or a commit; .env keeps it out of both.');
  process.exit(1);
}

const call = async (method, params = {}) => {
  const qs = new URLSearchParams({ apikey: KEY, siteUrl: SITE_URL, ...params });
  const res = await get(`${API}/${method}?${qs}`, { retries: 1, timeoutMs: 25000 });
  if (!res.ok) {
    // res.error can carry a URL from the fetch layer, so it is redacted rather than trusted.
    return { error: `HTTP ${res.status}${res.error ? ` (${redact(res.error)})` : ''}` };
  }
  try {
    return { data: JSON.parse(res.text).d ?? null };
  } catch {
    return { error: `response was not JSON: ${redact(res.text).slice(0, 160)}` };
  }
};

/** Every URL the site publishes, from the built sitemap: the population to sample from. */
function sitemapUrls() {
  const f = 'dist/sitemap-0.xml';
  if (!fs.existsSync(f)) {
    console.error(`${f} not found. Run \`npm run build\` first: the sample is drawn from the`);
    console.error('sitemap so it reflects what the site actually publishes.');
    process.exit(1);
  }
  return [...fs.readFileSync(f, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

const all = sitemapUrls();
const sample = stratify(all, SAMPLE);
console.log(`Site publishes ${all.length} URLs. Asking Bing about ${sample.length} of them.\n`);

// ---- what the crawler met when it came -------------------------------------------------------
const crawl = await call('GetCrawlStats');
if (crawl.error) {
  console.log(`GetCrawlStats: ${crawl.error}`);
} else if (Array.isArray(crawl.data) && crawl.data.length) {
  const recent = crawl.data.slice(-7);
  const sum = (k) => recent.reduce((n, r) => n + (r[k] ?? 0), 0);
  console.log('Crawl, last 7 reported days');
  console.log(`  crawled pages     ${sum('CrawledPages')}`);
  console.log(`  in the index      ${sum('InIndex')}`);
  console.log(`  200 responses     ${sum('Code2xx')}`);
  console.log(`  301 / 302         ${sum('Code301')} / ${sum('Code302')}`);
  console.log(`  4xx / 5xx         ${sum('Code4xx')} / ${sum('Code5xx')}`);
  console.log(`  blocked by robots ${sum('BlockedByRobotsTxt')}`);
  console.log(`  dns failures      ${sum('DnsFailures')}`);
  console.log(`  timeouts          ${sum('ConnTimeout')}`);
} else {
  console.log('GetCrawlStats: no rows. Bing has no crawl history for this site url.');
}
console.log();

// ---- does Bing have a record of each page ----------------------------------------------------
const rows = [];
for (const [i, url] of sample.entries()) {
  const r = await call('GetUrlInfo', { url });
  if (r.error) {
    rows.push({ url, error: r.error });
  } else {
    const d = r.data ?? {};
    rows.push({
      url,
      lastCrawled: dotNetDate(d.LastCrawledDate),
      discovered: dotNetDate(d.DiscoveredDate),
      httpStatus: d.HttpStatus ?? null,
      isPage: d.IsPage ?? null,
      anchors: d.AnchorCount ?? null,
      // An empty object back means Bing answered and holds nothing for this URL, which is a
      // different fact from an error and is counted separately below.
      known: Object.keys(d).length > 0,
    });
  }
  if ((i + 1) % 20 === 0) console.log(`  ...${i + 1}/${sample.length}`);
  await new Promise((done) => setTimeout(done, 350)); // a polite client of someone else's API
}

const errored = rows.filter((r) => r.error);
const known = rows.filter((r) => !r.error && r.known);
const unknown = rows.filter((r) => !r.error && !r.known);
const crawled = known.filter((r) => r.lastCrawled);

console.log('\nWhat Bing holds, on the sample');
console.log(`  asked about        ${rows.length}`);
console.log(`  Bing has a record  ${known.length}`);
console.log(`  of those, crawled  ${crawled.length}`);
console.log(`  no record at all   ${unknown.length}`);
console.log(`  call failed        ${errored.length}`);
if (errored.length) console.log(`  first error        ${errored[0].error}`);

if (crawled.length) {
  const dates = crawled.map((r) => r.lastCrawled).sort();
  console.log(`  crawl dates span   ${dates[0]} to ${dates[dates.length - 1]}`);
  const statuses = {};
  for (const r of crawled) {
    const k = r.httpStatus ?? 'null';
    statuses[k] = (statuses[k] ?? 0) + 1;
  }
  console.log(`  last http status   ${JSON.stringify(statuses)}`);
}

// Per section, because "half the site is missing" and "one collection is missing" look identical
// in a total and call for completely different work.
const bySection = {};
for (const r of rows) {
  const s = sectionOf(r.url);
  bySection[s] ??= { asked: 0, known: 0, crawled: 0 };
  bySection[s].asked++;
  if (!r.error && r.known) bySection[s].known++;
  if (!r.error && r.lastCrawled) bySection[s].crawled++;
}
console.log('\nBy section');
for (const [s, v] of Object.entries(bySection).sort((a, b) => b[1].asked - a[1].asked)) {
  console.log(
    `  ${s.padEnd(14)} asked ${String(v.asked).padStart(3)}` +
    `  known ${String(v.known).padStart(3)}  crawled ${String(v.crawled).padStart(3)}`,
  );
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, 'bing-coverage.json');
fs.writeFileSync(out, `${redact(JSON.stringify({
  checkedAt: new Date().toISOString(),
  siteUrl: SITE_URL,
  publishedUrls: all.length,
  sampled: rows.length,
  summary: {
    known: known.length,
    crawled: crawled.length,
    unknown: unknown.length,
    errored: errored.length,
  },
  bySection,
  crawlStats: crawl.data ?? null,
  rows,
}, null, 2))}\n`);
console.log(`\nWritten to ${out} (gitignored).`);
