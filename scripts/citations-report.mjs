#!/usr/bin/env node
/**
 * Compare the research index against the last committed one and report the delta.
 *
 * Opens an issue only when papers were actually added. A monthly "nothing new" issue
 * would train you to ignore the label, and in a field this size a quiet month is normal.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileFindings } from './lib/issues.mjs';

const PATH = 'src/data/research.json';
const WANT_ISSUE = process.argv.includes('--issue');

if (!fs.existsSync(PATH)) { console.error(`${PATH} not found`); process.exit(1); }
const now = JSON.parse(fs.readFileSync(PATH, 'utf8'));

let before = null;
try {
  before = JSON.parse(execFileSync('git', ['show', `HEAD:${PATH}`], { encoding: 'utf8', maxBuffer: 64e6 }));
} catch { /* first run, or the file is new */ }

if (!before) {
  console.log(`no previous index to compare; ${now.papers.length} papers`);
  process.exit(0);
}

const had = new Set(before.papers.map((p) => p.pmid));
const added = now.papers.filter((p) => !had.has(p.pmid));

console.log(`papers: ${before.papers.length} -> ${now.papers.length} (${added.length} new)`);
if (!added.length || !WANT_ISSUE) process.exit(0);

// Which subjects gained literature is the useful signal, not the raw count.
const subjects = new Map();
for (const p of added) {
  for (const s of p.subjects ?? []) {
    if (!subjects.has(s.title)) subjects.set(s.title, []);
    subjects.get(s.title).push(p);
  }
}
const ranked = [...subjects.entries()].sort((a, b) => b[1].length - a[1].length);

fileFindings([{
  fingerprint: `citations:new:${now.papers.length}`,
  severity: 'low',
  title: `${added.length} new paper${added.length === 1 ? '' : 's'} added to the research index`,
  body: [
    `The index grew from ${before.papers.length} to ${now.papers.length} papers.`,
    '',
    '**Subjects that gained the most:**',
    ...ranked.slice(0, 12).map(([t, ps]) => `- ${t}: ${ps.length} new`),
    '',
    '**Highest-tier additions:**',
    ...added.filter((p) => p.tier === 'A').slice(0, 8)
      .map((p) => `- [${p.title}](${p.url}) (${p.year ?? 'n.d.'})`),
    '',
    'Worth a look if any subject gained a systematic review, since that may change what the',
    'page should say. Everything else needs no action; the pages update themselves.',
  ].join('\n'),
}]);
