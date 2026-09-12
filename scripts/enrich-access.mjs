#!/usr/bin/env node
/**
 * Resolve every cited paper to the best link a reader can actually open.
 *
 * A PubMed ID proves a paper exists. It does not get anyone to the text, and most
 * readers who follow a citation want to read the thing. This resolves each paper down a
 * deliberate ladder and records which rung it landed on, so the page can say what kind
 * of link it is offering rather than presenting a paywall as though it were a paper.
 *
 *   1  open-access full text   a PDF anyone can open, publisher or repository
 *   2  PubMed Central          free full text at PMC
 *   3  DOI resolver            publisher landing page via doi.org
 *   4  repository copy         author's institutional or subject repository
 *   5  paywalled               recorded, and marked so the page can say so
 *
 * Sources, all free and none needing an account: Unpaywall for open-access status and
 * locations, NCBI's ID converter for PMCIDs, and PubMed efetch for abstracts.
 *
 * The one-line description of what a paper investigates is taken from the paper's OWN
 * abstract, trimmed to its opening sentences. It is not written by a model. That is a
 * deliberate constraint: this project has already deleted 755 citations that turned out
 * to be paraphrase, and a generated summary of a paper is exactly the kind of plausible
 * text that survives review while being subtly wrong.
 *
 *   node scripts/enrich-access.mjs [--limit=N]
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveAll, loadCache, saveCache, getJson, getJsonWithBackoff } from './lib/enrich.mjs';
import { get } from './lib/fetch.mjs';

const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) ?? '').split('=')[1]) || Infinity;
const MAIL = 'contact@ageayurveda.com';
const TOOL = 'AgeAyurvedaNighantu';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const research = JSON.parse(fs.readFileSync(path.join('src', 'data', 'research.json'), 'utf8'));
const papers = research.papers ?? [];
console.log(`cited papers: ${papers.length}, with a DOI: ${papers.filter((p) => p.doi).length}`);

// ---------------------------------------------------------------- unpaywall
async function unpaywall(doi) {
  const r = await getJsonWithBackoff(
    `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${MAIL}`,
    { tries: 4, baseMs: 1000 });
  if (r.notFound) return { status: 'not-found' };
  if (!r.ok) return { status: 'error', error: r.error ?? `http ${r.status}` };
  const d = r.data ?? {};
  const locs = (d.oa_locations ?? []).map((l) => ({
    host: l.host_type ?? '', version: l.version ?? '',
    pdf: l.url_for_pdf ?? '', landing: l.url_for_landing_page ?? l.url ?? '',
  }));
  const best = d.best_oa_location ?? null;
  return {
    status: 'ok',
    isOa: Boolean(d.is_oa),
    oaStatus: d.oa_status ?? '',
    journal: d.journal_name ?? '',
    publisher: d.publisher ?? '',
    bestHost: best?.host_type ?? '',
    bestPdf: best?.url_for_pdf ?? '',
    bestLanding: best?.url_for_landing_page ?? best?.url ?? '',
    locations: locs,
  };
}

const dois = papers.map((p) => p.doi).filter(Boolean);
const { cache: upCache } = await resolveAll('unpaywall', dois, unpaywall,
  { rateMs: 160, label: 'Unpaywall', limit: LIMIT });
saveCache('unpaywall', upCache);

// ---------------------------------------------------------------- pmcids
// Batched 200 at a time; the converter takes a comma-separated list.
const pmcCache = loadCache('pmcid');
pmcCache.entries ??= {};
{
  const need = papers.map((p) => String(p.pmid)).filter((id) => id && !pmcCache.entries[id]);
  const todo = need.slice(0, LIMIT === Infinity ? need.length : LIMIT);
  for (let i = 0; i < todo.length; i += 200) {
    const batch = todo.slice(i, i + 200);
    if (i) await sleep(400);
    const r = await getJson('https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/'
      + `?ids=${batch.join(',')}&format=json&tool=${TOOL}&email=${MAIL}`, { retries: 2, timeoutMs: 40000 });
    if (!r.ok) { console.error(`  pmcid batch ${i} failed`); continue; }
    const seen = new Set();
    for (const rec of r.data?.records ?? []) {
      const id = String(rec.pmid ?? '');
      if (!id) continue;
      seen.add(id);
      pmcCache.entries[id] = rec.pmcid
        ? { status: 'ok', pmcid: rec.pmcid, live: rec.live !== 'false' }
        : { status: 'not-found' };
    }
    // Anything the converter did not answer for is a definite "no PMC copy".
    for (const id of batch) if (!seen.has(id)) pmcCache.entries[id] = { status: 'not-found' };
    process.stdout.write(`\r  PMCID: ${Math.min(i + 200, todo.length)}/${todo.length}   `);
  }
  if (todo.length) console.log();
  pmcCache.updatedAt = new Date().toISOString().slice(0, 10);
  saveCache('pmcid', pmcCache);
}

// ---------------------------------------------------------------- abstracts
// Quoted, never generated. efetch returns the abstract as the authors wrote it.
const absCache = loadCache('abstract');
absCache.entries ??= {};
{
  const need = papers.map((p) => String(p.pmid)).filter((id) => id && !absCache.entries[id]);
  const todo = need.slice(0, LIMIT === Infinity ? need.length : LIMIT);
  for (let i = 0; i < todo.length; i += 150) {
    const batch = todo.slice(i, i + 150);
    if (i) await sleep(400);
    const res = await get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi'
      + `?db=pubmed&id=${batch.join(',')}&retmode=xml&rettype=abstract&tool=${TOOL}&email=${MAIL}`,
      { retries: 2, timeoutMs: 60000 });
    if (!res.ok) { console.error(`  abstract batch ${i} failed`); continue; }

    // One <PubmedArticle> per paper; take its PMID and its abstract text.
    for (const art of res.text.split('<PubmedArticle>').slice(1)) {
      const pm = /<PMID[^>]*>(\d+)<\/PMID>/.exec(art)?.[1];
      if (!pm) continue;
      const chunks = [...art.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)]
        .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      absCache.entries[pm] = chunks.length
        ? { status: 'ok', abstract: chunks.join(' ').slice(0, 2000) }
        : { status: 'not-found' };
    }
    for (const id of batch) absCache.entries[id] ??= { status: 'not-found' };
    process.stdout.write(`\r  abstracts: ${Math.min(i + 150, todo.length)}/${todo.length}   `);
  }
  if (todo.length) console.log();
  absCache.updatedAt = new Date().toISOString().slice(0, 10);
  saveCache('abstract', absCache);
}

// ---------------------------------------------------------------- the ladder
/** The opening of an abstract says what a paper set out to do. Two sentences, at most 300 chars. */
function investigates(abstract) {
  if (!abstract) return '';
  const s = abstract.split(/(?<=[.!?])\s+/).filter((x) => x.length > 25);
  let out = '';
  for (const sent of s) {
    if ((out + ' ' + sent).length > 300) break;
    out = out ? `${out} ${sent}` : sent;
    if (out.length > 140) break;
  }
  return out;
}

