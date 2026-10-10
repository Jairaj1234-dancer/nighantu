#!/usr/bin/env node
/**
 * Does /datasets/ still describe what the DOI actually resolves to?
 *
 * WHY THIS EXISTS. /datasets/ carries a paragraph that tells a reader, against this project's
 * interest, that the concept DOI resolves to a single repository zip rather than to the data files
 * themselves. That paragraph is true today and is designed to stop being true: the whole point of
 * scripts/zenodo-deposit.mjs is to replace the zip with the 32 data files and a manifest.
 *
 * The failure mode this gate is built for already happened once. A v2.0.0 draft was prepared in CI,
 * reported as ready, and believed to be published; the public API still showed one version holding
 * one zip, and the paragraph was nearly rewritten on the strength of the belief rather than the
 * record. A page that describes its own archive is a page that goes stale silently, because nothing
 * in a static build has any reason to look at Zenodo.
 *
 * So the claim is parsed out of the page rather than restated here. Page and gate cannot drift apart
 * because there is only one copy of the figure, and it lives in the sentence a reader sees.
 *
 * WHAT IT CHECKS, and nothing beyond it. Three things are facts about the deposit and therefore
 * checkable: how many files the newest published version holds, whether that single file is an
 * archive, and its size as Zenodo itself displays it. The rest of the paragraph is reasoning about
 * what a DOI identifies, which no API can confirm.
 *
 * WHAT IT DOES WHEN ZENODO IS UNREACHABLE. It says so and exits 0. A deploy must not be blocked by
 * somebody else's outage, and this project has been bitten hard enough by steps that report success
 * on failure that the skip is printed in full rather than swallowed. Unreachable and wrong are
 * different outcomes with different exit statuses.
 *
 *   node scripts/zenodo-claim.mjs            report what the DOI resolves to
 *   node scripts/zenodo-claim.mjs --check    exit 1 if the page no longer describes it
 *   node scripts/zenodo-claim.mjs --page F   read the claim from F instead of the real page
 *
 * --page is there so this gate could be proved to fail. A gate nobody has watched fail is an
 * assertion about a gate, not a gate: the four silent-zero bugs this project has found were all in
 * code that looked right. It takes a fixture with a deliberately wrong figure in it.
 */
import fs from 'node:fs';

const CHECK = process.argv.includes('--check');
const pageArg = process.argv.indexOf('--page');
const PAGE = pageArg === -1 ? 'src/pages/datasets.astro' : process.argv[pageArg + 1];
const CONCEPT_RECID = '22805684';
const API = `https://zenodo.org/api/records/${CONCEPT_RECID}`;

/**
 * Zenodo's own UI reports file sizes in decimal MB, so the page's figure is decimal too.
 * Dividing by 1024 instead gives 7.11 for the file the page calls 7.5 MB, and a gate that used the
 * wrong base would fail on a correct page. One of the two had to be written down; this is it.
 */
const decimalMB = (bytes) => bytes / 1_000_000;

/**
 * The claims the page makes about the deposit, read out of the page.
 *
 * Anchored on the caveat paragraph rather than the whole file, because /datasets/ mentions the DOI
 * in several places and only this paragraph describes the deposit's contents. If the paragraph is
 * reworded past recognition the gate fails loudly rather than quietly passing on no claims found,
 * which is the direction a gate should fail in.
 */
