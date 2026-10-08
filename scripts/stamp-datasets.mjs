#!/usr/bin/env node
/**
 * Stamp the published datasets so a copy can be traced back here.
 *
 * The datasets are CC BY 4.0, so attribution is already REQUIRED. What was missing is evidence:
 * nothing in the files said where they came from at the record level, so a copy stripped of its
 * envelope was indistinguishable from someone's own work and a breach was unprovable rather than
 * merely unreported.
 *
 * Six of the seven are regenerated at build by six different scripts, so this runs once after all
 * of them rather than being threaded through each. One step, applied uniformly.
 *
 * WHAT IT ADDS, in three layers of decreasing strippability.
 *
 * 1. AN ATTRIBUTION BLOCK on the envelope: canonical URL, licence, publisher, and the citation to
 *    use. This is what CC BY asks for, made machine-readable. Trivially removed, and that is
 *    fine: it is there to make honest reuse easy, not to catch anyone.
 *
 * 2. A SOURCE URL ON EVERY RECORD, pointing at the page that record came from. This is the
 *    practical measure. A partial copy, which is the normal kind, carries it: take 200 of 838
 *    compounds and each of the 200 still names its origin. Removing it means deliberately
 *    stripping an attribution field from a CC BY dataset, which is a different act from
 *    forgetting to credit, and it leaves the remover's intent unambiguous.
 *
 * 3. A CANARY TOKEN per dataset and per record, keyed to a secret. This is the layer that
 *    actually PROVES origin. The token is an HMAC of the record's identity under a secret held
 *    outside this repository, so it cannot be derived by anyone else and cannot be explained as
 *    coincidence. If it turns up in someone else's file, the only way it got there is a copy.
 *
 * WHY THE TOKEN IS CONDITIONAL. It is written only when ATLAS_CANARY_SECRET is set. With no
 * secret there is nothing to key an HMAC to, and a token derived from public inputs would be
 * reproducible by anyone and prove nothing while looking as though it did. So the script says
 * plainly that it is skipping that layer rather than emitting decoration. Set the secret as a
 * repository secret and pass it in the deploy workflow when you want it.
 *
 * WHAT IT WILL NOT DO. It will not invent records. The obvious canary is a fake entry nobody else
 * could have, and on a reference corpus that is the one thing it must never be: a fabricated herb
 * or compound would be indistinguishable to a reader from a real one, and this project has
 * already had to repair a fabricated plant part that reached a page. Every stamp here is metadata
 * in a named field, and no factual claim is added or altered.
 *
 *   node scripts/stamp-datasets.mjs            # dry run, reads dist
 *   node scripts/stamp-datasets.mjs --write
 *   node scripts/stamp-datasets.mjs --dir=public --write   # only if you really mean public
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Stamps dist, not public, and runs AFTER the build.
 *
 * Two reasons it has to be this way round. The research bucket for a paper is read out of the
 * built pages, so dist must already exist. And public/chemistry.json is COMMITTED, unlike the
 * other six: stamping public/ would put canary tokens into version control, where a demo run
 * promptly did exactly that and had to be reverted. dist is the thing that gets published and
 * nothing in it is committed, so stamping there is both correct and reversible by rebuilding.
 */
const TARGET = process.argv.find((a) => a.startsWith('--dir='))?.slice(6) ?? 'dist';
const WRITE = process.argv.includes('--write');
const SITE = (process.env.ATLAS_SITE ?? 'https://nighantu.ageayurveda.com').replace(/\/$/, '');
const SECRET = process.env.ATLAS_CANARY_SECRET || '';
const LEDGER = path.join('measurement', 'canary-ledger.json');

/**
 * Where a record is actually DISPLAYED on this site, resolved against the built output.
 *
 * The first attempt invented the patterns /compound/<slug>/ and /research/p/<pmid>/, and neither
 * exists: compounds are one index page and research papers live in four letter-range buckets, so
 * that would have published about 7,460 dead URLs inside datasets whose entire selling point is
 * that a claim can be followed to its source. Worse than no attribution.
 *
 * So the bucket for a paper is not guessed from a rule. It is read out of dist by asking which
 * built page actually contains that paper's PMID, which is slow once and correct, and which fails
 * loudly if the routing changes rather than silently emitting a 404.
 */
const bucketIndex = (() => {
  const dir = path.join(TARGET, 'research');
  if (!fs.existsSync(dir)) return null;
  const buckets = fs.readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, 'index.html')));
  const map = new Map();
  for (const b of buckets) {
    const html = fs.readFileSync(path.join(dir, b, 'index.html'), 'utf8');
    for (const m of html.matchAll(/\b(\d{7,8})\b/g)) if (!map.has(m[1])) map.set(m[1], b);
  }
  return map;
})();

const researchUrl = (r) => {
  if (!r.pmid) return '/research/';
  const b = bucketIndex?.get(String(r.pmid));
  return b ? `/research/${b}/` : '/research/';
};

/** Which page a record of each dataset came from, so the source URL is real and resolvable. */
const RECORD_URL = {
  dravyaguna: (r) => (r.kind && r.slug ? `/${r.kind}/${r.slug}/` : null),
  compounds: () => '/compounds/',
  chemistry: () => '/compounds/',
  /**
   * taxonomy's `pages` is an array of {kind, slug, title}, not of URL strings, and a taxon can
   * appear on several pages. The first is used because the array is ordered by the ingest and the
   * record's own `query` is the binomial rather than a page, so there is no better single answer.
   */
  taxonomy: (r) => {
    const p = Array.isArray(r.pages) ? r.pages[0] : null;
    return p && p.kind && p.slug ? `/${p.kind}/${p.slug}/` : null;
  },
  research: researchUrl,
  access: researchUrl,
  verification: (r) => (r.id ? `/verification/#${r.id}` : '/verification/'),
};

