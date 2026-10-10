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
import {
  dotNetDate, sectionOf, stratify, redactor, hasRealRecord, isThrottled, discoveryDateOf,
} from './lib/bing-coverage.mjs';

const KEY = process.env.BING_API_KEY;
const SITE_URL = process.env.BING_SITE_URL || `${SITE}${BASE}/`;
const API = 'https://ssl.bing.com/webmaster/api.svc/json';
const OUT_DIR = 'data/coverage';

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const SAMPLE = Number(argOf('--sample', 80));
/**
 * Bing throttles per host, and the first run found 350ms is far too fast. These are deliberately
 * unhurried: 80 URLs at 2.5s is about three and a half minutes, which is nothing against the cost
 * of a measurement that has to be thrown away.
 */
const GAP_MS = Number(argOf('--gap', 2500));
const THROTTLE_WAIT_MS = Number(argOf('--throttle-wait', 60000));

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

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const callOnce = async (method, params = {}) => {
  const qs = new URLSearchParams({ apikey: KEY, siteUrl: SITE_URL, ...params });
  const res = await get(`${API}/${method}?${qs}`, { retries: 0, timeoutMs: 25000 });
  if (!res.ok) {
    // res.error can carry a URL from the fetch layer, so it is redacted rather than trusted.
    const body = redact(res.text ?? '');
    if (isThrottled(res.status, body)) return { throttled: true };
    return { error: `HTTP ${res.status}${res.error ? ` (${redact(res.error)})` : ''} ${body.slice(0, 120)}`.trim() };
  }
  try {
    return { data: JSON.parse(res.text).d ?? null };
  } catch {
    return { error: `response was not JSON: ${redact(res.text).slice(0, 160)}` };
  }
};

/**
 * One call, with a real wait when Bing says it is being asked too fast.
 *
 * THE FIRST RUN OF THIS SCRIPT WAS A LESSON IN WHY THIS MATTERS. It paused 350ms between calls,
 * Bing throttled from call 21 onward, and 63 of 83 requests came back
 * `{"ErrorCode":5,"Message":"ERROR!!! ThrottleHost"}`. The report printed "no record at all: 0"
 * beside "call failed: 63", which is a rate limit dressed up as a finding about the site.
 *
 * Bing's throttle is per host and recovers on its own, so the answer is to wait rather than to
 * record a failure. If it is still throttling after the backoff, the run stops: a partial sample
 * is not a smaller measurement, it is a biased one, because the URLs that got through are the
 * early ones.
 */
