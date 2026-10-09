#!/usr/bin/env node
/**
 * Tests for the citation-log reader, which is the instrument that says whether this project works.
 *
 * WHY THIS FILE EXISTS. Every other load-bearing parser here is tested: product-extract has 106
 * cases, and robots, formulation-names, identifiers, safety, grounding and answer-safety all have
 * their own. This one did not, and it has reported a confident FALSE ZERO four separate times:
 *
 *   1  A positional parse read field 3 as `cited`. The log then gained an `intent` column at
 *      field 3, so it compared an intent string to 'yes' and data/DASHBOARD.md showed a flat
 *      0 | 67 | 0% for three months while the log held 10 of 67 cited.
 *   2  The fix applied a quoted-field matcher to the header, which is unquoted. Every column
 *      index came back -1, so the whole log read as unrecognised: a quieter wrong answer.
 *   3  Log rotation moved the data into citation-log-<date>.csv and left the hardcoded
 *      citation-log.csv holding one `# panel` comment, so the reader reported "No runs logged"
 *      against a complete 49-row run sitting beside it.
 *   4  The fix for that read every log but applied ONE header, taken from whichever file sorted
 *      first. The logs do not share a column order, so `cited` is field 3 in the September log and
 *      field 4 in the others, and it reported 0 cited of 48 for a run with 4 of 49.
 *
 * Every one of those looked like a finding rather than a fault, and the third survived longest
 * because the dashboard's own footer explained the zero away as expected for a new domain. So the
 * cases below are not hypothetical shapes: each is the exact log structure that broke a version of
 * this function, pinned so the fifth variant has to get past them.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { citationSummary } from '../lib/dashboard.mjs';

let n = 0;
const eq = (label, a, b) => { assert.deepEqual(a, b, `${label}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); n += 1; };
const ok = (label, v) => { assert.ok(v, label); n += 1; };

/** A fresh directory per case, so no case can see another's files. */
const withLogs = (files, fn) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nighantu-dash-'));
  try {
    for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

/** The modern log shape: a panel comment, an unquoted header, fully quoted data rows. */
const row = (f) => `${f.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')}`;
const MODERN_HEADER = 'date,model,question,intent,cited,rate,hits,asks,matched,urls,error,sources';
const SEPTEMBER_HEADER = 'date,model,question,cited,rate,hits,asks,matched,error,sources';

// --- case 1: `cited` is read BY NAME, not by position -------------------------------------------
// The September log has no intent column, so `cited` sits one field earlier. A positional reader
// trained on the modern shape reads the question text here and finds it is not 'yes'.
withLogs({
  'citation-log.csv': [
    '# panel aaaa1111 (2 prompts)',
    MODERN_HEADER,
    row(['2026-10-05', 'gemini', 'Where can I buy one?', 'shirodhara', 'yes', '1.00', 3, 3, 'src', 'u', '', 's']),
    row(['2026-10-05', 'gemini', 'What is in it?', 'composition', 'no', '0.00', 0, 3, '', '', '', 's']),
  ].join('\n'),
}, (dir) => {
  const runs = citationSummary(dir);
  eq('one run', runs.length, 1);
  eq('cited counted by column name', runs[0].cited, 1);
  eq('total counted', runs[0].total, 2);
});

// --- case 2: an UNQUOTED header beside QUOTED rows ----------------------------------------------
// Applying the quoted-field matcher to the header yields an empty array and every index becomes
// -1, which previously made a whole log read as unrecognised.
withLogs({
  'citation-log.csv': [
    MODERN_HEADER,
    row(['2026-10-01', 'gemini', 'q', 'monograph', 'yes', '1.00', 2, 3, '', '', '', '']),
  ].join('\n'),
}, (dir) => {
  const runs = citationSummary(dir);
  ok('an unquoted header is still recognised', runs && runs.length === 1);
  eq('and its rows are read', runs[0].cited, 1);
});

// --- case 3: rotation left the fixed filename empty --------------------------------------------
// The data is in the dated file; citation-log.csv holds only a panel comment. A reader bound to the
// fixed name reports "no runs logged" against a full run sitting beside it.
withLogs({
  'citation-log.csv': '# panel bbbb2222 (0 prompts)\n',
  'citation-log-2026-10-05.csv': [
    '# panel cccc3333 (2 prompts)',
    MODERN_HEADER,
    row(['2026-10-05', 'gemini', 'q1', 'brand', 'yes', '1.00', 3, 3, '', '', '', '']),
    row(['2026-10-05', 'gemini', 'q2', 'brand', 'no', '0.00', 0, 3, '', '', '', '']),
  ].join('\n'),
}, (dir) => {
  const runs = citationSummary(dir);
  ok('the rotated log is found', runs && runs.length === 1);
  eq('and read in full', [runs[0].cited, runs[0].total], [1, 2]);
  eq('an emptied fixed filename contributes nothing', runs[0].panel, 'cccc3333');
});

// --- case 4: files with DIFFERENT column orders -------------------------------------------------
// This is the one that reported 0 cited of 48 for a run with 4 of 49. Each file must be parsed with
// its own header; a header shared across files reads the wrong field in at least one of them.
withLogs({
  'citation-log-2026-09-18.csv': [
    SEPTEMBER_HEADER,
    row(['2026-09-18', 'gemini', 'q', 'yes', '1.00', 3, 3, '', '', '']),
  ].join('\n'),
  'citation-log-2026-10-05.csv': [
    '# panel dddd4444 (1 prompt)',
    MODERN_HEADER,
    row(['2026-10-05', 'gemini', 'q', 'verification', 'yes', '1.00', 3, 3, '', '', '', '']),
  ].join('\n'),
}, (dir) => {
  const runs = citationSummary(dir);
  eq('both runs read', runs.length, 2);
  eq('each file parsed with its own header', runs.map((r) => r.cited), [1, 1]);
  eq('newest first', runs[0].date, '2026-10-05');
});

// --- the panel comment is not the header -------------------------------------------------------
// A reader taking line 0 parses "# panel ..." as the header and reads every field as empty.
withLogs({
  'citation-log.csv': [
    '# panel eeee5555 (1 prompt)',
    '# a second comment line, because one was not enough to break it',
    MODERN_HEADER,
    row(['2026-10-05', 'gemini', 'q', 'property', 'yes', '1.00', 1, 3, '', '', '', '']),
  ].join('\n'),
}, (dir) => {
  const runs = citationSummary(dir);
  ok('comments above the header are skipped', runs && runs.length === 1);
  eq('and the row is still counted', runs[0].cited, 1);
});

// --- a failed ask is not a zero reading --------------------------------------------------------
// A run where nothing landed is not a measurement, and one fetch failure must not appear as a 0%
// run beside real ones.
withLogs({
  'citation-log.csv': [
    MODERN_HEADER,
    row(['2026-10-05', 'gemini', 'ok', 'monograph', 'no', '0.00', 0, 3, '', '', '', '']),
    row(['2026-10-06', 'broken', 'failed', 'monograph', 'no', '', 0, 0, '', '', 'fetch failed', '']),
  ].join('\n'),
}, (dir) => {
  const runs = citationSummary(dir);
  eq('the run with no landed ask is excluded', runs.length, 1);
  eq('and the real run survives', runs[0].model, 'gemini');
});

// --- panels are kept apart, so a rebuild is not a collapse -------------------------------------
// Two panels on the same date are two instruments. Merging them into one row would show a panel
// change as a drop in citations, which is what the panel label exists to prevent.
withLogs({
  'citation-log.csv': [
    '# panel ffff6666 (1 prompt)',
    MODERN_HEADER,
    row(['2026-10-05', 'gemini', 'q', 'brand', 'yes', '1.00', 3, 3, '', '', '', '']),
  ].join('\n'),
  'citation-log-old.csv': [
    '# panel 99997777 (1 prompt)',
    MODERN_HEADER,
    row(['2026-10-05', 'gemini', 'q', 'brand', 'no', '0.00', 0, 3, '', '', '', '']),
  ].join('\n'),
}, (dir) => {
  const runs = citationSummary(dir);
  eq('two panels stay two rows', runs.length, 2);
  eq('each labelled', new Set(runs.map((r) => r.panel)).size, 2);
  ok('and not summed into one', runs.every((r) => r.total === 1));
});

// --- absence is reported as absence, never as zero ---------------------------------------------
withLogs({}, (dir) => {
  eq('no logs at all reads as null, not as a zero run', citationSummary(dir), null);
});
withLogs({ 'citation-log.csv': '# panel 0000 (0 prompts)\n' }, (dir) => {
  eq('a log with no header reads as null', citationSummary(dir), null);
});
withLogs({ 'citation-log.csv': 'date,model,question\n' }, (dir) => {
  eq('a header without a cited column reads as null', citationSummary(dir), null);
});
eq('a directory that does not exist reads as null', citationSummary('/nonexistent-dir-for-test'), null);

// --- a probe log is not a panel run ------------------------------------------------------------
withLogs({
  'citation-probe-2026-10-05.csv': [
    MODERN_HEADER,
    row(['2026-10-05', 'gemini', 'q', 'probe', 'yes', '1.00', 3, 3, '', '', '', '']),
  ].join('\n'),
}, (dir) => {
  eq('probe logs are not counted as panel runs', citationSummary(dir), null);
});

// --- hits and asks are summed as the honest denominator ----------------------------------------
withLogs({
  'citation-log.csv': [
    MODERN_HEADER,
    row(['2026-10-05', 'gemini', 'a', 'brand', 'yes', '0.33', 1, 3, '', '', '', '']),
    row(['2026-10-05', 'gemini', 'b', 'brand', 'yes', '1.00', 3, 3, '', '', '', '']),
  ].join('\n'),
}, (dir) => {
  const r = citationSummary(dir)[0];
  eq('prompts cited', r.cited, 2);
  eq('asks landed summed', r.hits, 4);
  eq('asks summed', r.asks, 6);
  ok('so a prompt cited once in three is not the same as three in three', r.hits < r.asks);
});

console.log(`PASS: ${n} citation-log reader cases`);