const RUNG = ['open-access-full-text', 'pubmed-central', 'doi-publisher', 'repository', 'paywalled'];

const resolved = papers.map((p) => {
  const up = p.doi ? upCache.entries[p.doi] : null;
  const pmc = pmcCache.entries[String(p.pmid)];
  const abs = absCache.entries[String(p.pmid)];

  const repo = (up?.locations ?? []).find((l) => l.host === 'repository' && (l.pdf || l.landing));
  let access = null;

  if (up?.status === 'ok' && up.isOa && up.bestPdf) {
    access = { rung: 'open-access-full-text', url: up.bestPdf, note: `${up.oaStatus} open access, ${up.bestHost}` };
  } else if (pmc?.status === 'ok' && pmc.pmcid) {
    access = { rung: 'pubmed-central', url: `https://pmc.ncbi.nlm.nih.gov/articles/${pmc.pmcid}/`, note: 'free full text at PubMed Central' };
  } else if (up?.status === 'ok' && up.isOa && up.bestLanding) {
    access = { rung: 'open-access-full-text', url: up.bestLanding, note: `${up.oaStatus} open access, ${up.bestHost}` };
  } else if (p.doi) {
    access = { rung: 'doi-publisher', url: `https://doi.org/${p.doi}`, note: 'publisher page via DOI' };
  } else if (repo) {
    access = { rung: 'repository', url: repo.pdf || repo.landing, note: 'author or institutional repository' };
  } else {
    access = { rung: 'paywalled', url: `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`, note: 'abstract only' };
  }

  // A paywalled DOI is still worth marking as such, so a page can warn rather than
  // sending a reader into a paywall unannounced.
  if (access.rung === 'doi-publisher' && up?.status === 'ok' && !up.isOa) {
    access.paywalled = true;
    access.note = 'publisher page via DOI, subscription likely required';
  }

  return {
    pmid: p.pmid, doi: p.doi || '', title: p.title, journal: p.journal || up?.journal || '',
    year: p.year, authors: p.authors ?? [], tier: p.tier, subjects: p.subjects ?? [],
    access,
    alternates: (up?.locations ?? []).slice(0, 3).map((l) => ({ host: l.host, url: l.pdf || l.landing })).filter((l) => l.url),
    investigates: investigates(abs?.status === 'ok' ? abs.abstract : ''),
  };
});

const byRung = {};
for (const r of resolved) byRung[r.access.rung] = (byRung[r.access.rung] ?? 0) + 1;
const withDesc = resolved.filter((r) => r.investigates).length;

console.log('\naccess ladder:');
for (const k of RUNG) console.log(`  ${k.padEnd(24)} ${byRung[k] ?? 0}`);
console.log(`  ${'with a description'.padEnd(24)} ${withDesc}`);
console.log(`  ${'readable without paying'.padEnd(24)} ${(byRung['open-access-full-text'] ?? 0) + (byRung['pubmed-central'] ?? 0) + (byRung.repository ?? 0)}`);

const payload = {
  updatedAt: new Date().toISOString().slice(0, 10),
  sources: ['Unpaywall, https://unpaywall.org/', 'NCBI ID Converter', 'PubMed efetch'],
  note: 'Each paper resolved to the most openly readable link available, with the rung recorded. '
    + 'Descriptions are the opening of the paper’s own abstract, quoted, never generated.',
  summary: { papers: resolved.length, byRung, withDescription: withDesc },
  papers: resolved,
};
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync(path.join('src', 'data', 'access.json'), JSON.stringify(payload, null, 1));
fs.writeFileSync(path.join('public', 'access.json'), JSON.stringify({
  name: 'Age Ayurveda Nighantu reading links',
  description: 'Every paper cited in this reference, resolved to the most openly readable copy: '
    + 'open-access full text where it exists, then PubMed Central, then the DOI, with paywalled '
    + 'items marked as such.',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  ...payload,
}, null, 1));
console.log('\nwrote src/data/access.json and public/access.json');