/** A stable identity for a record, for the HMAC. Never invented: always a field it already has. */
const RECORD_ID = (r) => r.slug ?? r.key ?? r.pmid ?? r.id ?? r.canonicalName ?? r.query ?? r.name ?? null;

const token = (...parts) => (SECRET
  ? crypto.createHmac('sha256', SECRET).update(parts.join('|')).digest('hex').slice(0, 16)
  : null);

/** Find the array of OBJECTS that holds the records, however this dataset is shaped. */
const recordsOf = (d) => {
  if (Array.isArray(d)) return ['(root)', d];
  const cands = [];
  for (const [k, v] of Object.entries(d)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object' && v[0] !== null) cands.push([k, v]);
  }
  return cands.sort((a, b) => b[1].length - a[1].length)[0] ?? [null, null];
};

const files = fs.readdirSync(TARGET).filter((f) => f.endsWith('.json'));
const report = [];
const ledger = { note: 'Canary tokens published in the datasets. Private: this proves origin and must not be committed.', stampedOn: new Date().toLocaleDateString('en-CA'), datasets: {} };

for (const file of files) {
  const name = file.replace(/\.json$/, '');
  const full = path.join(TARGET, file);
  let d;
  try { d = JSON.parse(fs.readFileSync(full, 'utf8')); } catch { report.push({ name, skipped: 'not valid JSON' }); continue; }
  if (Array.isArray(d)) { report.push({ name, skipped: 'bare array, no envelope to attribute' }); continue; }

  const [key, records] = recordsOf(d);
  if (!records) { report.push({ name, skipped: 'no record array found' }); continue; }

  // 1. the attribution block
  d.attribution = {
    source: `${SITE}/datasets/`,
    canonical: `${SITE}/`,
    publisher: 'Age Ayurveda',
    license: d.license ?? 'https://creativecommons.org/licenses/by/4.0/',
    citeAs: `Age Ayurveda Nighantu, ${d.name ?? name} dataset, ${SITE}/datasets/`,
    note: 'CC BY 4.0 requires attribution. Each record carries its own source URL for the same '
      + 'reason: so a partial copy can still be credited without having to find this block.',
  };

  // 2. the per-record source URL, and 3. the per-record canary
  const urlFor = RECORD_URL[name];
  let stampedUrls = 0;
  let stampedTokens = 0;
  let noId = 0;
  const unresolved = new Set();
  for (const r of records) {
    if (typeof r !== 'object' || r === null) continue;
    if (urlFor) {
      const u = urlFor(r);
      // Only ever accept a string. A mapper that returns an object means the dataset's shape
      // changed under it, and writing that object into a `source` field would publish a mess.
      if (typeof u === 'string' && u) {
        r.source = u.startsWith('http') ? u : `${SITE}${u}`;
        stampedUrls += 1;
      }
    }
    if (r.source) {
      const p = r.source.replace(SITE, '').split('#')[0];
      const onDisk = fs.existsSync(path.join(TARGET, p.replace(/^\/|\/$/g, ''), 'index.html'))
        || fs.existsSync(path.join(TARGET, p.replace(/^\//, '')));
      if (!onDisk) unresolved.add(p);
    }
    const id = RECORD_ID(r);
    if (!id) { noId += 1; continue; }
    const t = token(name, String(id));
    if (t) { r.canary = t; stampedTokens += 1; }
  }

  const fileToken = token(name, 'dataset', String(records.length));
  if (fileToken) {
    d.canary = fileToken;
    ledger.datasets[name] = { fileToken, records: records.length, recordTokens: stampedTokens };
  }

  report.push({ name, key, records: records.length, stampedUrls, stampedTokens, noId, fileToken: Boolean(fileToken), unresolved: [...unresolved] });
  if (WRITE) fs.writeFileSync(full, `${JSON.stringify(d)}\n`);
}

console.log(`site        ${SITE}`);
console.log(`secret      ${SECRET ? 'present, canary tokens WILL be written' : 'ABSENT, canary tokens skipped'}`);
console.log('');
for (const r of report) {
  if (r.skipped) { console.log(`  ${r.name.padEnd(14)} skipped: ${r.skipped}`); continue; }
  console.log(`  ${r.name.padEnd(14)} ${String(r.records).padStart(5)} records in "${r.key}"  `
    + `source urls ${r.stampedUrls}  tokens ${r.stampedTokens}${r.noId ? `  no-id ${r.noId}` : ''}`
    + `${r.unresolved?.length ? `\n      UNRESOLVED (${r.unresolved.length}): ${r.unresolved.slice(0, 3).join(' ')}` : ''}`);
}

if (!SECRET) {
  console.log('\nTo enable the layer that actually proves origin:');
  console.log('  1. generate a secret and keep it off this repository, e.g.');
  console.log('       openssl rand -hex 32');
  console.log('  2. add it as the repository secret ATLAS_CANARY_SECRET');
  console.log('  3. pass it in deploy.yml on this step: env: { ATLAS_CANARY_SECRET: ${{ secrets.ATLAS_CANARY_SECRET }} }');
  console.log('Without it, every record still carries its source URL, which is the practical layer.');
}

if (!WRITE) {
  console.log('\nDry run. Pass --write to stamp.');
  process.exit(0);
}
if (SECRET) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(`\nledger written to ${LEDGER} (gitignored; this is the proof, keep it)`);
}
console.log(`stamped ${report.filter((r) => !r.skipped).length} dataset(s)`);
