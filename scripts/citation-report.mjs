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

const rows = fs.readFileSync(LOG, 'utf8').trim().split('\n').slice(1).filter(Boolean).map((line) => {
  const f = [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"'));
  return { date: f[0], model: f[1], question: f[2], cited: f[3], matched: f[4] };
});

const runs = new Map();
for (const r of rows) {
  const key = `${r.date}|${r.model}`;
  const agg = runs.get(key) ?? { date: r.date, model: r.model, total: 0, cited: 0, hits: [] };
  agg.total += 1;
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

const rate = (r) => `${r.cited}/${r.total} (${((r.cited / r.total) * 100).toFixed(0)}%)`;
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
