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
import { walk, parseFrontmatter, dropMineralPlaceholder } from './lib.mjs';

const WRITE = process.argv.includes('--write');
const MARKER = /Primary component:\*{0,2}\s*Mineral-derived preparation/i;


/**
 * Drop any heading with nothing inside it: no prose, no subheading.
 *
 * Deliberately conservative about what counts as inside. A heading followed by a DEEPER heading
 * still has content, because the subsection belongs to it; a heading followed by one at the same or
 * a higher level has nothing of its own.
 */
function dropEmptySections(src) {
  const lines = src.split('\n');
  const drop = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(#{2,6})\s+(.+)$/.exec(lines[i]);
    if (!m) continue;
    const level = m[1].length;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j += 1;
    if (j >= lines.length) { drop.add(i); continue; }
    const next = /^(#{1,6})\s/.exec(lines[j]);
    if (next && next[1].length <= level) drop.add(i);
  }
  if (!drop.size) return src;
  return lines.filter((_, i) => !drop.has(i)).join('\n').replace(/\n{3,}/g, '\n\n');
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

  let next = dropMineralPlaceholder(body, {
    subcategory: data.subcategory ?? '',
    group: data.group ?? '',
  });

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
  next = dropEmptySections(next);

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
