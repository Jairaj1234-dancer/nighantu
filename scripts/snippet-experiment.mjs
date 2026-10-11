#!/usr/bin/env node
/**
 * Did rewriting 399 meta descriptions change click-through? A natural experiment, measured.
 *
 * WHY THIS IS A TEST AND NOT A CLEANUP. On 10 and 11 October, 399 of the 802 answer blocks were
 * rewritten: 284 that opened "is a plant used in Ayurveda", 61 publishing a raw markdown citation,
 * 49 publishing claims.mjs apparatus, 41 publishing storage instructions, 10 publishing a dose. The
 * other 403 pages were not touched at all. For every one of the 399 the ONLY line that changed in
 * the file was `answer:`, which is what feeds the meta description. So there is a treated group and
 * an untreated group, assigned by a property of the old text rather than by anything about traffic,
 * and nothing else about either group moved in between.
 *
 * THE SNIPPET HAD BEEN RULED OUT ON BAD REASONING. An earlier analysis found click-through flat and
 * slightly INVERTED across position bands and concluded that this "ruled out ranking and snippet
 * explanations". It rules out POSITION. A uniformly useless description on hundreds of pages
 * produces exactly a flat, position-independent click-through curve, so the flat curve is that
 * defect's signature and not its alibi. The figures sit in the gitignored measurement artifact
 * rather than here, because this repository is public and they are its own scoreboard.
 *
 * THE COHORT IS DERIVED FROM GIT, NOT FROM A LIST I KEEP. Content keeps changing, so a hand-written
 * cohort file would drift from what was actually treated. `git diff` between two pinned commits is
 * the record, and the script refuses to run if the pins are not present.
 *
 * READ THIS BEFORE BELIEVING ANY RESULT:
 *
 * 1. POWER. This site takes clicks in the dozens per month, not the thousands, and splitting them
 *    across two arms halves that again. A doubling of click-through is detectable in four weeks; a
 *    20% improvement is not, and will not become so by staring at it. The script prints the clicks
 *    each arm actually accumulated, so "could this have shown anything at all" is answerable from
 *    the output instead of assumed.
 * 2. POSITION IS A CONFOUND AND IS REPORTED. If the treated arm's average position moves, a
 *    click-through change is not attributable to the snippet. That is why position is carried
 *    through for both arms rather than only click-through.
 * 3. SELECTION. The treated pages were chosen BECAUSE their descriptions were bad, so the two arms
 *    did not start equal. That is what comparing the CHANGE in each arm is for, and it is also why
 *    the untreated arm matters: it absorbs anything seasonal or site-wide.
 * 4. RECRAWL. A new description reaches a search result only after Google refetches the page, which
 *    is why the comparison window opens a week after the deploy rather than the next day. Pages
 *    Google has not refetched are still showing the old text and dilute the effect toward zero.
 *
 * LOCAL ONLY, like every reader in this project. This repository is public and its Actions logs are
 * public; per-page performance is the project's own scoreboard. The credential sits in gitignored
 * secrets/, the output goes to gitignored measurement/, and every printed line passes a redactor.
 *
 *   node scripts/snippet-experiment.mjs --snapshot        record the pre-change baseline
 *   node scripts/snippet-experiment.mjs                   compare the current window to it
 *   node scripts/snippet-experiment.mjs --cohort-only     print the cohort split and stop
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { accessToken, redactor } from './lib/gsc.mjs';

/** The commits that bracket the rewrites. Pinned, because the cohort must not drift. */
const BEFORE = '292e3c8';
const AFTER = 'c6ce3b5';
/** The last full day before the first rewrite deployed, 10 October 14:14 UTC. */
const CHANGE_DATE = '2026-10-09';

const OUT = path.join('measurement', 'snippet-experiment.json');
const SITE = 'https://nighantu.ageayurveda.com/';
const argOf = (n, f) => { const i = process.argv.indexOf(n); return i === -1 ? f : process.argv[i + 1]; };
const SNAPSHOT = process.argv.includes('--snapshot');
const COHORT_ONLY = process.argv.includes('--cohort-only');

