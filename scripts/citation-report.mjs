#!/usr/bin/env node
/**
 * Compare the two most recent citation-panel runs and report the movement.
 *
 * Opens an issue only when the cited count actually changes. A monthly "still zero"
 * issue would train you to ignore the label, and on a new domain a flat zero for the
 * first 8 to 12 weeks is the expected result rather than a problem.
 *
 *   node scripts/citation-report.mjs           # print the comparison
 *   node scripts/citation-report.mjs --issue   # also open an issue if it moved
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileFindings } from './lib/issues.mjs';
import { loadState, saveState } from './lib/state.mjs';
import { renderDashboard } from './lib/dashboard.mjs';
import { SITE, BASE } from './monitors/config.mjs';

const LOG = path.join('data', 'citation-log.csv');
const WANT_ISSUE = process.argv.includes('--issue');

if (!fs.existsSync(LOG)) {
  console.error(`${LOG} not found. Run scripts/geo-audit.mjs first.`);
  process.exit(1);
}

// Read by header name rather than position. The log gained rate, hits and asks columns when
// repeated sampling came in, and a fixed index would have quietly compared the wrong fields.
const lines = fs.readFileSync(LOG, 'utf8').trim().split('\n');
const cols = lines[0].split(',').map((c) => c.replace(/^"|"$/g, ''));
const rows = lines.slice(1).filter(Boolean).map((line) => {
  const f = [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"'));
  const get = (name) => f[cols.indexOf(name)] ?? '';
  return {
    date: get('date'), model: get('model'), question: get('question'), cited: get('cited'),
    matched: get('matched'), hits: Number(get('hits') || 0), asks: Number(get('asks') || 0),
  };
});

const runs = new Map();
for (const r of rows) {
  const key = `${r.date}|${r.model}`;
  const agg = runs.get(key)
    ?? { date: r.date, model: r.model, total: 0, cited: 0, hits: [], asked: 0, landed: 0 };
  agg.total += 1;
  agg.asked += r.asks;
  agg.landed += r.hits;
  if (r.cited === 'yes') { agg.cited += 1; agg.hits.push(r.question); }
  runs.set(key, agg);
}

const ordered = [...runs.values()].sort((a, b) => a.date.localeCompare(b.date));
const latest = ordered[ordered.length - 1];
const previous = ordered.length > 1 ? ordered[ordered.length - 2] : null;

if (!latest) {
  console.error('No runs found in the log.');
  process.exit(1);
}

/**
 * Two numbers, because one of them alone misleads.
 *
 * "cited on 6 of 54 prompts" counts a prompt we won once in three tries the same as one we
 * win every time. The hit rate across every repetition is the stabler of the two, and the
 * one to watch month on month.
 */
const rate = (r) => `${r.cited}/${r.total} prompts, ${r.landed}/${r.asked} asks `
  + `(${r.asked ? ((r.landed / r.asked) * 100).toFixed(0) : 0}%)`;
console.log(`latest    ${latest.date} ${latest.model}  ${rate(latest)}`);
if (previous) console.log(`previous  ${previous.date} ${previous.model}  ${rate(previous)}`);

// Keep the dashboard in step whether or not anything moved.
const state = loadState();
renderDashboard(saveState(state), { site: `${SITE}${BASE}` });

const moved = previous && previous.cited !== latest.cited;
if (!moved) {
  console.log(previous ? 'no change in cited count; no issue opened' : 'first run; no comparison to make');
  process.exit(0);
}

const direction = latest.cited > previous.cited ? 'up' : 'down';
console.log(`cited count moved ${direction}: ${previous.cited} -> ${latest.cited}`);

if (!WANT_ISSUE) process.exit(0);

const newlyCited = latest.hits.filter((q) => !previous.hits.includes(q));
const lost = previous.hits.filter((q) => !latest.hits.includes(q));

fileFindings([{
  fingerprint: `citation:${latest.date}:${latest.cited}`,
  severity: direction === 'up' ? 'low' : 'medium',
  title: `Citation panel moved ${direction}: ${previous.cited} to ${latest.cited} of ${latest.total}`,
  body: [
    `| Run | Source | Cited |`,
    `| --- | --- | --- |`,
    `| ${previous.date} | ${previous.model} | ${rate(previous)} |`,
    `| ${latest.date} | ${latest.model} | ${rate(latest)} |`,
    '',
    newlyCited.length ? `**Newly cited on:**\n${newlyCited.map((q) => `- ${q}`).join('\n')}` : '',
    lost.length ? `\n**No longer cited on:**\n${lost.map((q) => `- ${q}`).join('\n')}` : '',
    '',
    'Full history is in `data/citation-log.csv`.',
    '',
    direction === 'down'
      ? 'A drop is worth checking before acting on: answer engines are non-deterministic run to run, so confirm across two months before treating it as a real regression.'
      : 'Worth noting which pages earned the citation, since that tells you which format is working.',
  ].filter(Boolean).join('\n'),
}]);
