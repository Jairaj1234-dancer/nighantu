/**
 * PubMed E-utilities client.
 *
 * No account and no API key. NCBI allows 3 requests/second unauthenticated and
 * *requires* the `tool` and `email` parameters for compliance, so both are always
 * sent. An API key would raise the limit to 10/sec but needs an NCBI login, which
 * this project deliberately avoids.
 *
 * https://www.ncbi.nlm.nih.gov/books/NBK25497/
 */
import { get } from './fetch.mjs';

const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const TOOL = 'ageayurveda-nighantu';
const EMAIL = 'contact@ageayurveda.com';

// 3 req/sec is the ceiling; 340ms leaves headroom for clock skew.
const GAP_MS = 340;
let lastCall = 0;

async function throttled(path, params) {
  const wait = GAP_MS - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const qs = new URLSearchParams({ ...params, tool: TOOL, email: EMAIL });
  return get(`${BASE}/${path}?${qs}`, { retries: 2, timeoutMs: 25000 });
}

const json = (res) => {
  if (!res.ok) return null;
  try { return JSON.parse(res.text); } catch { return null; }
};

/** Returns { count, ids }. */
export async function esearch(term, { retmax = 5, sort = 'relevance' } = {}) {
  const res = await throttled('esearch.fcgi', { db: 'pubmed', term, retmax, sort, retmode: 'json' });
  const d = json(res)?.esearchresult;
  if (!d) return { count: 0, ids: [] };
  return { count: Number(d.count ?? 0), ids: d.idlist ?? [] };
}

/** Full records for up to 200 PMIDs per call. */
export async function esummary(pmids) {
  if (!pmids.length) return [];
  const out = [];
  for (let i = 0; i < pmids.length; i += 200) {
    const batch = pmids.slice(i, i + 200);
    const res = await throttled('esummary.fcgi', { db: 'pubmed', id: batch.join(','), retmode: 'json' });
    const d = json(res)?.result;
    if (!d?.uids) continue;
    for (const uid of d.uids) {
      const r = d[uid];
      if (!r || r.error) continue;
      out.push({
        pmid: uid,
        title: (r.title ?? '').replace(/\.$/, '').trim(),
        journal: r.fulljournalname || r.source || '',
        year: Number(String(r.pubdate ?? '').slice(0, 4)) || null,
        authors: (r.authors ?? []).filter((a) => a.authtype === 'Author').map((a) => a.name),
        pubtypes: r.pubtype ?? [],
        doi: (r.articleids ?? []).find((a) => a.idtype === 'doi')?.value ?? '',
        url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
      });
    }
  }
  return out;
}

/**
 * Evidence tier from PubMed publication types. Same scheme the companion project
 * already uses, so the two datasets stay comparable.
 */
export function tierOf(pubtypes = []) {
  const p = pubtypes.map((x) => x.toLowerCase());
  const has = (...xs) => xs.some((x) => p.some((v) => v.includes(x)));
  if (has('systematic review', 'meta-analysis')) return 'A';
  if (has('randomized controlled trial', 'pragmatic clinical trial', 'equivalence trial')) return 'B';
  if (has('clinical trial', 'observational study', 'review', 'case reports', 'comparative study')) return 'C';
  return 'D';
}

export const TIER_LABEL = {
  A: 'Systematic reviews and meta-analyses',
  B: 'Randomised controlled trials',
  C: 'Other clinical and review articles',
  D: 'Laboratory and animal studies',
};

/**
 * Strip markdown, wikilinks and trailing punctuation.
 *
 * Both forms matter: verify-claims reads published content where wikilinks are already
 * resolved to [label](url), while ingest applies verdicts BEFORE resolution, where the
 * same title still reads [[target|label]]. Handling only one form silently breaks the
 * key match between the two, which cost 119 recoverable citations before it was caught.
 */
export function cleanTitle(t) {
  return String(t)
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.:;,\s]+$/, '')
    .trim();
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'its', 'their',
  'systematic', 'review', 'meta', 'analysis', 'study', 'studies', 'trial', 'trials',
  'randomized', 'randomised', 'controlled', 'clinical', 'evaluation', 'effects', 'effect',
  'potential', 'comprehensive', 'critical', 'evidence', 'based', 'role', 'using']);

/**
 * Try to resolve a paraphrased title to a real PubMed record.
 *
 * Three passes, strictest first. Returns { status, record, matchedBy } where status is
 * 'resolved' (exact title), 'plausible' (found by keywords, title differs) or 'none'.
 */
export async function resolveTitle(rawTitle, { binomial = '', year = null } = {}) {
  const title = cleanTitle(rawTitle);
  if (title.length < 12) return { status: 'none', record: null, matchedBy: 'too-short' };

  // 1. Exact phrase in the title field.
  const exact = await esearch(`"${title}"[Title]`, { retmax: 1 });
  if (exact.count > 0) {
    const [rec] = await esummary(exact.ids);
    if (rec) return { status: 'resolved', record: rec, matchedBy: 'exact-title' };
  }

  // 2. Distinctive title words, all required, still restricted to the title field.
  const words = title
    .split(/[^A-Za-z0-9-]+/)
    .filter((w) => w.length > 3 && !STOP.has(w.toLowerCase()))
    .slice(0, 6);
  if (words.length >= 3) {
    const term = words.map((w) => `${w}[Title]`).join(' AND ');
    const hit = await esearch(term, { retmax: 3 });
    if (hit.count > 0) {
      const recs = await esummary(hit.ids);
      const rec = pickBest(recs, title, year);
      if (rec) return { status: 'plausible', record: rec, matchedBy: 'title-words' };
    }
  }

  // 3. Species plus a couple of distinctive words, anywhere in the record.
  if (binomial && words.length >= 2) {
    const term = `"${binomial}"[Title/Abstract] AND ${words.slice(0, 3).join(' AND ')}`;
    const hit = await esearch(term, { retmax: 3 });
    if (hit.count > 0) {
      const recs = await esummary(hit.ids);
      const rec = pickBest(recs, title, year);
      if (rec) return { status: 'plausible', record: rec, matchedBy: 'species-keywords' };
    }
  }

  return { status: 'none', record: null, matchedBy: null };
}

/** Prefer a record whose year matches and whose title shares the most words. */
function pickBest(records, title, year) {
  if (!records.length) return null;
  const want = new Set(title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  let best = null;
  let bestScore = -1;
  for (const r of records) {
    const have = new Set(r.title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
    const overlap = [...want].filter((w) => have.has(w)).length;
    const score = overlap / Math.max(want.size, 1) + (year && r.year === year ? 0.3 : 0);
    if (score > bestScore) { bestScore = score; best = r; }
  }
  // Below roughly half the distinctive words in common it is not the same paper.
  return bestScore >= 0.5 ? best : null;
}