// ---------------------------------------------------------------- cohort, from git

function pathToUrl(rel) {
  const parts = rel.replace(/^content\//, '').replace(/\.md$/, '').split('/');
  return `${SITE}${parts.join('/')}/`;
}

let treated;
let all;
try {
  const diff = execFileSync('git', ['diff', '--name-only', `${BEFORE}`, `${AFTER}`, '--', 'content/'], { encoding: 'utf8' });
  treated = new Set(diff.split('\n').filter((l) => l.endsWith('.md')).map(pathToUrl));
  const ls = execFileSync('git', ['ls-tree', '-r', '--name-only', AFTER, 'content/'], { encoding: 'utf8' });
  all = new Set(ls.split('\n').filter((l) => l.endsWith('.md')).map(pathToUrl));
} catch (e) {
  console.error(`Cannot derive the cohort from git: ${e.message}`);
  console.error(`Both ${BEFORE} and ${AFTER} must be present in this clone.`);
  process.exit(1);
}
const untreated = new Set([...all].filter((u) => !treated.has(u)));

console.log(`cohort from git ${BEFORE}..${AFTER}`);
console.log(`  treated    ${treated.size} pages whose answer block was rewritten`);
console.log(`  untreated  ${untreated.size} pages left alone`);
console.log(`  total      ${all.size}\n`);
if (!treated.size || !untreated.size) { console.error('One arm is empty. Refusing to pretend this is an experiment.'); process.exit(1); }
if (COHORT_ONLY) process.exit(0);

// ---------------------------------------------------------------- Search Console

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

async function pageRows(startDate, endDate) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ startDate, endDate, dimensions: ['page'], rowLimit: 25000 }),
          signal: AbortSignal.timeout(60000),
        },
      );
      if (res.status === 429 || res.status === 503) { await new Promise((d) => setTimeout(d, 15000 * 2 ** attempt)); continue; }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`HTTP ${res.status} ${redact(j.error?.message ?? '')}`.trim());
      return j.rows ?? [];
    } catch (e) {
      // A thrown fetch is the same event as a 503, the lesson gsc-coverage.mjs paid for.
      if (attempt === 3) throw new Error(`network: ${redact(e.cause?.code ?? e.message)}`);
      await new Promise((d) => setTimeout(d, 5000 * 2 ** attempt));
    }
  }
  throw new Error('retried to exhaustion');
}

/** Totals for one arm. Position is weighted by impressions, because a plain mean over pages lets a page with one impression count as much as one with three hundred. */
function arm(rows, members) {
  let impressions = 0;
  let clicks = 0;
  let posWeight = 0;
  let pages = 0;
  for (const r of rows) {
    if (!members.has(r.keys[0])) continue;
    pages += 1;
    impressions += r.impressions;
    clicks += r.clicks;
    posWeight += r.position * r.impressions;
  }
  return {
    pagesWithImpressions: pages,
    impressions,
    clicks,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? posWeight / impressions : 0,
  };
}

const pct = (x) => `${(x * 100).toFixed(3)}%`;
const show = (label, a) => {
  console.log(`  ${label.padEnd(11)} ${String(a.pagesWithImpressions).padStart(4)} pages  ${String(a.impressions).padStart(6)} imp  ${String(a.clicks).padStart(4)} clk  CTR ${pct(a.ctr).padStart(8)}  pos ${a.position.toFixed(1).padStart(5)}`);
};

const END = argOf('--end', new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10));
const DAYS = Number(argOf('--days', 28));
const START = argOf('--start', new Date(new Date(END).getTime() - DAYS * 86400000).toISOString().slice(0, 10));

