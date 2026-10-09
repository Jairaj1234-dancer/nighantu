#!/usr/bin/env node
/**
 * Check every cited paper against PubMed for retraction, and for being a notice rather than a study.
 *
 * This exists because one turned up by accident. A page's only citation was a retracted
 * mycotoxin paper that had nothing to do with the plant, found by a reviewer reading the
 * page for an unrelated reason. Once one is there, the question is not whether to fix it
 * but how many others there are, and that question is answerable: PubMed marks both the
 * retraction notice itself and the retracted article, and esummary returns 200 records
 * per request, so the whole corpus costs about fifteen calls.
 *
 * Citing a retracted paper as evidence is the same class of failure as citing one that
 * does not exist, which this project has already had to correct at scale. It is worse in
 * one way: the paper is real, so nothing about the citation looks wrong.
 *
 *   node scripts/check-retractions.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { getJson } from './lib/enrich.mjs';

const DRY = process.argv.includes('--dry-run');
const BATCH = 200;
const PAUSE = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const research = JSON.parse(fs.readFileSync(path.join('src', 'data', 'research.json'), 'utf8'));
const papers = research.papers ?? [];
const pmids = [...new Set(papers.map((p) => String(p.pmid)).filter(Boolean))];
console.log(`cited papers: ${papers.length}, distinct PMIDs: ${pmids.length}`);

/**
 * Three markers, and they mean three different things. The distinction is kept in the data because
 * collapsing it would make this project assert something false about a real journal record.
 *
 *   retracted-publication   the paper's findings have been withdrawn. Do not cite it.
 *   retraction-notice       the notice announcing that, which is not itself a study.
 *   erratum-notice          a correction notice: "Corrigendum: <original title>". The underlying
 *                           paper is perfectly good and is NOT retracted. What happened is that a
 *                           citation harvester matched the notice instead of the article, because
 *                           PubMed indexes it separately under a title that begins with the
 *                           article's own.
 *
 * The third was found by reading the published descriptions rather than by this check: two
 * corrigenda were sitting in the corpus as tier D papers, on herb/priyangu and herb/kakoli, in both
 * cases alongside the paper they correct. So the fix costs no evidence at all, which was verified
 * before anything was removed: priyangu cites both 36226284 and its corrigendum, kakoli both
 * 33968897 and its.
 *
 * An erratum notice is excluded from citation for a different reason from a retraction. A retracted
 * paper must not be cited because its finding is gone. An erratum notice must not be cited because
 * it is not a study, and the right citation is the article it corrects.
 */
const isRetractionNotice = (t) => /Retraction Notice|Retraction of Publication/i.test(t);
const isRetracted = (t) => /Retracted Publication/i.test(t);
const isErratum = (t) => /Published Erratum/i.test(t);

const flagged = [];
let checked = 0;

for (let i = 0; i < pmids.length; i += BATCH) {
  const batch = pmids.slice(i, i + BATCH);
  if (i) await sleep(PAUSE);
  const r = await getJson('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi'
    + `?db=pubmed&id=${batch.join(',')}&retmode=json`
    + '&tool=AgeAyurvedaNighantu&email=contact@ageayurveda.com', { retries: 2, timeoutMs: 40000 });
  if (!r.ok) { console.error(`  batch at ${i} failed: ${r.error ?? r.status}`); continue; }

  const res = r.data?.result ?? {};
  for (const id of res.uids ?? []) {
    const rec = res[id];
    if (!rec) continue;
    checked += 1;
    const types = (rec.pubtype ?? []).join('; ');
    const notice = isRetractionNotice(types);
    const retracted = isRetracted(types);
    const erratum = isErratum(types);
    if (!notice && !retracted && !erratum) continue;
    flagged.push({
      pmid: id,
      kind: notice ? 'retraction-notice' : retracted ? 'retracted-publication' : 'erratum-notice',
      title: rec.title ?? '',
      journal: rec.fulljournalname ?? rec.source ?? '',
      year: (rec.pubdate ?? '').slice(0, 4),
      pubtype: types,
      subjects: (papers.find((p) => String(p.pmid) === id)?.subjects ?? [])
        .map((s) => `${s.kind}/${s.slug}`),
    });
  }
  process.stdout.write(`\r  checked ${checked}/${pmids.length}, ${flagged.length} flagged   `);
}
console.log();

if (!flagged.length) {
  console.log('\nNo cited paper is marked retracted or is a retraction notice.');
} else {
  console.log(`\n${flagged.length} problem citation(s):\n`);
  for (const f of flagged) {
    console.log(`  PMID ${f.pmid}  [${f.kind}]`);
    console.log(`    ${f.title.slice(0, 90)}`);
    console.log(`    cited on: ${f.subjects.join(', ') || '(no page)'}`);
  }
}

if (DRY) { console.log('\nDry run: nothing written.'); process.exit(0); }

/**
 * THE BLOCKLIST IS MERGED, NEVER OVERWRITTEN, and this is the whole reason the file is safe to
 * regenerate.
 *
 * This check only sees PMIDs that are currently cited. Once a retracted paper has been dropped from
 * the corpus it stops being cited, so the next run cannot find it: the first run flagged 14, and a
 * run after the drop finds 4. Writing that result would have replaced a 14-entry blocklist with a
 * 4-entry one and silently un-blocked ten retracted papers, which the audit gate would then permit
 * back in. The list is a record of everything ever found, so it only ever grows.
 *
 * An entry is refreshed in place if this run saw it again, which keeps the kind and the citing pages
 * current, and retained untouched if it did not.
 */
fs.mkdirSync('data', { recursive: true });
const OUT = path.join('data', 'retractions.json');
const prior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { flagged: [] };
const merged = new Map((prior.flagged ?? []).map((f) => [String(f.pmid), f]));
let added = 0;
let refreshed = 0;
for (const f of flagged) {
  if (merged.has(String(f.pmid))) refreshed += 1; else added += 1;
  merged.set(String(f.pmid), { ...merged.get(String(f.pmid)), ...f });
}
const all = [...merged.values()].sort((a, b) => String(a.kind).localeCompare(String(b.kind))
  || String(a.pmid).localeCompare(String(b.pmid)));

if (all.length < (prior.flagged ?? []).length) {
  console.error(`\nREFUSING TO WRITE: the merged list (${all.length}) is smaller than the one on `
    + `disk (${(prior.flagged ?? []).length}). A blocklist must never shrink.`);
  process.exit(1);
}

const byKind = {};
for (const f of all) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
fs.writeFileSync(OUT, JSON.stringify({
  checkedAt: new Date().toISOString().slice(0, 10),
  papersChecked: checked,
  note: 'Cumulative. This list only grows: a paper already dropped from the corpus is no longer '
    + 'cited, so a later run cannot rediscover it, and overwriting would un-block it.',
  byKind,
  flagged: all,
}, null, 1));
console.log(`\nwrote ${OUT}: ${all.length} entries (${added} new, ${refreshed} refreshed, `
  + `${all.length - added - refreshed} retained from earlier runs)`);
console.log(`  ${JSON.stringify(byKind)}`);
