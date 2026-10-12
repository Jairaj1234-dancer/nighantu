#!/usr/bin/env node
/**
 * Which of our pages Bing actually shows, and for what.
 *
 * WHY THIS EXISTS. scripts/bing-coverage.mjs answers "does Bing hold this URL", which is a
 * question about the index. This answers a different one: of the pages it holds, which ones does it
 * put in front of a person, at what position, and against which query. That is the only direct
 * evidence this project has about which content earns attention, as opposed to which content
 * exists.
 *
 * It was written because a strategy recommendation had been built on "Bing cited 26 pages 144
 * times", a figure that appears nowhere in this repository and that the Bing AI Search Queries
 * export contradicts: that report holds ONE grounding query. A number nobody can source is not
 * evidence, and the fix is to read the API rather than to remember.
 *
 * THREE ENDPOINTS, because each answers a different half of the question:
 *   GetRankAndTrafficStats   site totals per day, so a per-page figure can be checked against them
 *   GetPageStats             per PAGE impressions, clicks and average position
 *   GetQueryStats            per QUERY, the same three
 * Bing returns all three in the same QueryStats shape, with the page URL sitting in the `Query`
 * field for GetPageStats. That is Bing's naming, not a bug here.
 *
 * WHY LOCAL AND NOT CI, the same rule as every other reader in this directory. THIS REPOSITORY IS
 * PUBLIC, so Actions logs are public, and which of our pages earn impressions is our own
 * scoreboard. The key lives in gitignored .env and every line printed passes through a redactor.
 *
 *   node --env-file=.env scripts/bing-performance.mjs
 *   node --env-file=.env scripts/bing-performance.mjs --out measurement/bing-queries
 *   node --env-file=.env scripts/bing-performance.mjs --top 40
 */
import fs from 'node:fs';
import path from 'node:path';
import { get } from './lib/fetch.mjs';
import { SITE, BASE } from './monitors/config.mjs';
import { dotNetDate, isThrottled, redactor, isConnectionFailure } from './lib/bing-coverage.mjs';

const KEY = process.env.BING_API_KEY;
const SITE_URL = process.env.BING_SITE_URL || `${SITE}${BASE}/`;
const API = 'https://ssl.bing.com/webmaster/api.svc/json';
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const OUT_DIR = argOf('--out', 'data/coverage');
const TOP = Number(argOf('--top', 25));
const GAP_MS = Number(argOf('--gap', 2500));

