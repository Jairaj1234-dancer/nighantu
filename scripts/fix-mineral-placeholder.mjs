#!/usr/bin/env node
/**
 * Strip the false Mineral/Elemental Profile block from committed pages.
 *
 * WHY A REPAIR AND NOT JUST AN INGEST FIX. lib.mjs now scopes dropMineralPlaceholder by the page's
 * folder rather than by whether it happens to have a binomial, which is what the original comment
 * was reaching for. But ingest only runs where ATLAS_VAULT is set, and the committed pages are the
 * published site, so the fix has to be applied to them directly.
 *
 * WHAT WAS WRONG. The vault writes a placeholder on entries it has no elemental data for:
 *
 *   ### Mineral/Elemental Profile
 *   - **Primary component:** Mineral-derived preparation
 *   - **Note:** Composition varies by specific preparation method
 *   **Analytical Methods:** XRD, ICP-OES, SEM-EDS
 *
 * On a bhasma that is true if uninformative. On anything else it is false, and the earlier pass
 * fixed only the pages that had a binomial. 139 kept it: 60 filed Single-Herbs whose identity was
 * never established, 76 Classical-Formulations, one Animal-Derived-Product. /herb/bandhuka, a
 * flower drug whose own markers are pelargonidin and kaempferol, was telling readers its primary
 * component is mineral and should be analysed by X-ray diffraction.
 *
 * REMOVED RATHER THAN REPLACED. /corrections/ states this project's rule: where something cannot be
 * verified either way, the disputed statement is removed rather than kept, and several fields are
 * blank for exactly that reason. An absent composition is honest about what is not known; a wrong
 * one is not. Nothing is written in its place.
 *
 *   node scripts/fix-mineral-placeholder.mjs            report what would change
 *   node scripts/fix-mineral-placeholder.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk, parseFrontmatter } from './lib.mjs';

const WRITE = process.argv.includes('--write');
const MARKER = /Primary component:\*{0,2}\s*Mineral-derived preparation/i;


/**
 * Remove the placeholder block and, in the same pass, the heading it emptied.
 *
 * TWO FAILED ATTEMPTS BEFORE THIS ONE, both caught by measurement rather than by reading.
 *
 * The first swept the whole document for headings whose next heading was at the same or a
 * shallower level. On the glossary pages that is true of a heading doing real work, because those
 * files nest INVERTED: "#### What is it made of?" (level 4) followed by "### Isoflavones"
 * (level 3). That h4 is the scope marker telling scripts/compounds.mjs which bullets are
 * constituents, so deleting it orphaned 224 compounds, 13 with resolved PubChem CIDs. The deploy's
 * enrich-regression guard caught it.
 *
 * The second compared the document before and after and located headings with indexOf on the
 * heading TEXT. content/glossary/concepts-a-m.md contains 48 identical "What is it made of?"
 * headings, so every lookup found the first one, and the comparison was meaningless: it started
 * stripping blocks from the mineral and rasa-shastra pages that are supposed to keep them.
 *
 * So this is one pass over the lines with no diffing and no text lookups. It finds the placeholder
 * block by position, removes it, and removes the heading immediately above only when that heading
 * is left with nothing before the next heading of any level. Position is the only identity used.
 */
const PLACEHOLDER_HEAD = /^#{2,6}\s+Mineral\/Elemental Profile\s*$/i;
const PLACEHOLDER_BODY = /Primary component:\*{0,2}\s*Mineral-derived preparation/i;

function stripPlaceholder(body) {
  const lines = body.split('\n');
  const kill = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    if (!PLACEHOLDER_HEAD.test(lines[i])) continue;
    // The block runs to the next heading of any level.
    let end = i + 1;
    while (end < lines.length && !/^#{1,6}\s/.test(lines[end])) end += 1;
    const block = lines.slice(i, end).join('\n');
    if (!PLACEHOLDER_BODY.test(block)) continue;   // a real elemental profile; leave it
    for (let k = i; k < end; k += 1) kill.add(k);

    // The heading immediately above, by position. Is anything else under it?
    let h = i - 1;
    while (h >= 0 && !/^#{1,6}\s/.test(lines[h])) {
      if (lines[h].trim()) { h = -1; break; }        // real content sits between: keep the heading
      h -= 1;
    }
    if (h < 0) continue;
    // Walk forward from that heading, skipping what we are about to delete, to the next heading.
    let j = h + 1;
    let survives = false;
    while (j < lines.length) {
      if (/^#{1,6}\s/.test(lines[j]) && !kill.has(j)) break;
      if (!kill.has(j) && lines[j].trim()) { survives = true; break; }
      j += 1;
    }
    if (!survives) kill.add(h);
  }

  if (!kill.size) return body;
  return lines.filter((_, i) => !kill.has(i)).join('\n').replace(/\n{3,}/g, '\n\n');
}

const changed = [];
const kept = [];

for (const rel of walk('content')) {
  const file = path.join('content', rel);
  const raw = fs.readFileSync(file, 'utf8');
  if (!MARKER.test(raw)) continue;

  const { data } = parseFrontmatter(raw);
  // The frontmatter block is left exactly as it is; only the body is rewritten.
  const split = raw.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!split) { kept.push([rel, 'frontmatter did not parse']); continue; }
  const [, front, body] = split;

  // The folder decides whether the block belongs at all; a mineral or rasa-shastra entry keeps it.
  const filedAsMineral = /Mineral|Metal|Rasa-Shastra|Salt|Bhasma|Pishti/i
    .test(`${data.subcategory ?? ''} ${data.group ?? ''}`);
  let next = filedAsMineral ? body : stripPlaceholder(body);

  /**
   * AND REMOVE THE PARENT HEADING IF IT IS NOW EMPTY.
   *
   * On most of these pages the "What is it made of?" section contained nothing BUT the mineral
   * placeholder, so stripping the block left a bare heading with no content under it. The first
   * run of this repair created 135 of those, and the check that should have caught it did not: the
   * measure counted a heading followed by its own subheading as empty, so it reported no change
   * where there were 135. A heading is only truly empty when the next heading is at the same or a
   * higher level, which is what this uses.
   *
   * An empty section is worse than no section: it tells a reader the page has something to say
   * about composition and then says nothing.
   */

  if (next === body) {
    kept.push([rel, `filed ${data.subcategory || '(none)'}, block is correct here`]);
    continue;
  }
  changed.push([rel, data.subcategory || '(none)']);
  if (WRITE) fs.writeFileSync(file, `${front}${next}`);
}

console.log(`${changed.length} pages would lose the placeholder:`);
const bySub = {};
for (const [, sub] of changed) bySub[sub] = (bySub[sub] ?? 0) + 1;
for (const [sub, n] of Object.entries(bySub).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(4)}  ${sub}`);
}
console.log(`\n${kept.length} pages KEEP it, because the folder says the substance really is mineral:`);
const byKeep = {};
for (const [, why] of kept) byKeep[why] = (byKeep[why] ?? 0) + 1;
for (const [why, n] of Object.entries(byKeep)) console.log(`   ${String(n).padStart(4)}  ${why}`);

if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
else console.log('\nWritten. Run `npm run build` and the gate sweep.');
