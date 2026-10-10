#!/usr/bin/env node
/**
 * Pins the two helpers in scripts/lib/bing-coverage.mjs.
 *
 * The case that matters most is the first one. Bing returns .NET JSON dates, and a parser that
 * cannot read them returns null, which this project's report prints as "Bing has never crawled
 * this page". That is a false negative on the central question the script exists to answer, and it
 * would be indistinguishable from the real thing in the output.
 */
import assert from 'node:assert/strict';
import { dotNetDate, sectionOf, stratify, redactor } from '../lib/bing-coverage.mjs';

let pass = 0;
const t = (name, fn) => {
  try {
    fn();
    pass++;
  } catch (e) {
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
};

// ---- dotNetDate ------------------------------------------------------------------------------
t('.NET date with no offset parses', () =>
  assert.equal(dotNetDate('/Date(1760000000000)/'), '2025-10-09'));

t('.NET date with a +0000 offset parses', () =>
  assert.equal(dotNetDate('/Date(1760000000000+0000)/'), '2025-10-09'));

t('.NET date with a negative offset suffix still parses the millis', () =>
  assert.equal(dotNetDate('/Date(1760000000000-0530)/'), '2025-10-09'));

t('a pre-epoch .NET date parses rather than throwing', () =>
  assert.equal(dotNetDate('/Date(-86400000)/'), '1969-12-31'));

t('a plain ISO string still works, in case Bing changes format', () =>
  assert.equal(dotNetDate('2026-10-10T08:00:00Z'), '2026-10-10'));

t('null, undefined and empty string are genuinely absent', () => {
  assert.equal(dotNetDate(null), null);
  assert.equal(dotNetDate(undefined), null);
  assert.equal(dotNetDate(''), null);
});

t('unparseable junk is null rather than Invalid Date', () =>
  assert.equal(dotNetDate('not a date'), null));

t('THE BUG THIS GUARDS: a naive Date() on a .NET date would be invalid', () => {
  // Proves the input really is unparseable by the obvious implementation, so the test above is
  // testing something. If this ever stops being true the helper is no longer load-bearing.
  assert.ok(Number.isNaN(new Date('/Date(1760000000000)/').getTime()));
  assert.equal(dotNetDate('/Date(1760000000000)/'), '2025-10-09');
});

// ---- sectionOf -------------------------------------------------------------------------------
t('a collection URL reports its collection', () =>
  assert.equal(sectionOf('https://x.test/herb/amla/'), 'herb'));

t('a root page reports (root)', () => {
  assert.equal(sectionOf('https://x.test/datasets/'), '(root)');
  assert.equal(sectionOf('https://x.test/'), '(root)');
});

t('a deep path still reports the top segment', () =>
  assert.equal(sectionOf('https://x.test/choosing/a/b/c/'), 'choosing'));

// ---- stratify --------------------------------------------------------------------------------
const corpus = [
  ...Array.from({ length: 500 }, (_, i) => `https://x.test/herb/h${i}/`),
  ...Array.from({ length: 140 }, (_, i) => `https://x.test/formulation/f${i}/`),
  ...Array.from({ length: 30 }, (_, i) => `https://x.test/device/d${i}/`),
  ...Array.from({ length: 5 }, (_, i) => `https://x.test/choosing/c${i}/`),
  'https://x.test/datasets/',
];

t('every section present in the input appears in the sample', () => {
  const got = new Set(stratify(corpus, 80).map(sectionOf));
  for (const s of ['herb', 'formulation', 'device', 'choosing', '(root)']) {
    assert.ok(got.has(s), `section ${s} missing from the sample`);
  }
});

t('A TINY SECTION IS NOT ROUNDED AWAY', () => {
  // 1 of 676 URLs rounds to 0 at any sane sample size. Without the Math.max(1, ...) the root
  // section would never be asked about, and "the root pages are not indexed" is exactly the kind
  // of finding this script is for.
  const got = stratify(corpus, 20).map(sectionOf);
  assert.ok(got.includes('(root)'));
  assert.ok(got.includes('choosing'));
});

t('no URL is sampled twice', () => {
  const got = stratify(corpus, 200);
  assert.equal(new Set(got).size, got.length);
});

t('the sample never exceeds the population', () => {
  assert.ok(stratify(corpus, 5000).length <= corpus.length);
  const tiny = ['https://x.test/herb/a/', 'https://x.test/herb/b/'];
  assert.ok(stratify(tiny, 100).length <= 2);
});

t('the sample is spread through a section, not its first n', () => {
  const got = stratify(corpus, 100).filter((u) => sectionOf(u) === 'herb');
  const idx = got.map((u) => Number(/h(\d+)/.exec(u)[1]));
  assert.ok(Math.max(...idx) > 400, `herb sample stopped at h${Math.max(...idx)}, so it is a prefix`);
});

t('an empty population does not throw', () => assert.deepEqual(stratify([], 10), []));

// ---- redactor --------------------------------------------------------------------------------
t('the key is removed from a log line', () => {
  const r = redactor('SECRET123');
  assert.equal(r('https://a.test/x?apikey=SECRET123&siteUrl=y'),
    'https://a.test/x?apikey=[REDACTED]&siteUrl=y');
});

t('every occurrence is removed, not just the first', () => {
  const r = redactor('K');
  assert.equal(r('K and K and K'), '[REDACTED] and [REDACTED] and [REDACTED]');
});

t('no key configured does not redact the literal string "undefined"', () => {
  // A redactor built from an absent key must not turn every "undefined" in a payload into
  // [REDACTED], which is what replaceAll(undefined, ...) would do after string coercion.
  const r = redactor(undefined);
  assert.equal(r('value was undefined'), 'value was undefined');
});

console.log(`bing-coverage: ${pass} passed${process.exitCode ? ', with failures above' : ''}`);