function claimsFromPage() {
  const html = fs.readFileSync(PAGE, 'utf8');
  const start = html.indexOf('What the DOI actually resolves to');
  if (start === -1) return null;
  const end = html.indexOf('</p>', start);
  const para = html.slice(start, end === -1 ? undefined : end).replace(/\s+/g, ' ');

  const COUNTS = { one: 1, two: 2, three: 3 };

  /**
   * COUNT AND SIZE MUST COME FROM ONE CLAUSE, not from two searches of the paragraph.
   *
   * The first version matched the count and then scanned separately for "N MB archive", which read
   * the historical figure out of the sentence recording what the deposit used to hold and reported
   * the corrected page as wrong. A paragraph that documents its own correction necessarily contains
   * a superseded number, so the pattern has to say which number is the live claim rather than
   * taking whichever one it finds first.
   *
   * Both shapes the page has used are here. The archive form is kept so the gate still reads a
   * page rolled back to it, and because deleting the pattern for a state the deposit could return
   * to would make a rollback look like a parse failure.
   */
  const SHAPES = [
    /holds (one|two|three|\d+) files? totalling ([\d.]+)\s*MB/i,
    /holds (one|two|three|\d+) files?: a ([\d.]+)\s*MB archive/i,
  ];
  const m = SHAPES.map((re) => para.match(re)).find(Boolean);
  if (!m) return null;

  const word = m[1].toLowerCase();
  return {
    para,
    files: COUNTS[word] ?? Number(word),
    mb: Number(m[2]),
  };
}

async function latestVersion() {
  // Zenodo's edge returns 403 to a request with no User-Agent, and Node's fetch sends none.
  const res = await fetch(API, {
    headers: {
      'User-Agent': 'NighantuBot/1.0 (+https://nighantu.ageayurveda.com/about/)',
      Accept: 'application/json',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Zenodo returned ${res.status} for ${API}`);
  const rec = await res.json();
  const files = rec.files ?? [];
  return {
    recid: rec.id,
    doi: rec.doi,
    version: rec.metadata?.version ?? '(no version set)',
    files: files.map((f) => ({ key: f.key, bytes: f.size ?? 0 })),
    bytes: files.reduce((n, f) => n + (f.size ?? 0), 0),
  };
}

const claims = claimsFromPage();
if (!claims) {
  console.error(`Could not find the deposit-contents claim in ${PAGE}.`);
  console.error('It is the paragraph beginning "What the DOI actually resolves to".');
  console.error('If that paragraph was removed on purpose, remove this gate in the same commit.');
  process.exit(CHECK ? 1 : 0);
}

let live;
try {
  live = await latestVersion();
} catch (err) {
  console.log('Zenodo is unreachable, so the page claim was NOT verified this run.');
  console.log(`  reason: ${err.message}`);
  console.log(`  the page says: ${claims.files} file(s), ${claims.mb} MB`);
  process.exit(0);
}

const liveMB = Number(decimalMB(live.bytes).toFixed(1));
console.log(`Newest published version of ${CONCEPT_RECID}`);
console.log(`  record    ${live.recid}  ${live.version}  ${live.doi}`);
console.log(`  files     ${live.files.length}, ${liveMB} MB total`);
for (const f of live.files) {
  console.log(`              ${f.key}  ${decimalMB(f.bytes).toFixed(2)} MB`);
}
console.log(`  page says ${claims.files} file(s), ${claims.mb} MB`);

const problems = [];
if (live.files.length !== claims.files) {
  problems.push(
    `the deposit holds ${live.files.length} file(s); the page says ${claims.files}`,
  );
}
if (live.files.length === 1 && !/\.(zip|tar\.gz|tgz)$/i.test(live.files[0].key)) {
  problems.push(`the single file is ${live.files[0].key}, which the page calls an archive`);
}
if (Math.abs(liveMB - claims.mb) > 0.1) {
  problems.push(`the deposit is ${liveMB} MB; the page says ${claims.mb} MB`);
}

if (!problems.length) {
  console.log('\nThe page still describes the deposit correctly.');
  process.exit(0);
}

console.log('\n/datasets/ no longer describes what the DOI resolves to:');
for (const p of problems) console.log(`  - ${p}`);
console.log(`\nRewrite the caveat paragraph in ${PAGE} to describe the deposit as it now stands,`);
console.log('and record the change as a correction rather than replacing the text silently.');
process.exit(CHECK ? 1 : 0);
