#!/usr/bin/env node
/**
 * Build the phytochemical co-occurrence graph from the published corpus.
 *
 * The vault ships a precomputed version of this, and it is not usable here: its
 * weights were counted across the whole vault including the TCM, global-herbalism and
 * nutraceutical trees this site does not publish. Published as-is it would both leak
 * the shape of unpublished material and give numbers a reader could not reconcile
 * against anything on the site.
 *
 * So this recomputes from content/ alone. Every edge weight is then checkable: if the
 * graph says two compounds share four sources, a reader can open those four pages.
 * The graph is derived rather than asserted, which is why it needs no verification
 * pass in the way a safety claim or an ingredient proportion does.
 *
 *   node scripts/compounds.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, stripMarkup, slugify } from './lib.mjs';

const DRY = process.argv.includes('--dry-run');

/**
 * Lines that are prose, not constituents.
 *
 * The first cut of this filter let sentences through and they dominated the result:
 * "Note: Composition varies by specific preparation method" appeared as the single
 * most common "compound", on 382 pages, followed by "Primary component:
 * Mineral-derived preparation". Both are boilerplate the vault writes when it has
 * nothing specific to say, and a graph whose top nodes are boilerplate is worse than
 * no graph.
 *
 * The structural tells are reliable: a chemical name is a short noun phrase. It does
 * not contain a colon, does not run past four words, and does not read as a sentence.
 */
const PROSE_LEAD = /^(note|primary|derived|standardi[sz]ed|composition|contains?|varies|see|refer|typical|approx|based|depends|specific|various|multiple|several|mixture|blend|combination|proprietary|processed|prepared|according)\b/i;

const NOT_A_COMPOUND = [
  /^analytical methods/i, /^total\b/i, /^loss on drying/i, /^ash\b/i, /^moisture/i,
  /^assay/i, /^extractive/i, /^heavy metal/i, /^microbial/i, /^pesticide/i,
  /^varies\b/i, /^not\b/i, /^none\b/i, /^other\b/i, /^etc\b/i, /^and\b/i,
  /^complex$/i, /^compounds?$/i, /^constituents?$/i, /^unknown/i,
  PROSE_LEAD,
];

/** A chemical name, structurally: short, no colon, not a sentence. */
function looksLikeCompound(name) {
  if (name.includes(':')) return false;
  if (/[.!?]$/.test(name)) return false;
  const words = name.split(/\s+/);
  if (words.length > 4) return false;
  // A phrase of only common English words is prose, however short.
  const COMMON = /^(the|a|an|of|in|from|with|and|or|to|by|for|its|this|that|these|those|is|are|was|were|be|been|as|at|on)$/i;
  if (words.every((w) => COMMON.test(w))) return false;
  return true;
}

const clean = (s) => stripMarkup(s)
  .replace(/\(.*?\)/g, ' ')
  .replace(/\s+/g, ' ')
  .replace(/[.,;:]+$/, '')
  .trim();

/** Compound names vary in case and hyphenation across pages; key on a normalised form. */
const keyOf = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

const pages = [];
for (const kind of fs.readdirSync('content')) {
  const dir = path.join('content', kind);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const { data, body } = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));

    const sec = /##\s*What is it made of\?([\s\S]*?)(?=\n##\s|\n*$)/.exec(body);
    if (!sec) continue;

    const compounds = new Map();
    for (const line of sec[1].split('\n')) {
      const m = /^\s*[-*]\s+(.+)$/.exec(line);
      if (!m) continue;
      const name = clean(m[1]);
      if (!name || name.length < 3 || name.length > 60) continue;
      if (NOT_A_COMPOUND.some((p) => p.test(name))) continue;
      if (!looksLikeCompound(name)) continue;
      if (/^\d/.test(name) && !/[a-z]/i.test(name)) continue;
      compounds.set(keyOf(name), name);
    }
    if (compounds.size) {
      pages.push({ kind, slug: data.slug || f.replace(/\.md$/, ''), title: data.title || '',
        botanical: data.botanical || '', compounds });
    }
  }
}

