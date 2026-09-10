#!/usr/bin/env node
/**
 * Build data/citations.json: real, linkable literature per page.
 *
 * Three sources, merged and deduplicated by PMID:
 *
 *   1. The companion project's PubMed table (670 rows, 587 PMIDs, 636 DOIs, already
 *      tiered). Local-only and read immutably; the merged output is what gets committed,
 *      so the build never depends on that path.
 *   2. Records recovered by scripts/verify-claims.mjs while resolving the site's existing
 *      research bullets.
 *   3. Fresh PubMed queries by binomial for pages still short of literature.
 *
 * Nothing here is invented. Every entry carries a PMID, and most carry a DOI.
 *
 *   node scripts/citations.mjs --dry-run     # report coverage, write nothing
 *   node scripts/citations.mjs --no-fetch    # local sources only, no PubMed calls
 *   node scripts/citations.mjs               # everything
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { walk, parseFrontmatter, stripMarkup, slugify } from './lib.mjs';
import { esearch, esummary, tierOf } from './lib/pubmed.mjs';

const OUT = path.join('src', 'data', 'citations.json');
const CLAIMS = path.join('data', 'claims.json');
const DB = process.env.EVIDENCE_DB
  || path.join(os.homedir(), 'Projects/ageayurveda-companion/backend/ageayurveda.db');

const DRY = process.argv.includes('--dry-run');
const NO_FETCH = process.argv.includes('--no-fetch');
const PER_PAGE = 12;

const TIER_RANK = { A: 0, B: 1, C: 2, D: 3 };

/** Genus + species, lowercased, authorities and qualifiers stripped. */
function normBinomial(v) {
  const s = stripMarkup(v ?? '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\bsyn\.?\b.*$/i, ' ')
    .replace(/[^A-Za-z\s]/g, ' ')
    .trim()
    .split(/\s+/);
  return s.length >= 2 ? `${s[0]} ${s[1]}`.toLowerCase() : '';
}

// ---------------------------------------------------------------- pages
const pages = [];
for (const rel of walk('content')) {
  const kind = rel.split(path.sep)[0];
  if (kind !== 'herb' && kind !== 'formulation') continue;
  const slug = path.basename(rel, '.md');
  const { data } = parseFrontmatter(fs.readFileSync(path.join('content', rel), 'utf8'));
  pages.push({
    kind,
    slug,
    title: data.title ?? slug,
    aliases: Array.isArray(data.aliases) ? data.aliases : [],
    binomial: normBinomial(data.botanical),
  });
}

// ---------------------------------------------------------- source 1: local DB
function loadLocalEvidence() {
  if (!fs.existsSync(DB)) {
    console.log(`evidence DB not found at ${DB}; skipping local source`);
    return [];
  }
  const sql = `SELECT me.pmid, COALESCE(me.doi,'') AS doi, me.title,
      COALESCE(me.journal,'') AS journal, me.year, COALESCE(me.authors,'[]') AS authors,
      me.evidence_tier AS tier, me.source_url AS url, d.latin_binomial AS binomial,
      COALESCE(d.nama_sanskrit,'') AS sanskrit, COALESCE(d.english,'') AS english,
      COALESCE(d.hindi,'') AS hindi
    FROM modern_evidence me JOIN dravyas d ON d.id = me.dravya_id;`;
  try {
    // immutable=1 so a read can never touch the user's database.
    const raw = execFileSync('sqlite3', ['-json', `file:${DB}?immutable=1`, sql],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error(`could not read evidence DB: ${e.message}`);
    return [];
  }
}

const local = loadLocalEvidence();

const parseAuthors = (raw) => {
  try {
    const a = JSON.parse(raw);
    return a.map((x) => (x.collective ? x.collective : `${x.last ?? ''} ${x.initials ?? ''}`.trim()))
      .filter(Boolean);
  } catch { return []; }
};

// Index local evidence by binomial and by every vernacular name the dravya carries,
// because 306 of 504 herb pages have no binomial and would otherwise be unreachable.
const byBinomial = new Map();
const byName = new Map();
for (const r of local) {
  const rec = {
    pmid: String(r.pmid),
    doi: r.doi || '',
    title: String(r.title || '').replace(/\.$/, ''),
    journal: r.journal || '',
    year: r.year || null,
    authors: parseAuthors(r.authors),
    tier: r.tier || 'D',
    url: r.url || `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`,
    source: 'companion-db',
  };
  const bin = normBinomial(r.binomial);
  if (bin) {
    if (!byBinomial.has(bin)) byBinomial.set(bin, []);
    byBinomial.get(bin).push(rec);
  }
  for (const n of [r.sanskrit, r.english, r.hindi]) {
    const key = slugify(stripMarkup(n ?? ''));
    if (key.length < 4) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(rec);
  }
}

// -------------------------------------------------- source 2: recovered from claims
const recovered = new Map();
if (fs.existsSync(CLAIMS)) {
  const cl = JSON.parse(fs.readFileSync(CLAIMS, 'utf8')).claims ?? {};
  for (const v of Object.values(cl)) {
    if (!v.pmid) continue;
    const key = `${v.kind}/${v.slug}`;
    if (!recovered.has(key)) recovered.set(key, []);
    recovered.get(key).push({
      pmid: String(v.pmid),
      doi: v.doi || '',
      title: v.actualTitle || v.claimedTitle,
      journal: v.journal || '',
      year: v.year || v.claimedYear || null,
      authors: v.authors ?? [],
      tier: tierOf(v.pubtypes ?? []),
      url: v.url || `https://pubmed.ncbi.nlm.nih.gov/${v.pmid}/`,
      source: 'recovered-claim',
    });
  }
}

// ---------------------------------------------------------------- assemble
const result = {};
const stats = { pages: 0, withCitations: 0, fromDb: 0, fromClaims: 0, fromPubmed: 0, fetched: 0 };

const dedupe = (list) => {
  const seen = new Map();
  for (const r of list) if (!seen.has(r.pmid)) seen.set(r.pmid, r);
  return [...seen.values()].sort((a, b) =>
    (TIER_RANK[a.tier] ?? 3) - (TIER_RANK[b.tier] ?? 3) || (b.year ?? 0) - (a.year ?? 0));
};

for (const p of pages) {
  stats.pages += 1;
  const key = `${p.kind}/${p.slug}`;
  const found = [];

  if (p.binomial && byBinomial.has(p.binomial)) {
    found.push(...byBinomial.get(p.binomial));
    stats.fromDb += 1;
  } else {
    // Fall back to name matching for pages with no binomial in frontmatter.
    for (const cand of [p.slug, ...p.aliases.map((a) => slugify(a))]) {
      if (byName.has(cand)) { found.push(...byName.get(cand)); stats.fromDb += 1; break; }
    }
  }

  if (recovered.has(key)) {
    found.push(...recovered.get(key));
    stats.fromClaims += 1;
  }

  result[key] = { title: p.title, binomial: p.binomial, citations: dedupe(found) };
}

// ------------------------------------------- source 3: fresh PubMed for thin pages
if (!NO_FETCH && !DRY) {
  const thin = pages.filter((p) => p.binomial && result[`${p.kind}/${p.slug}`].citations.length < 6);
  console.log(`\nquerying PubMed for ${thin.length} pages with a binomial and thin coverage`);
  let n = 0;
  for (const p of thin) {
    n += 1;
    const term = `"${p.binomial}"[Title/Abstract] AND english[Language]`;
    const hit = await esearch(term, { retmax: PER_PAGE });
    stats.fetched += 1;
    if (!hit.ids.length) continue;
    const recs = await esummary(hit.ids);
    const key = `${p.kind}/${p.slug}`;
    result[key].citations = dedupe([
      ...result[key].citations,
      ...recs.map((r) => ({ ...r, tier: tierOf(r.pubtypes), source: 'pubmed-live' })),
    ]);
    stats.fromPubmed += 1;
    if (n % 25 === 0) console.log(`  ${n}/${thin.length} ${p.slug}`);
  }
}

for (const key of Object.keys(result)) {
  result[key].citations = result[key].citations.slice(0, PER_PAGE);
  if (result[key].citations.length) stats.withCitations += 1;
}

const tierTally = {};
for (const v of Object.values(result)) for (const c of v.citations) tierTally[c.tier] = (tierTally[c.tier] ?? 0) + 1;

console.log(`\npages considered        ${stats.pages}`);
console.log(`pages with citations    ${stats.withCitations}`);
console.log(`  matched in local DB   ${stats.fromDb}`);
console.log(`  recovered from claims ${stats.fromClaims}`);
console.log(`  topped up from PubMed ${stats.fromPubmed} (${stats.fetched} queries)`);
console.log(`citations by tier       ${JSON.stringify(tierTally)}`);
console.log(`distinct PMIDs          ${new Set(Object.values(result).flatMap((v) => v.citations.map((c) => c.pmid))).size}`);

if (DRY) { console.log('\nDry run: nothing written.'); process.exit(0); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), pages: result }, null, 1));
console.log(`\nwrote ${OUT}`);
