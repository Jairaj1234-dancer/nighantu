#!/usr/bin/env node
/**
 * Which pages surface in Google, and for what queries.
 *
 * THE QUESTION THIS ANSWERS, which coverage cannot. gsc-coverage.mjs established that 686 of 1,239
 * pages are indexed, so being found is no longer the constraint. This site has 7,549 impressions
 * and, across every citation log it holds, zero citations. The gap between those two numbers is the
 * whole problem, and impressions per page and per query is the only data that speaks to it.
 *
 * WHY THIS EXISTS AS A SCRIPT. The 6 October edition of the measurement artifact drew its largest
 * conclusions from a hand-made Search Console export: that herb monographs earned 86% of all page
 * impressions, that Shirodhara earned almost none, that click-through was flat across every
 * position band. Those conclusions reversed an earlier recommendation and deserve to be a tracked
 * series rather than one afternoon's download.
 *
 * LOCAL ONLY, for the reason every reader in this project is. THIS REPOSITORY IS PUBLIC, Actions
 * logs are public, and per-page performance is this project's own scoreboard. The credential sits
 * in gitignored secrets/ and every printed line passes a redactor.
 *
 * THE SAMPLING CAVEAT IS LOAD-BEARING. Google names only a minority of queries and withholds the
 * rest, so query-level totals never add up to the page-level totals. The residual is reported
 * rather than hidden, because the 6 October edition found the named and unnamed traffic behaving
 * so differently that treating them as one population would be wrong.
 *
 *   node scripts/gsc-analytics.mjs                    last 28 days
 *   node scripts/gsc-analytics.mjs --days 90
 *   node scripts/gsc-analytics.mjs --start 2026-09-10 --end 2026-10-09
 */
import fs from 'node:fs';
import path from 'node:path';
import { accessToken, redactor } from './lib/gsc.mjs';

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const SITE = argOf('--site', 'https://nighantu.ageayurveda.com/');
const DAYS = Number(argOf('--days', 28));
const OUT_DIR = 'data/coverage';

/**
 * Google's data lags about three days and the API returns nothing for dates inside that window,
 * which reads as "no traffic" rather than "not reported yet". The end date is pulled back
 * deliberately so an empty tail cannot be mistaken for a collapse.
 */
const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const defaultEnd = new Date(today.getTime() - 3 * 86400000);
const END = argOf('--end', iso(defaultEnd));
const START = argOf('--start', iso(new Date(new Date(END).getTime() - DAYS * 86400000)));

const redact = redactor();
let auth;
try {
  auth = await accessToken();
} catch (e) {
  console.error(e.noCredential
    ? 'No Search Console credential under secrets/. See scripts/gsc-properties.mjs.'
    : `Could not get a token: ${redact(e.message)}`);
  process.exit(1);
}

const query = async (body, tries = 4) => {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const res = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ startDate: START, endDate: END, ...body }),
          signal: AbortSignal.timeout(60000),
        },
      );
      if (res.status === 429 || res.status === 503) {
        await new Promise((d) => setTimeout(d, 15000 * 2 ** attempt));
        continue;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { error: `HTTP ${res.status} ${redact(j.error?.message ?? '')}`.trim() };
      return { rows: j.rows ?? [] };
    } catch (e) {
      // A thrown fetch is the same event as a 503: ask again. Learned from gsc-coverage.mjs,
      // whose first version let an ETIMEDOUT kill a 1,239-call run.
      if (attempt === tries - 1) return { error: `network: ${redact(e.cause?.code ?? e.message)}` };
      await new Promise((d) => setTimeout(d, 5000 * 2 ** attempt));
    }
  }
  return { error: 'retried to exhaustion' };
};

console.log(`${SITE}  ${START} to ${END}  (as ${auth.identity})\n`);

const totals = await query({ dimensions: [] });
if (totals.error) { console.error(`totals: ${totals.error}`); process.exit(1); }
const t = totals.rows[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
console.log('Totals');
console.log(`  impressions      ${t.impressions}`);
console.log(`  clicks           ${t.clicks}`);
console.log(`  CTR              ${(t.ctr * 100).toFixed(2)}%`);
console.log(`  avg position     ${t.position.toFixed(1)}`);

const pages = await query({ dimensions: ['page'], rowLimit: 25000 });
if (pages.error) { console.error(`pages: ${pages.error}`); process.exit(1); }

const sectionOf = (u) => {
  const p = new URL(u).pathname.split('/').filter(Boolean);
  return p.length > 1 ? p[0] : '(root)';
};
const bySection = {};
for (const r of pages.rows) {
  const s = sectionOf(r.keys[0]);
  bySection[s] ??= { pages: 0, impressions: 0, clicks: 0 };
  bySection[s].pages += 1;
  bySection[s].impressions += r.impressions;
  bySection[s].clicks += r.clicks;
}
const totalImp = Object.values(bySection).reduce((n, v) => n + v.impressions, 0) || 1;
console.log(`\nPages earning any impression: ${pages.rows.length} of 1,239 published`);
console.log(`\n  ${'section'.padEnd(14)} ${'pages'.padStart(6)} ${'impressions'.padStart(12)} ${'share'.padStart(7)} ${'clicks'.padStart(7)}`);
for (const [s, v] of Object.entries(bySection).sort((a, b) => b[1].impressions - a[1].impressions)) {
  const share = `${Math.round((100 * v.impressions) / totalImp)}%`;
  console.log(`  ${s.padEnd(14)} ${String(v.pages).padStart(6)} ${String(v.impressions).padStart(12)} ${share.padStart(7)} ${String(v.clicks).padStart(7)}`);
}

console.log('\nTop pages by impressions');
for (const r of pages.rows.slice().sort((a, b) => b.impressions - a.impressions).slice(0, 15)) {
  const p = new URL(r.keys[0]).pathname;
  console.log(`  ${String(r.impressions).padStart(6)} imp  ${String(r.clicks).padStart(3)} clk  p${r.position.toFixed(1).padStart(5)}  ${p}`);
}

const queries = await query({ dimensions: ['query'], rowLimit: 25000 });
if (queries.error) { console.error(`queries: ${queries.error}`); process.exit(1); }
const namedImp = queries.rows.reduce((n, r) => n + r.impressions, 0);
console.log(`\nQueries named by Google: ${queries.rows.length}`);
console.log(`  they cover ${namedImp} of ${t.impressions} impressions (${Math.round((100 * namedImp) / (t.impressions || 1))}%)`);
console.log(`  the withheld remainder is ${t.impressions - namedImp} impressions, which behaves differently and is not the same population`);
console.log('\nTop queries by impressions');
for (const r of queries.rows.slice().sort((a, b) => b.impressions - a.impressions).slice(0, 20)) {
  console.log(`  ${String(r.impressions).padStart(6)} imp  ${String(r.clicks).padStart(3)} clk  p${r.position.toFixed(1).padStart(5)}  ${r.keys[0]}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, 'gsc-analytics.json');
fs.writeFileSync(out, `${redact(JSON.stringify({
  checkedAt: new Date().toISOString(),
  site: SITE,
  range: { start: START, end: END },
  totals: t,
  pagesWithImpressions: pages.rows.length,
  bySection,
  pages: pages.rows.map((r) => ({ page: r.keys[0], ...r, keys: undefined })),
  queries: queries.rows.map((r) => ({ query: r.keys[0], ...r, keys: undefined })),
  namedQueryImpressions: namedImp,
}, null, 1))}\n`);
console.log(`\nWritten to ${out} (gitignored).`);