// node -> the pages it appears in
const nodes = new Map();
for (const p of pages) {
  for (const [k, display] of p.compounds) {
    let n = nodes.get(k);
    if (!n) { n = { key: k, name: display, slug: slugify(display), sources: [] }; nodes.set(k, n); }
    // Keep the longest spelling seen: "Curcuminoids complex" beats "Curcuminoids".
    if (display.length > n.name.length) n.name = display;
    n.sources.push({ kind: p.kind, slug: p.slug, title: p.title });
  }
}

// edges: co-occurrence within a page, weighted by how many pages two compounds share
const edges = new Map();
for (const p of pages) {
  const keys = [...p.compounds.keys()].sort();
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const id = `${keys[i]}|${keys[j]}`;
      edges.set(id, (edges.get(id) ?? 0) + 1);
    }
  }
}

for (const n of nodes.values()) {
  n.count = n.sources.length;
  n.sharedWith = [];
}
for (const [id, weight] of edges) {
  const [a, b] = id.split('|');
  const na = nodes.get(a); const nb = nodes.get(b);
  if (!na || !nb) continue;
  na.sharedWith.push({ key: b, name: nb.name, slug: nb.slug, weight });
  nb.sharedWith.push({ key: a, name: na.name, slug: na.slug, weight });
}
for (const n of nodes.values()) {
  n.sharedWith.sort((x, y) => y.weight - x.weight || x.name.localeCompare(y.name));
  n.sharedWith = n.sharedWith.slice(0, 25);   // the long tail is all weight 1
  n.sources.sort((x, y) => x.title.localeCompare(y.title));
}

// A compound appearing on exactly one page has no co-occurrence signal and would be a
// dead-end page, so it stays in the dataset and does not get its own URL.
const all = [...nodes.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
const linkable = all.filter((n) => n.count >= 2);

const summary = {
  compounds: all.length,
  linkable: linkable.length,
  pagesScanned: pages.length,
  edges: edges.size,
  maxSources: all[0]?.count ?? 0,
  topCompounds: all.slice(0, 15).map((n) => ({ name: n.name, sources: n.count })),
};

console.log(`pages scanned   ${summary.pagesScanned}`);
console.log(`compounds       ${summary.compounds}`);
console.log(`with 2+ sources ${summary.linkable}`);
console.log(`co-occurrences  ${summary.edges}`);
console.log(`top             ${summary.topCompounds.slice(0, 6).map((c) => `${c.name} (${c.sources})`).join(', ')}`);

if (DRY) { console.log('\nDry run: nothing written.'); process.exit(0); }

const payload = { updatedAt: new Date().toISOString().slice(0, 10), summary, compounds: all };
fs.mkdirSync(path.join('src', 'data'), { recursive: true });
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync(path.join('src', 'data', 'compounds.json'), JSON.stringify(payload, null, 1));
fs.writeFileSync(path.join('public', 'compounds.json'), JSON.stringify({
  name: 'Age Ayurveda Nighantu phytochemical co-occurrence graph',
  description: 'Which phytochemical constituents are reported in which Ayurvedic dravyas and '
    + 'formulations in this reference, and which constituents co-occur, weighted by the number '
    + 'of entries they share. Computed from the published pages, so every weight is checkable.',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  ...payload,
}, null, 1));

const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
fs.writeFileSync(path.join('public', 'compounds.csv'), `${[
  'compound,sources,appears_in,co_occurs_with',
  ...all.map((n) => [n.name, n.count, n.sources.map((s) => s.title).join('; '),
    n.sharedWith.map((s) => `${s.name} (${s.weight})`).join('; ')].map(esc).join(',')),
].join('\n')}\n`);

console.log('\nwrote src/data/compounds.json, public/compounds.json, public/compounds.csv');
