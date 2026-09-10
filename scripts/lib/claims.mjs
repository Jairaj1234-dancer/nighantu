import fs from 'node:fs';
import path from 'node:path';
import { cleanTitle } from './pubmed.mjs';

/**
 * Verdicts for the research bullets, applied during ingest so re-ingesting from the
 * vault never reintroduces an unverifiable claim.
 *
 * The site shipped 1,251 bullets formatted as **Bold title** (year): finding, with no
 * PMID, DOI or journal. Checking every one against PubMed found that NONE matched a
 * published title exactly: they are all paraphrases. What varies is whether the paper
 * behind the paraphrase could be identified.
 *
 *   cite    the title-word pass found the paper. Verified by inspection: claimed
 *           "Influence of Amalaki Rasayana on telomerase activity and telomere length"
 *           against the identical published title, and others differing only by an
 *           abbreviation. These become real citations carrying the ACTUAL title.
 *
 *   drop    everything else. Two sources:
 *             - the species-keyword fallback, which is not trustworthy. It paired
 *               "Placebo-controlled trial of sage extract on cognitive function" with a
 *               paper on antihyperlipidemic effects. Different study. Rejected wholesale.
 *             - nothing found at all.
 *
 * A claim nobody can check does not belong on a page that asks to be cited. Formulation
 * pages lose the most, because classical churnas and ghritas are researched largely in
 * journals PubMed does not index. That is stated on the page rather than hidden.
 */

const CLAIMS = path.join('data', 'claims.json');

const key = (kind, slug, title) => `${kind}/${slug}|${cleanTitle(title).toLowerCase()}`;

let index = null;

export function loadClaims() {
  if (index) return index;
  index = new Map();
  if (!fs.existsSync(CLAIMS)) return index;
  const data = JSON.parse(fs.readFileSync(CLAIMS, 'utf8')).claims ?? {};
  for (const v of Object.values(data)) {
    const trustworthy = v.status === 'plausible' && v.matchedBy === 'title-words' && v.pmid;
    index.set(key(v.kind, v.slug, v.claimedTitle), trustworthy
      ? {
        verdict: 'cite',
        pmid: v.pmid,
        doi: v.doi ?? '',
        title: v.actualTitle || v.claimedTitle,
        journal: v.journal ?? '',
        year: v.year ?? v.claimedYear ?? null,
        authors: v.authors ?? [],
        url: v.url ?? `https://pubmed.ncbi.nlm.nih.gov/${v.pmid}/`,
      }
      : { verdict: 'drop' });
  }
  return index;
}

const fmtAuthors = (a = []) => {
  if (!a.length) return '';
  const names = a.map((x) => (typeof x === 'string' ? x : `${x.last ?? ''} ${x.initials ?? ''}`.trim()));
  return names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and others`;
};

/**
 * Rewrite one research section. Returns { content, cited, dropped } where content is
 * '' if nothing survived.
 */
export function applyToSection(kind, slug, content) {
  const claims = loadClaims();
  const out = [];
  let cited = 0;
  let dropped = 0;

  for (const line of content.split('\n')) {
    const m = /^([-*])\s+\*\*(.+?)\*\*\s*(?:\((\d{4})\))?\s*:?\s*(.*)$/.exec(line);
    if (!m) { out.push(line); continue; }

    const verdict = claims.get(key(kind, slug, m[2]));
    if (!verdict || verdict.verdict === 'drop') { dropped += 1; continue; }

    const r = verdict;
    const finding = (m[4] ?? '').trim();
    const bits = [
      `- ${fmtAuthors(r.authors)}`.replace(/^- $/, '- '),
      r.year ? `${r.year}.` : '',
      `[${r.title}](${r.url}).`,
      r.journal ? `*${r.journal}*.` : '',
      `PMID [${r.pmid}](${r.url})`,
      r.doi ? `· [doi:${r.doi}](https://doi.org/${r.doi})` : '',
    ].filter(Boolean).join(' ');
    out.push(finding ? `${bits}  \n  ${finding}` : bits);
    cited += 1;
  }

  const body = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { content: body, cited, dropped };
}

/** Note appended where a section lost claims, so the gap is stated rather than hidden. */
export function shortfallNote(kind, dropped) {
  if (!dropped) return '';
  const where = kind === 'formulation'
    ? 'Classical formulations are researched largely in journals that PubMed does not index, '
      + 'so an absence here reflects the reach of the index rather than the state of the evidence.'
    : 'An absence here means we could not identify the source, not that no work exists.';
  return `\n\n*${dropped} further claim${dropped === 1 ? '' : 's'} previously listed here `
    + `could not be traced to a published paper and ${dropped === 1 ? 'has' : 'have'} been removed. `
    + `${where}*`;
}
