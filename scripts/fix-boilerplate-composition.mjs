#!/usr/bin/env node
/**
 * 29 single-herb pages answer "What is it made of?" with a template that is false on every one.
 *
 * The entire section is byte-identical across them, with not one page-specific word in it:
 *
 *   ## What is it made of?
 *   ### Key Active Markers
 *   - Derived from constituent herbs (see individual herb profiles)
 *   - Standardized on primary bioactive markers
 *   **Analytical Methods:** HPLC fingerprinting, TLC (identity), LC-MS/MS (marker quantification)
 *
 * The first bullet is FALSE on these pages. Every one of them carries `subcategory: Single-Herbs`,
 * and most carry a binomial: isabgol is Plantago ovata husk, jyotishmati is Celastrus paniculatus,
 * menthol and camphor are single compounds. A single-herb drug is not derived from constituent
 * herbs, so each page contradicts its own front matter. The second bullet is vacuous and the
 * analytical methods line is true of any herbal assay and says nothing about this drug.
 *
 * So the section asks a question and answers it with nothing, while asserting something untrue. It
 * is replaced by one sentence that states the gap, which is what the formulation pages already do
 * for absent literature. Italic, so answer.mjs cannot lift it into a meta description: that filter
 * drops a line which is wholly emphasised.
 *
 * FORMULATION PAGES KEEP IT. 52 pages under `subcategory: Classical-Formulations` carry the same
 * text, and there it is true: a classical formulation IS derived from its constituent herbs, and
 * its page links them. Only the pages where the claim is false are touched.
 *
 * AND THE GLOSSARY FILES ARE EXCLUDED BY NAME, because this is the exact section that caused the
 * worst failure in this project's history. scripts/compounds.mjs reads "What is it made of?" to
 * extract compounds, and on 10 October a pass that deleted those headings in
 * content/glossary/concepts-a-m.md and concepts-m-y.md orphaned 224 compounds, 13 of them with
 * PubChem CIDs, and failed the deploy on compoundsResolved falling from 455 to 442. Those two files
 * nest INVERTED, h4 followed by h3, and they are not single-herb pages. They are not touched.
 *
 * WHY THIS IS SAFE FOR THE COMPOUND COUNT, verified rather than assumed. compounds.mjs takes bullet
 * lines from that section and filters them through looksLikeCompound and NOT_A_COMPOUND. The two
 * boilerplate bullets survive neither: src/data/compounds.json holds 849 compounds and 0 of them
 * cite any of these 29 pages as a source. A first check of mine suggested ashoka contributed 99,
 * which was a loose substring match against the whole JSON rather than a match on the source slug.
 * Counted properly, by slug and kind, it is 0 for every page in the list.
 *
 *   node scripts/fix-boilerplate-composition.mjs            report what would change
 *   node scripts/fix-boilerplate-composition.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');

const FALSE_CLAIM = 'Derived from constituent herbs';
const REPLACEMENT = '*The marker compounds for this drug are not recorded here yet.*';

/** The inverted-nesting glossary files, named so they can never be swept in by a pattern. */
const NEVER = new Set(['glossary/concepts-a-m', 'glossary/concepts-m-y']);

const changed = [];
const skipped = { 'formulation page, where the claim is true': 0, 'excluded by name': 0 };
const refused = [];

for (const kind of fs.readdirSync('content')) {
  const dir = path.join('content', kind);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const key = `${kind}/${f.replace(/\.md$/, '')}`;
    const file = path.join(dir, f);
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.includes(FALSE_CLAIM)) continue;

    if (NEVER.has(key)) { skipped['excluded by name'] += 1; continue; }
    const sub = (/^subcategory:\s*"([^"]*)"/m.exec(raw) ?? [, ''])[1];
    if (/Classical-Formulations/i.test(sub)) { skipped['formulation page, where the claim is true'] += 1; continue; }

    /**
     * Replace the whole `## What is it made of?` block, bounded by the next `## ` at the SAME
     * level. Matched positionally on the heading, not by heading text: content/glossary holds 48
     * identical "What is it made of?" headings, and an indexOf on heading text is precisely how the
     * October repair orphaned the compounds.
     */
    const lines = raw.split('\n');
    const start = lines.findIndex((l) => /^##\s*What is it made of\?\s*$/.test(l));
    if (start === -1) { refused.push([key, 'carries the claim but has no "## What is it made of?" heading']); continue; }
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) if (/^##\s/.test(lines[i]) && !/^###/.test(lines[i])) { end = i; break; }

    const block = lines.slice(start, end).join('\n');
    if (!block.includes(FALSE_CLAIM)) { refused.push([key, 'the false claim sits outside the composition section; not touching it blind']); continue; }
    // Anything in the block that is not the template would be lost, so refuse if there is any.
    const strayBullets = (block.match(/^\s*[-*]\s+(.+)$/gm) ?? [])
      .map((b) => b.replace(/^\s*[-*]\s+/, '').trim())
      .filter((b) => !/^Derived from constituent herbs|^Standardized on primary bioactive/.test(b));
    if (strayBullets.length) { refused.push([key, `the section has content beyond the template, which would be lost: ${strayBullets.slice(0, 2).join(' / ')}`]); continue; }

    const next = [...lines.slice(0, start), '## What is it made of?', '', REPLACEMENT, '', ...lines.slice(end)].join('\n');
    changed.push({ key, removed: block.split('\n').filter((l) => l.trim()).length });
    if (WRITE) fs.writeFileSync(file, next);
  }
}

console.log(`${changed.length} boilerplate composition sections replaced, ${refused.length} refused.\n`);
for (const c of changed) console.log(`  ${c.key.padEnd(26)} ${c.removed} template lines -> one honest sentence`);
console.log('\nnot touched:');
for (const [why, n] of Object.entries(skipped)) if (n) console.log(`   ${String(n).padStart(3)}  ${why}`);
if (refused.length) {
  console.log('\nREFUSED:');
  for (const [k, why] of refused) console.log(`   ${k}  ${why}`);
}
if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
