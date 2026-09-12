#!/usr/bin/env node
/**
 * Check every cited paper against PubMed for retraction.
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

/** Both markers matter, and they mean different things. */
const isRetractionNotice = (t) => /Retraction Notice|Retraction of Publication/i.test(t);
const isRetracted = (t) => /Retracted Publication/i.test(t);

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
    if (!notice && !retracted) continue;
    flagged.push({
      pmid: id,
      kind: notice ? 'retraction-notice' : 'retracted-publication',
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

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(path.join('data', 'retractions.json'), JSON.stringify({
  checkedAt: new Date().toISOString().slice(0, 10),
  papersChecked: checked,
  flagged,
}, null, 1));
console.log(`\nwrote data/retractions.json`);
