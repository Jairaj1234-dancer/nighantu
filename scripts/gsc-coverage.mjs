#!/usr/bin/env node
/**
 * What does Google actually hold of this site, URL by URL.
 *
 * THE QUESTION THAT HAS BEEN DARK ALL DAY. Every citation measurement this project runs scores
 * Gemini, which grounds on Google's index, and until today Search Console access sat with someone
 * else. The Bing reader answered the same question for Bing and found the lexicon absent, 0 of 11
 * sampled; the sitemap was then found to be withholding lastmod from 421 URLs including all 277
 * lexicon pages. Whether any of that is true of Google was unmeasurable.
 *
 * It is measurable now. URL Inspection returns a live coverage state per URL.
 *
 * WHY LOCAL AND NOT CI, same as the Bing reader. THIS REPOSITORY IS PUBLIC, so Actions logs and
 * artifacts are public, and a per-section map of which of our pages Google has not indexed is this
 * project's own scoreboard. data/DASHBOARD.md is committed rather than published for that reason.
 * The credential lives in gitignored secrets/ and every line printed passes through a redactor.
 *
 * WHAT IT ALSO CHECKS, which the Bing API cannot. Google reports the canonical IT chose alongside
 * the one we declared. This site declares 34 aliases in src/data/duplicates.json, where two pages
 * are one drug and one points at the other. Whether Google honours those is a direct test of work
 * that has so far been taken on trust.
 *
 *   node scripts/gsc-coverage.mjs                      every URL in the sitemap
 *   node scripts/gsc-coverage.mjs --urls FILE          only the URLs listed, for a like-for-like re-read
 *   node scripts/gsc-coverage.mjs --limit 50           a quick slice
 *   node scripts/gsc-coverage.mjs --gap 150            ms between calls
 *   node scripts/gsc-coverage.mjs --resume             continue from the last checkpoint
 */
import fs from 'node:fs';
import path from 'node:path';
import { accessToken, redactor } from './lib/gsc.mjs';

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const SITE = argOf('--site', 'https://nighantu.ageayurveda.com/');
const URLS_FILE = argOf('--urls', null);
const LIMIT = Number(argOf('--limit', 0)) || Infinity;
/**
 * The documented ceiling is 600 queries a minute and 2,000 a day per property. 150ms is 400 a
 * minute, which leaves real headroom: the Bing reader's first run was thrown away because it was
 * paced at the limit rather than under it.
 */
const GAP_MS = Number(argOf('--gap', 150));
/**
 * A cap on NEW inspections per process.
 *
 * This machine reclaimed memory twice mid-run and killed the node process both times. A 25-minute
 * process is a large target; several short ones that each checkpoint and exit are not. The cap is
 * about surviving the environment, not about the API.
 */
const MAX_NEW = Number(argOf('--max', 0)) || Infinity;
const OUT_DIR = 'data/coverage';

const redact = redactor();
const sleep = (ms) => new Promise((d) => setTimeout(d, ms));