const redact = redactor(KEY);
if (!KEY) {
  console.error('BING_API_KEY is not set. Put it in the gitignored .env and run with --env-file:');
  console.error("   echo 'BING_API_KEY=your-key' >> .env");
  console.error('   node --env-file=.env scripts/bing-performance.mjs');
  process.exit(1);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * One call, waiting out a throttle rather than recording it as a result. Bing's throttle is per
 * host and recovers on its own; bing-coverage.mjs learned this the hard way when 63 of 83 requests
 * came back ThrottleHost and the report printed the rate limit as a finding about the site.
 */
const call = async (method) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const qs = new URLSearchParams({ apikey: KEY, siteUrl: SITE_URL });
    const res = await get(`${API}/${method}?${qs}`, { retries: 0, timeoutMs: 25000 });
    if (res.ok) {
      try { return { rows: JSON.parse(res.text).d ?? [] }; } catch {
        return { error: `response was not JSON: ${redact(res.text).slice(0, 160)}` };
      }
    }
    const body = redact(res.text ?? '');
    if (isThrottled(res.status, body)) {
      const wait = 60000 * (attempt + 1);
      console.log(`  throttled on ${method}; waiting ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (isConnectionFailure(res.error)) {
      await sleep(Math.max(GAP_MS, 3000) * (attempt + 1));
      continue;
    }
    return { error: `HTTP ${res.status} ${body.slice(0, 160)}`.trim() };
  }
  return { error: 'still failing after 4 attempts' };
};

/** Bing hands back one row per item PER DAY, so a page's totals are the sum of its days. */
const fold = (rows) => {
  const by = new Map();
  for (const r of rows) {
    const k = r.Query ?? '(none)';
    if (!by.has(k)) by.set(k, { key: k, impressions: 0, clicks: 0, days: 0, posSum: 0, first: null, last: null });
    const e = by.get(k);
    e.impressions += r.Impressions ?? 0;
    e.clicks += r.Clicks ?? 0;
    e.days += 1;
    // Position is a per-day average, so weight it by that day's impressions or a long tail of
    // 1-impression days would count as much as the day that actually carried the traffic.
    if (typeof r.AvgImpressionPosition === 'number' && r.AvgImpressionPosition > 0) {
      e.posSum += r.AvgImpressionPosition * (r.Impressions ?? 0);
    }
    // dotNetDate already returns YYYY-MM-DD, and returns null for the .NET MinValue sentinel.
    const iso = dotNetDate(r.Date);
    if (iso) {
      if (!e.first || iso < e.first) e.first = iso;
      if (!e.last || iso > e.last) e.last = iso;
    }
  }
  for (const e of by.values()) e.position = e.impressions ? e.posSum / e.impressions : null;
  return [...by.values()].sort((a, b) => b.impressions - a.impressions);
};

const results = {};
for (const method of ['GetRankAndTrafficStats', 'GetPageStats', 'GetQueryStats']) {
  const r = await call(method);
  if (r.error) {
    console.error(`\nNOT REPORTING. ${method} failed: ${r.error}`);
    console.error('A partial read of one endpoint cannot be compared against the others.');
    process.exit(1);
  }
  results[method] = r.rows;
  console.log(`${method}: ${r.rows.length} rows`);
  await sleep(GAP_MS);
}

// ---- site totals, which every per-page figure is checked against
const daily = results.GetRankAndTrafficStats
  .map((r) => ({ date: dotNetDate(r.Date), impressions: r.Impressions ?? 0, clicks: r.Clicks ?? 0 }))
  .filter((r) => r.date)
  .sort((a, b) => a.date.localeCompare(b.date));
const siteImp = daily.reduce((n, r) => n + r.impressions, 0);
const siteClicks = daily.reduce((n, r) => n + r.clicks, 0);
const active = daily.filter((r) => r.impressions > 0);
console.log(`\nSite totals, ${daily[0]?.date} to ${daily[daily.length - 1]?.date}`);
console.log(`  ${siteImp} impressions, ${siteClicks} clicks, CTR ${siteImp ? (100 * siteClicks / siteImp).toFixed(2) : '0.00'}%`);
console.log(`  ${active.length} of ${daily.length} days had any impression at all`);

const pages = fold(results.GetPageStats);
const queries = fold(results.GetQueryStats);

/**
 * THE CHECK THAT MAKES THE REST MEAN SOMETHING. If the per-page impressions do not add up to the
 * site total, Bing is sampling or truncating the page list, and "these are the pages that earn
 * impressions" would be false in a way no amount of reading the table would reveal.
 */
const pageImp = pages.reduce((n, p) => n + p.impressions, 0);
const queryImp = queries.reduce((n, q) => n + q.impressions, 0);
console.log(`\nCoverage of the endpoints against the site total of ${siteImp}`);
console.log(`  per-page rows sum to  ${pageImp}  (${siteImp ? Math.round(100 * pageImp / siteImp) : 0}%)`);
console.log(`  per-query rows sum to ${queryImp}  (${siteImp ? Math.round(100 * queryImp / siteImp) : 0}%)`);
if (pageImp < siteImp * 0.9) {
  console.log('  The page list is INCOMPLETE. Treat it as the top of the list, not the whole of it.');
}

const section = (u) => {
  try {
    const p = new URL(u).pathname.split('/').filter(Boolean);
    return p.length > 1 ? p[0] : '(root)';
  } catch { return '(not a url)'; }
};
const shortUrl = (u) => { try { return new URL(u).pathname; } catch { return u; } };

console.log(`\nPages, top ${TOP} of ${pages.length} that earned any impression`);
console.log(`  ${'imp'.padStart(5)} ${'clk'.padStart(4)} ${'pos'.padStart(5)}  page`);
for (const p of pages.slice(0, TOP)) {
  console.log(`  ${String(p.impressions).padStart(5)} ${String(p.clicks).padStart(4)} ${(p.position?.toFixed(1) ?? '  -').padStart(5)}  ${shortUrl(p.key)}`);
}

console.log('\nBy section: which collections Bing actually shows');
const bySec = {};
for (const p of pages) {
  const s = section(p.key);
  bySec[s] ??= { pages: 0, impressions: 0, clicks: 0 };
  bySec[s].pages += 1;
  bySec[s].impressions += p.impressions;
  bySec[s].clicks += p.clicks;
}
console.log(`  ${'section'.padEnd(14)} ${'pages'.padStart(6)} ${'imp'.padStart(6)} ${'clicks'.padStart(7)}`);
for (const [s, v] of Object.entries(bySec).sort((a, b) => b[1].impressions - a[1].impressions)) {
  console.log(`  ${s.padEnd(14)} ${String(v.pages).padStart(6)} ${String(v.impressions).padStart(6)} ${String(v.clicks).padStart(7)}`);
}

console.log(`\nQueries, top ${TOP} of ${queries.length}`);
console.log(`  ${'imp'.padStart(5)} ${'clk'.padStart(4)} ${'pos'.padStart(5)}  query`);
for (const q of queries.slice(0, TOP)) {
  console.log(`  ${String(q.impressions).padStart(5)} ${String(q.clicks).padStart(4)} ${(q.position?.toFixed(1) ?? '  -').padStart(5)}  ${q.key.slice(0, 92)}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, 'bing-performance.json');
if (fs.existsSync(out)) {
  try {
    const prev = JSON.parse(fs.readFileSync(out, 'utf8'));
    const day = String(prev.checkedAt ?? '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const keep = path.join(OUT_DIR, `bing-performance-${day}.json`);
      if (!fs.existsSync(keep)) {
        fs.copyFileSync(out, keep);
        console.log(`\nPrevious reading (${prev.checkedAt}) kept as ${keep}.`);
      }
    }
  } catch { /* an unparseable previous file is not worth failing a completed run over */ }
}
fs.writeFileSync(out, `${redact(JSON.stringify({
  checkedAt: new Date().toISOString(),
  site: SITE_URL,
  window: { from: daily[0]?.date ?? null, to: daily[daily.length - 1]?.date ?? null, days: daily.length, daysWithImpressions: active.length },
  siteTotals: { impressions: siteImp, clicks: siteClicks },
  endpointCoverage: { pageImpressions: pageImp, queryImpressions: queryImp },
  daily,
  pages,
  queries,
}, null, 1))}\n`);
console.log(`\nWritten to ${out} (gitignored).`);
