#!/usr/bin/env node
/**
 * Turn approved procedure pages into content files.
 *
 * Only pages the grounding auditor approved reach here. It rejected 12 of 55, and the
 * rejections are the reason to trust the 43: it caught a vaidya-only procedure written
 * as an executable protocol, two pages that terminated mid-sentence, a dravya attributed
 * to a classical chapter that does not contain it, and an incorrect claim about the
 * structure of Caraka's own text.
 *
 *   node scripts/apply-procedures.mjs <workflow-output.json> [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ungroundedNumbers, unknownDravyas } from './lib/grounding.mjs';
import { parseFrontmatter } from './lib.mjs';
import { BASE } from './config.mjs';

const [, , inFile] = process.argv;
const DRY = process.argv.includes('--dry-run');
if (!inFile || !fs.existsSync(inFile)) {
  console.error('usage: node scripts/apply-procedures.mjs <workflow-output.json>');
  process.exit(1);
}
const run = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const pages = run.approved ?? [];
console.log(`approved by the auditor: ${pages.length}`);

/**
 * Every drug name on the site, for the deterministic dravya check.
 *
 * Formulations count, not just herbs. A procedure legitimately names medicated oils such
 * as Aṇu Taila, which are formulations rather than single drugs, and treating those as
 * invented would reject correct pages. The first run of this check did exactly that and
 * held 37 of 43 pages, almost all of them wrongly.
 */
const known = new Set();
for (const kind of ['herb', 'formulation']) {
  const dir = path.join('content', kind);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const { data } = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (data.title) known.add(String(data.title).toLowerCase());
    if (data.sanskrit) known.add(String(data.sanskrit).toLowerCase());
    for (const a of data.aliases ?? []) known.add(String(a).toLowerCase());
  }
}
console.log(`known drug names on the site: ${known.size}`);

const OUT = path.join('content', 'practice');
const yaml = (s) => `"${String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

let written = 0;
const rejected = [];
const noPage = [];

for (const p of pages) {
  // The auditor is a model. These two checks are not, and they run on everything it
  // passed: a number the record never contained, or a plant that exists nowhere in the
  // corpus, is a hallucination regardless of how well the prose reads.
  const recordText = (p.grounding ?? []).map((g) => `${g.claim} ${g.evidence ?? ''}`).join(' ');
  const badNumbers = ungroundedNumbers(p.body, recordText + ' ' + (p.answer ?? ''));
  const badDravyas = unknownDravyas(p.dravyasNamed ?? [], known);

  // Only an invented NUMBER blocks. A dravya the corpus does not carry is a different
  // thing entirely: Snuhī is a real drug that simply has no page here yet, and rejecting
  // the page for naming it would be confusing corpus coverage with hallucination. Those
  // are recorded so the renderer knows not to attempt a cross-link, and so the gap is
  // visible as a gap.
  if (badNumbers.length) {
    rejected.push({ slug: p.slug, badNumbers, badDravyas });
    console.log(`  HOLD ${p.slug}: ungrounded numbers ${badNumbers.join(', ')}`);
    continue;
  }
  if (badDravyas.length) {
    noPage.push({ slug: p.slug, dravyas: badDravyas });
  }

  // Agents write cross-links as bare slugs ("[Marma-Cikitsā](/marma-cikitsa)") because
  // they are thinking in page names, not URLs. Rewrite the ones that point at a sibling
  // practice page, and strip the link from the ones that point nowhere: a dead link is
  // worse than plain text, and linkcheck fails the build on it either way.
  const siblingSlugs = new Set(pages.map((x) => x.slug));
  const body = p.body.replace(/\[([^\]]+)\]\(\/([a-z0-9-]+)\)/g, (whole, label, target) => {
    // Base-prefixed, because a link written inside a content body is emitted verbatim;
    // Astro only applies the base to links it generates itself. Ingested content carries
    // the same prefix for the same reason.
    if (siblingSlugs.has(target)) return `[${label}](${BASE}/practice/${target}/)`;
    return label;
  });

  const fm = [
    '---',
    `title: ${yaml(p.title)}`,
    `slug: ${yaml(p.slug)}`,
    'kind: "practice"',
    `level: ${yaml(p.level)}`,
    `sanskrit: ${yaml(p.sanskrit ?? '')}`,
    `answer: ${yaml(p.answer)}`,
    `classicalSource: ${yaml(p.classicalSource ?? '')}`,
    `citationVerified: ${p.citationVerified ? 'true' : 'false'}`,
    `citationNote: ${yaml(p.citationNote ?? '')}`,
    `dravyas: [${(p.dravyasNamed ?? []).filter((d) => !badDravyas.includes(d)).map(yaml).join(', ')}]`,
    `dravyasWithoutPages: [${badDravyas.map(yaml).join(', ')}]`,
    `cautions: [${(p.cautions ?? []).map(yaml).join(', ')}]`,
    ...(p.faq?.length
      ? ['faq:', ...p.faq.flatMap((f) => [`  - q: ${yaml(f.q)}`, `    a: ${yaml(f.a)}`])]
      : []),
    '---',
    '',
    body.trim(),
    '',
  ].join('\n');

  if (!DRY) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `${p.slug}.md`), fm);
  }
  written += 1;
}

const byLevel = {};
for (const p of pages) byLevel[p.level] = (byLevel[p.level] ?? 0) + 1;

console.log(`\nwritten            ${written}`);
console.log(`held: ungrounded numbers            ${rejected.length}`);
console.log(`pages naming a drug we lack        ${noPage.length}`);
console.log(`by level           ${JSON.stringify(byLevel)}`);
console.log(`citations verified ${pages.filter((p) => p.citationVerified).length} of ${pages.length}`);

if (!DRY) {
  fs.mkdirSync(path.join('data', 'runs'), { recursive: true });
  fs.writeFileSync(path.join('data', 'runs', 'procedures-run.json'), JSON.stringify({
    run: 'procedure-pages', date: new Date().toISOString().slice(0, 10),
    summary: { ...run.summary, heldByDeterministicChecks: rejected.length, published: written },
    heldByAuditor: run.held ?? [],
    heldByChecks: rejected,
    dravyasWithoutPages: noPage,
  }, null, 1));
  console.log('\nwrote content/practice/ and data/runs/procedures-run.json');
}
