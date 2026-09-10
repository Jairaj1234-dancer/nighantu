#!/usr/bin/env node
/**
 * Build the research index: every cited paper once, with the pages it concerns.
 *
 * src/data/citations.json is keyed by page, which is what the References component
 * needs. The index needs the inverse: keyed by paper, so a reader can ask "what has
 * been published about Ayurvedic materia medica, and which herbs does each paper
 * concern". Nothing comparable exists publicly, and being the only source of something
 * is the durable way to get found.
 *
 * Emits src/data/research.json for the pages, plus public/research.json and
 * public/research.csv as downloads that the Dataset markup can point at.
 *
 *   node scripts/research-index.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';

const IN = path.join('src', 'data', 'citations.json');
const OUT_DATA = path.join('src', 'data', 'research.json');
const OUT_JSON = path.join('public', 'research.json');
const OUT_CSV = path.join('public', 'research.csv');
const DRY = process.argv.includes('--dry-run');

if (!fs.existsSync(IN)) {
  console.error(`${IN} not found. Run scripts/citations.mjs first.`);
  process.exit(1);
}

const src = JSON.parse(fs.readFileSync(IN, 'utf8'));

/** Invert: paper -> the pages that cite it. */
const papers = new Map();
for (const [key, page] of Object.entries(src.pages ?? {})) {
  const [kind, slug] = key.split('/');
  for (const c of page.citations ?? []) {
    let p = papers.get(c.pmid);
    if (!p) {
      p = {
        pmid: c.pmid,
        doi: c.doi || '',
        title: c.title,
        journal: c.journal || '',
        year: c.year || null,
        authors: c.authors ?? [],
        tier: c.tier || 'D',
        url: c.url,
        subjects: [],
      };
      papers.set(c.pmid, p);
    }
    // Keep the strongest tier if two sources disagree.
    if ('ABCD'.indexOf(c.tier) < 'ABCD'.indexOf(p.tier)) p.tier = c.tier;
    if (!p.subjects.some((s) => s.slug === slug && s.kind === kind)) {
      p.subjects.push({ kind, slug, title: page.title, binomial: page.binomial || '' });
    }
  }
}

const all = [...papers.values()].sort((a, b) =>
  'ABCD'.indexOf(a.tier) - 'ABCD'.indexOf(b.tier)
  || (b.year ?? 0) - (a.year ?? 0)
  || a.title.localeCompare(b.title));

// Papers cited by several pages are the ones worth surfacing: they concern a herb
// family or a shared constituent rather than one plant.
const multi = all.filter((p) => p.subjects.length > 1).length;

const byTier = {};
const byDecade = {};
const byJournal = {};
for (const p of all) {
  byTier[p.tier] = (byTier[p.tier] ?? 0) + 1;
  if (p.year) {
    const d = `${Math.floor(p.year / 10) * 10}s`;
    byDecade[d] = (byDecade[d] ?? 0) + 1;
  }
  if (p.journal) byJournal[p.journal] = (byJournal[p.journal] ?? 0) + 1;
}

const topJournals = Object.entries(byJournal)
  .sort((a, b) => b[1] - a[1]).slice(0, 15)
  .map(([name, n]) => ({ name, count: n }));

const summary = {
  papers: all.length,
  withDoi: all.filter((p) => p.doi).length,
  subjectsCovered: new Set(all.flatMap((p) => p.subjects.map((s) => `${s.kind}/${s.slug}`))).size,
  citedByMultiple: multi,
  byTier,
  byDecade,
  topJournals,
  yearRange: [
    Math.min(...all.filter((p) => p.year).map((p) => p.year)),
    Math.max(...all.filter((p) => p.year).map((p) => p.year)),
  ],
};

console.log(`papers            ${summary.papers}`);
console.log(`with a DOI        ${summary.withDoi}`);
console.log(`subjects covered  ${summary.subjectsCovered}`);
console.log(`cited by 2+ pages ${summary.citedByMultiple}`);
console.log(`tiers             ${JSON.stringify(byTier)}`);
console.log(`years             ${summary.yearRange.join(' to ')}`);

if (DRY) { console.log('\nDry run: nothing written.'); process.exit(0); }

fs.mkdirSync('public', { recursive: true });
fs.writeFileSync(OUT_DATA, JSON.stringify({ updatedAt: src.updatedAt, summary, papers: all }, null, 1));

// Public download: same data, stable shape, no UTM anywhere in it.
fs.writeFileSync(OUT_JSON, JSON.stringify({
  name: 'Age Ayurveda Nighantu research index',
  description: 'Published literature indexed in PubMed concerning Ayurvedic materia medica, '
    + 'cross-referenced to the herbs and formulations each paper concerns.',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  updatedAt: src.updatedAt,
  count: all.length,
  papers: all,
}, null, 1));

const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csv = [
  'pmid,doi,year,tier,title,journal,authors,subjects,url',
  ...all.map((p) => [
    p.pmid, p.doi, p.year ?? '', p.tier, p.title, p.journal,
    (p.authors ?? []).join('; '),
    p.subjects.map((s) => s.title).join('; '),
    p.url,
  ].map(esc).join(',')),
].join('\n');
fs.writeFileSync(OUT_CSV, `${csv}\n`);

console.log(`\nwrote ${OUT_DATA}, ${OUT_JSON}, ${OUT_CSV}`);