const call = async (method, params = {}, { tries = 4 } = {}) => {
  for (let attempt = 0; attempt < tries; attempt++) {
    const r = await callOnce(method, params);
    if (!r.throttled) return r;
    if (attempt === tries - 1) return { error: 'throttled after backoff' };
    const wait = THROTTLE_WAIT_MS * 2 ** attempt;
    console.log(`  throttled, waiting ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
  return { error: 'unreachable' };
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

/**
 * THE SAMPLE MUST BE THE SAME URLS NEXT TIME, or the comparison is worthless.
 *
 * stratify() is deterministic, but it samples the CURRENT sitemap, and the sitemap changes as
 * pages are added. Re-running it in a week would draw a different set, so a change in the
 * known-to-Bing count could be the index moving or could be the sample moving, with no way to
 * tell which. That is the same confound that made the first run's output meaningless, arriving by
 * a different route.
 *
 * So the chosen URLs are written out, and --urls re-asks exactly that list.
 */
const all = sitemapUrls();
const URLS_FILE = argOf('--urls', null);
const sample = URLS_FILE
  ? fs.readFileSync(URLS_FILE, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  : stratify(all, SAMPLE);
if (URLS_FILE) console.log(`Re-asking the ${sample.length} URLs listed in ${URLS_FILE}.`);
console.log(`Site publishes ${all.length} URLs. Asking Bing about ${sample.length} of them.\n`);

// ---- what the crawler met when it came -------------------------------------------------------
const crawl = await call('GetCrawlStats');
if (crawl.error) {
  console.log(`GetCrawlStats: ${crawl.error}`);
} else if (Array.isArray(crawl.data) && crawl.data.length) {
  /**
   * SOME OF THESE FIELDS ARE DAILY COUNTS AND SOME ARE RUNNING TOTALS. Summing the wrong ones
   * invents numbers.
   *
   * An earlier version summed all of them over seven days and reported "in the index 2045" for a
   * site with 1,239 pages, and "4xx/5xx 0/7" as though there were a server error every day.
   * Reading the series settles it: CrawledPages fluctuates day to day, so it is a daily count;
   * InIndex, Code2xx and Code5xx only ever climb or hold, so they are cumulative. The real
   * figures were 513 in the index and ONE 5xx, on 25 September, carried forward ever since.
   *
   * So each field is reported the way it is kept, and the report says which is which. The dates
   * are printed too, because Bing's series lags by about a week and a stale figure read as current
   * is its own kind of wrong answer.
   */
  const CUMULATIVE = ['InIndex', 'Code2xx', 'Code301', 'Code302', 'Code4xx', 'Code5xx',
    'BlockedByRobotsTxt', 'DnsFailures', 'ConnectionTimeout', 'AllOtherCodes'];
  const rows = crawl.data;
  const latest = rows[rows.length - 1];
  const dayOf = (v) => {
    const m = /\/Date\((-?\d+)/.exec(String(v));
    return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : '?';
  };
  const last7 = rows.slice(-7);
  console.log(`Crawl, as Bing last reported it (${dayOf(rows[0].Date)} to ${dayOf(latest.Date)})`);
  console.log(`  pages crawled, sum of the last 7 days   ${last7.reduce((n, r) => n + (r.CrawledPages ?? 0), 0)}`);
  console.log('  the rest are running totals, not daily:');
  for (const k of CUMULATIVE) {
    if (latest[k] === undefined) continue;
    console.log(`    ${k.padEnd(20)} ${latest[k]}`);
  }
  console.log(`  NOTE: that series ends ${dayOf(latest.Date)}, so it is not today's position.`);
} else {
  console.log('GetCrawlStats: no rows. Bing has no crawl history for this site url.');
}
console.log();

// ---- does Bing have a record of each page ----------------------------------------------------
/**
 * A CHECKPOINT, because this runs unattended every Friday and the machine kills long processes.
 *
 * On 10 October this machine reclaimed memory twice and killed a Google reader mid-run. That reader
 * had a checkpoint by then and lost nothing; this one did not, and it is the one on a schedule. An
 * unattended run that is killed and writes nothing is indistinguishable from a run that never
 * fired, which is the worst failure mode for a measurement whose whole point is the series.
 *
 * Bing also throttles per host, so re-asking what was already answered is not free.
 */
const CKPT = path.join(OUT_DIR, 'bing-coverage.partial.json');
fs.mkdirSync(OUT_DIR, { recursive: true });
const RESUME = process.argv.includes('--resume');
// Only ANSWERS are resumable. Keying errors too would skip exactly the URLs that need re-asking,
// which is the bug the Google reader shipped with and had to have fixed before its first resume.
const already = RESUME && fs.existsSync(CKPT)
  ? new Map(JSON.parse(fs.readFileSync(CKPT, 'utf8'))
      .filter((r) => !r.error && (r.lastCrawled || r.known !== undefined))
      .map((r) => [r.url, r]))
  : new Map();
if (already.size) console.log(`Resuming: ${already.size} URLs already answered.\n`);

const rows = [];
for (const [i, url] of sample.entries()) {
  if (already.has(url)) { rows.push(already.get(url)); continue; }
  const r = await call('GetUrlInfo', { url });
  if (r.error) {
    rows.push({ url, error: r.error });
  } else {
    const d = r.data ?? {};
    rows.push({
      url,
      lastCrawled: dotNetDate(d.LastCrawledDate),
      discovered: discoveryDateOf(d),
      httpStatus: d.HttpStatus ?? null,
      isPage: d.IsPage ?? null,
      anchors: d.AnchorCount ?? null,
      // Bing answers for an unknown URL with a fully populated all-defaults shell, so the presence
      // of fields says nothing. See hasRealRecord: the first run counted 20 shells as records.
      known: hasRealRecord(d),
    });
  }
  if ((i + 1) % 10 === 0) {
    console.log(`  ...${i + 1}/${sample.length}`);
    fs.writeFileSync(CKPT, `${JSON.stringify(rows)}\n`);
  }
  if (i < sample.length - 1) await sleep(GAP_MS);
}

fs.writeFileSync(CKPT, `${JSON.stringify(rows)}\n`);
const errored = rows.filter((r) => r.error);
const known = rows.filter((r) => !r.error && r.known);
const unknown = rows.filter((r) => !r.error && !r.known);
const crawled = known.filter((r) => r.lastCrawled);

/**
 * REFUSE TO REPORT A CONTAMINATED SAMPLE.
 *
 * This is the whole lesson of the first run. It printed "Bing has a record 20", "no record at all
 * 0" and "call failed 63" in one block, and the first two numbers are meaningless: the 63 failures
 * were a throttle, and the 20 that got through were the first 20 asked, so they are not a sample of
 * anything. Reading that output as coverage would have been the fifth false measurement this
 * project has produced from code that looked right.
 *
 * A failure here is not a smaller answer. It is a biased one, so there is no answer.
 */
if (errored.length) {
  console.error(`\nNOT REPORTING. ${errored.length} of ${rows.length} calls failed.`);
  console.error(`  first error  ${errored[0].error}`);
  console.error('');
  console.error('The requests that succeeded are the ones asked earliest, so what got through is');
  console.error('not a sample of the site and the counts would not mean what they appear to mean.');
  console.error('Nothing has been written.');
  console.error('');
  if (errored.some((r) => /throttl/i.test(r.error))) {
    console.error('Bing was throttling. Its limit is per host and recovers on its own, so wait a');
    console.error('while and re-run, more slowly and with fewer URLs:');
    console.error('   node --env-file=.env scripts/bing-coverage.mjs --sample 30 --gap 5000');
  }
  process.exit(1);
}

console.log('\nWhat Bing holds, on the sample');
console.log(`  asked about        ${rows.length}`);
console.log(`  Bing has a record  ${known.length}`);
console.log(`  of those, crawled  ${crawled.length}`);
console.log(`  no record at all   ${unknown.length}`);

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

// The URL list, so the next run can ask the same questions rather than new ones.
const samplePath = path.join(OUT_DIR, 'sample.txt');
if (!URLS_FILE) {
  fs.writeFileSync(samplePath, `${sample.join('\n')}\n`);
  console.log(`\nSample URLs written to ${samplePath}.`);
  console.log(`Re-run against the same set with:  --urls ${samplePath}`);
}
console.log(`\nWritten to ${out} (gitignored).`);
