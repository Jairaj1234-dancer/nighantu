#!/usr/bin/env node
/**
 * Verify every research claim on the site against PubMed.
 *
 * The site currently renders 921 bullets formatted as **Bold study title** (year):
 * finding. None carries a PMID, DOI or journal, and sampling showed most do not match
 * a published title. They read as citations while being unverifiable, which on a
 * reference work is worse than having no research section at all.
 *
 * This resolves each one and records a verdict. `ingest.mjs` then acts on it:
 *   resolved  -> render a real citation with the actual title and identifiers
 *   plausible -> keep the finding as attributed prose, drop the citation formatting
 *   none      -> remove the bullet
 *
 * Nothing here rewrites content. It only produces data/claims.json, so the decision
 * is inspectable before any page changes.
 *
 *   node scripts/verify-claims.mjs --dry-run        # resolve a sample, write nothing
 *   node scripts/verify-claims.mjs --limit 50       # first 50 claims
 *   node scripts/verify-claims.mjs                  # everything, resumable
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk, parseFrontmatter, stripMarkup, splitSections } from './lib.mjs';
import { resolveTitle, cleanTitle } from './lib/pubmed.mjs';

const OUT = path.join('data', 'claims.json');
const DRY = process.argv.includes('--dry-run');
const limitIdx = process.argv.indexOf('--limit');
const LIMIT = limitIdx > -1 ? Number(process.argv[limitIdx + 1]) : Infinity;

/** Headings whose bullets are presented as studies. */
const RESEARCH_HEADINGS = [
  'What do recent clinical trials show?',
  'What does modern research show?',
  'Which traditional uses are supported by research?',
  'Recent safety updates',
];

function collectClaims() {
  const claims = [];
  const wanted = new Set(RESEARCH_HEADINGS);

  for (const rel of walk('content')) {
    const kind = rel.split(path.sep)[0];
    const slug = path.basename(rel, '.md');
    const raw = fs.readFileSync(path.join('content', rel), 'utf8');
    const { data, body } = parseFrontmatter(raw);

    // Reuse the splitter the ingest pipeline already uses rather than building a
    // regex out of heading text, which is easy to get subtly wrong.
    for (const section of splitSections(body).sections) {
      if (!wanted.has(section.heading)) continue;

      // Only bullets that already look like a citation: bold lead, usually a year.
      for (const m of section.content.matchAll(/^[-*]\s+\*\*(.+?)\*\*\s*(?:\((\d{4})\))?\s*:?\s*(.*)$/gm)) {
        const title = cleanTitle(m[1]);
        if (title.length < 12) continue;
        claims.push({
          key: `${kind}/${slug}#${claims.length}`,
          kind,
          slug,
          heading: section.heading,
          botanical: stripMarkup(data.botanical ?? ''),
          rawTitle: m[1],
          title,
          year: m[2] ? Number(m[2]) : null,
          finding: stripMarkup(m[3] ?? '').trim(),
        });
      }
    }
  }
  return claims;
}

const claims = collectClaims();
const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { claims: {} };
const results = { ...previous.claims };

const todo = claims.filter((c) => !results[c.key]).slice(0, LIMIT);

console.log(`claims found      ${claims.length}`);
console.log(`already resolved  ${claims.length - claims.filter((c) => !results[c.key]).length}`);
console.log(`to check now      ${todo.length}${DRY ? '  (dry run, nothing written)' : ''}`);
console.log(`estimated time    ${Math.ceil((todo.length * 3 * 0.34) / 60)} min at 3 req/sec\n`);

const sample = DRY ? todo.slice(0, 12) : todo;
let n = 0;
const tally = { resolved: 0, plausible: 0, none: 0 };

for (const c of sample) {
  n += 1;
  const r = await resolveTitle(c.title, { binomial: c.botanical, year: c.year });
  tally[r.status] += 1;
  results[c.key] = {
    slug: c.slug,
    kind: c.kind,
    heading: c.heading,
    claimedTitle: c.title,
    claimedYear: c.year,
    finding: c.finding,
    status: r.status,
    matchedBy: r.matchedBy,
    ...(r.record ? {
      pmid: r.record.pmid,
      doi: r.record.doi,
      actualTitle: r.record.title,
      journal: r.record.journal,
      year: r.record.year,
      authors: r.record.authors,
      pubtypes: r.record.pubtypes,
      url: r.record.url,
    } : {}),
    checkedAt: new Date().toISOString().slice(0, 10),
  };

  if (n % 25 === 0 || DRY) {
    const mark = { resolved: 'OK  ', plausible: 'near', none: 'GONE' }[r.status];
    console.log(`${String(n).padStart(4)}/${sample.length} ${mark} ${c.slug.padEnd(22)} ${c.title.slice(0, 58)}`);
  }
  // Checkpoint so a long run is never lost.
  if (!DRY && n % 50 === 0) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), claims: results }, null, 1));
  }
}

console.log(`\nresolved (real title matched)  ${tally.resolved}`);
console.log(`plausible (paraphrase of a real paper) ${tally.plausible}`);
console.log(`nothing found                  ${tally.none}`);

if (DRY) {
  console.log('\nDry run: data/claims.json not written.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), claims: results }, null, 1));
console.log(`\nwrote ${OUT} (${Object.keys(results).length} claims)`);