if (SNAPSHOT) {
  // The baseline must END before the first rewrite deployed, or treatment leaks into the control.
  const bEnd = argOf('--end', CHANGE_DATE);
  const bStart = argOf('--start', new Date(new Date(bEnd).getTime() - DAYS * 86400000).toISOString().slice(0, 10));
  if (bEnd > CHANGE_DATE) {
    console.error(`A baseline ending ${bEnd} includes days after the change deployed (${CHANGE_DATE}). Refusing.`);
    process.exit(1);
  }
  const rows = await pageRows(bStart, bEnd);
  const payload = {
    note: 'Pre-change baseline for the meta-description rewrite. See scripts/snippet-experiment.mjs.',
    site: SITE,
    cohort: { before: BEFORE, after: AFTER, treated: treated.size, untreated: untreated.size },
    window: { start: bStart, end: bEnd, days: DAYS },
    takenAt: new Date().toISOString(),
    treatedArm: arm(rows, treated),
    untreatedArm: arm(rows, untreated),
    treatedPages: [...treated].sort(),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);

  console.log(`baseline ${bStart} to ${bEnd}  (as ${auth.identity})\n`);
  show('treated', payload.treatedArm);
  show('untreated', payload.untreatedArm);
  console.log(`\nwrote ${OUT}`);
  const clicks = payload.treatedArm.clicks;
  console.log(`\nPOWER. The treated arm took ${clicks} clicks in this window. A doubling of CTR would`);
  console.log('show in four weeks; a small improvement will not, whatever the next run says.');
  console.log(`Re-run without --snapshot from about ${new Date(new Date(CHANGE_DATE).getTime() + 36 * 86400000).toISOString().slice(0, 10)},`);
  console.log('which allows a week for Google to refetch the pages plus a 28-day window.');
  process.exit(0);
}

// ---------------------------------------------------------------- compare
if (!fs.existsSync(OUT)) {
  console.error(`No baseline at ${OUT}. Run with --snapshot first, and note that a baseline can only`);
  console.error(`be taken for a window ending on or before ${CHANGE_DATE}.`);
  process.exit(1);
}
const base = JSON.parse(fs.readFileSync(OUT, 'utf8'));
if (base.cohort.before !== BEFORE || base.cohort.after !== AFTER) {
  console.error('The stored baseline was taken for a different cohort. Refusing to compare unlike things.');
  process.exit(1);
}
if (START <= CHANGE_DATE) {
  console.error(`The comparison window starts ${START}, on or before the change (${CHANGE_DATE}).`);
  console.error('That mixes treated and untreated days. Pass a --start after the change.');
  process.exit(1);
}

const rows = await pageRows(START, END);
const now = { treated: arm(rows, treated), untreated: arm(rows, untreated) };

console.log(`baseline  ${base.window.start} to ${base.window.end}`);
console.log(`current   ${START} to ${END}  (as ${auth.identity})\n`);
console.log('BEFORE');
show('treated', base.treatedArm);
show('untreated', base.untreatedArm);
console.log('\nAFTER');
show('treated', now.treated);
show('untreated', now.untreated);

const dTreated = now.treated.ctr - base.treatedArm.ctr;
const dUntreated = now.untreated.ctr - base.untreatedArm.ctr;
console.log('\nCHANGE IN CTR');
console.log(`  treated    ${pct(base.treatedArm.ctr)} -> ${pct(now.treated.ctr)}   ${dTreated >= 0 ? '+' : ''}${pct(dTreated)}`);
console.log(`  untreated  ${pct(base.untreatedArm.ctr)} -> ${pct(now.untreated.ctr)}   ${dUntreated >= 0 ? '+' : ''}${pct(dUntreated)}`);
console.log(`  difference-in-differences  ${dTreated - dUntreated >= 0 ? '+' : ''}${pct(dTreated - dUntreated)}`);

const dPos = now.treated.position - base.treatedArm.position;
console.log('\nREAD IT AGAINST THESE BEFORE BELIEVING IT');
console.log(`  treated arm clicks: ${base.treatedArm.clicks} before, ${now.treated.clicks} after.`
  + ` ${now.treated.clicks + base.treatedArm.clicks < 60 ? 'Too few to call anything but a large effect.' : 'Enough for a large effect.'}`);
console.log(`  treated arm position moved ${dPos >= 0 ? '+' : ''}${dPos.toFixed(2)}.`
  + `${Math.abs(dPos) > 0.5 ? ' That is a ranking change, so CTR is not attributable to the snippet alone.' : ' Position held, so the snippet is the live variable.'}`);