function sitemapUrls() {
  const f = 'dist/sitemap-0.xml';
  if (!fs.existsSync(f)) {
    console.error(`${f} not found. Run \`npm run build\` first: the population is what the site`);
    console.error('actually publishes, not what the content directory happens to hold.');
    process.exit(1);
  }
  return [...fs.readFileSync(f, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

const sectionOf = (u) => {
  const p = new URL(u).pathname.split('/').filter(Boolean);
  return p.length > 1 ? p[0] : '(root)';
};

let auth;
try {
  auth = await accessToken();
} catch (e) {
  console.error(e.noCredential
    ? 'No Search Console credential under secrets/. See scripts/gsc-properties.mjs.'
    : `Could not get a token: ${redact(e.message)}`);
  process.exit(1);
}
console.log(`Reading ${SITE} as ${auth.identity} (via ${auth.via}).`);

/**
 * RE-MINT THE TOKEN, because a Google access token lives one hour and a full run is longer.
 *
 * The first complete run spent its whole quota slice and reported nothing: it minted one token at
 * the start, the token expired around URL 500, and every call after that returned
 * "HTTP 401 Request had invalid authentication credentials". The known count froze at 443 and sat
 * there for 700 URLs, which is exactly what a silent credential expiry looks like from the inside.
 *
 * Refreshed proactively at 45 minutes and reactively on a 401, because the proactive clock is an
 * assumption about Google's expiry and the 401 is the fact.
 */
let mintedAt = Date.now();
const FRESH_MS = 45 * 60 * 1000;
async function freshToken(force = false) {
  if (!force && Date.now() - mintedAt < FRESH_MS) return;
  auth = await accessToken();
  mintedAt = Date.now();
  console.log('  token refreshed');
}

const all = sitemapUrls();
const urls = (URLS_FILE
  ? fs.readFileSync(URLS_FILE, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  : all).slice(0, LIMIT === Infinity ? undefined : LIMIT);
console.log(`Site publishes ${all.length} URLs. Inspecting ${urls.length}.\n`);

/**
 * One inspection, retrying both the answers Google gives and the ones the network does not.
 *
 * THE FIRST VERSION OF THIS CRASHED A 1,239-CALL RUN AT ABOUT 250. It retried on HTTP 429 and 503
 * and left the fetch itself uncaught, so one transient `read ETIMEDOUT` threw out of the loop and
 * killed the process. Nothing was written and four minutes of quota was spent for nothing.
 *
 * A thrown network error is not a different kind of event from a 503: both mean "ask again in a
 * moment". The Bing reader never had this fault because it goes through lib/fetch.mjs, which never
 * rejects; this one called fetch directly and had to learn it separately.
 */
async function inspect(url, tries = 5) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    await freshToken();
    let res;
    try {
      res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      if (attempt === tries - 1) return { error: `network: ${redact(e.cause?.code ?? e.message)}` };
      const wait = 5000 * 2 ** attempt;
      console.log(`  network ${e.cause?.code ?? e.name}, retrying in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    if (res.status === 401) {
      // The fact beats the clock: re-mint and try this URL again.
      if (attempt === tries - 1) return { error: 'HTTP 401 after re-minting the token' };
      await freshToken(true);
      continue;
    }
    if (res.status === 429 || res.status === 503) {
      const wait = 30000 * 2 ** attempt;
      console.log(`  rate limited, waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: `HTTP ${res.status} ${redact(body.error?.message ?? '')}`.trim() };
    return { data: body.inspectionResult ?? {} };
  }
  return { error: 'retried to exhaustion' };
}

const aliases = fs.existsSync('src/data/duplicates.json')
  ? JSON.parse(fs.readFileSync('src/data/duplicates.json', 'utf8')).aliases ?? {}
  : {};

/**
 * A checkpoint, because 1,239 calls is four minutes and a daily quota of 2,000.
 *
 * Losing the whole run to one timeout cost nothing but time the first time. It would cost quota the
 * second time, and the quota is per property per day, so two failed full runs make a third
 * impossible until tomorrow.
 */
const CKPT = path.join(OUT_DIR, 'gsc-coverage.partial.json');
fs.mkdirSync(OUT_DIR, { recursive: true });
const RESUME = process.argv.includes('--resume');
/**
 * ONLY SUCCESSES ARE RESUMABLE. The first version keyed every row, errors included, so a resume
 * would have skipped exactly the 761 URLs that need asking again and "completed" instantly with
 * the same broken data. The quota is 2,000 a day, so re-asking only the failures is the
 * difference between one more attempt today and none.
 */
const done = RESUME && fs.existsSync(CKPT)
  ? new Map(JSON.parse(fs.readFileSync(CKPT, 'utf8')).filter((r) => !r.error && r.coverageState).map((r) => [r.url, r]))
  : new Map();
if (done.size) console.log(`Resuming: ${done.size} URLs already answered, re-asking the rest.\n`);

const rows = [];
let fresh = 0;
for (const [i, url] of urls.entries()) {
  if (done.has(url)) { rows.push(done.get(url)); continue; }
  if (fresh >= MAX_NEW) { rows.push({ url, error: 'not reached: --max cap' }); continue; }
  fresh += 1;
  const r = await inspect(url);
  if (r.error) {
    rows.push({ url, error: r.error });
  } else {
    const idx = r.data.indexStatusResult ?? {};
    rows.push({
      url,
      coverageState: idx.coverageState ?? null,
      verdict: idx.verdict ?? null,
      robotsTxtState: idx.robotsTxtState ?? null,
      indexingState: idx.indexingState ?? null,
      lastCrawlTime: idx.lastCrawlTime ?? null,
      googleCanonical: idx.googleCanonical ?? null,
      userCanonical: idx.userCanonical ?? null,
      sitemap: idx.sitemap ?? [],
      referringUrls: (idx.referringUrls ?? []).length,
    });
  }
  if ((i + 1) % 50 === 0) {
    const known = rows.filter((x) => x.coverageState && !/unknown/i.test(x.coverageState)).length;
    console.log(`  ${i + 1}/${urls.length}  indexed-or-known so far: ${known}`);
    fs.writeFileSync(CKPT, `${JSON.stringify(rows)}\n`);
  }
  if (i < urls.length - 1) await sleep(GAP_MS);
}

/**
 * REFUSE TO REPORT A CONTAMINATED RUN, the same rule the Bing reader learned the hard way. Its
 * first run had 63 of 83 calls rate-limited and printed "no record at all: 0" beside "call failed:
 * 63". The requests that succeed are the ones asked earliest, so a partial run is not a smaller
 * measurement, it is a biased one.
 */
fs.writeFileSync(CKPT, `${JSON.stringify(rows)}\n`);
const errored = rows.filter((r) => r.error);
if (errored.length) {
  console.error(`\nNOT REPORTING. ${errored.length} of ${rows.length} inspections failed.`);
  console.error(`  first error  ${errored[0].error}`);
  console.error('\nThe calls that succeeded are the ones asked earliest, so the counts would not');
  console.error('mean what they appear to mean. Nothing has been written.');
  process.exit(1);
}

const byState = {};
for (const r of rows) byState[r.coverageState ?? '(none)'] = (byState[r.coverageState ?? '(none)'] ?? 0) + 1;
console.log('\nCoverage, as Google reports it right now');
for (const [s, n] of Object.entries(byState).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${s}`);
}

const indexed = (r) => /^Submitted and indexed$|^Indexed/i.test(r.coverageState ?? '');
const unknown = (r) => /unknown to Google/i.test(r.coverageState ?? '');

const bySection = {};
for (const r of rows) {
  const s = sectionOf(r.url);
  bySection[s] ??= { total: 0, indexed: 0, unknown: 0, other: 0 };
  bySection[s].total += 1;
  if (indexed(r)) bySection[s].indexed += 1;
  else if (unknown(r)) bySection[s].unknown += 1;
  else bySection[s].other += 1;
}
console.log('\nBy section');
console.log(`  ${'section'.padEnd(14)} ${'total'.padStart(6)} ${'indexed'.padStart(8)} ${'unknown'.padStart(8)} ${'other'.padStart(6)}  %indexed`);
for (const [s, v] of Object.entries(bySection).sort((a, b) => b[1].total - a[1].total)) {
  const pct = v.total ? Math.round((100 * v.indexed) / v.total) : 0;
  console.log(`  ${s.padEnd(14)} ${String(v.total).padStart(6)} ${String(v.indexed).padStart(8)} ${String(v.unknown).padStart(8)} ${String(v.other).padStart(6)}  ${String(pct).padStart(6)}%`);
}

// Does Google honour the canonicals this site declares, including its 34 aliases?
const disagree = rows.filter((r) => r.googleCanonical && r.userCanonical
  && r.googleCanonical.replace(/\/$/, '') !== r.userCanonical.replace(/\/$/, ''));
console.log(`\nCanonical: Google chose a different URL than we declared on ${disagree.length} page(s).`);
for (const r of disagree.slice(0, 12)) {
  const slug = new URL(r.url).pathname.split('/').filter(Boolean).pop();
  const declared = aliases[slug] ? ` [declared alias of ${aliases[slug].primary}]` : '';
  console.log(`   ${new URL(r.url).pathname}${declared}`);
  console.log(`      we say    ${r.userCanonical}`);
  console.log(`      Google says ${r.googleCanonical}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, 'gsc-coverage.json');
fs.writeFileSync(out, `${redact(JSON.stringify({
  checkedAt: new Date().toISOString(),
  site: SITE,
  publishedUrls: all.length,
  inspected: rows.length,
  byState,
  bySection,
  canonicalDisagreements: disagree.length,
  rows,
}, null, 1))}\n`);
console.log(`\nWritten to ${out} (gitignored).`);
