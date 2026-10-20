#!/usr/bin/env node
/**
 * Two pieces of vault residue out of content/.
 *
 * NESTED WIKILINKS. The vault's auto-linker wrote links inside links, and resolving the inner one
 * first published "Gokshuradi [Guggulu](/formulation/guggulu/)|Gokshuradi Guggulu". The outer
 * target is the words around the inner link, and the text after the pipe is its label, so a
 * candidate is accepted only when the two agree. The result links to the outer target when it is
 * a published page other than the one it is on, and is plain text otherwise. Ingest now flattens these before resolving
 * (lib.mjs flattenNestedWikilinks), so this repairs what was already written.
 *
 * REGULATOR LABELS. The device notes type "India Cdsco", "Us Fda" and "Eu Mdr". Ingest now
 * rewrites them (lib.mjs fixRegulatorLabels); this applies the same mapping to content/.
 *
 *   node scripts/fix-vault-residue.mjs            report what would change
 *   node scripts/fix-vault-residue.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk, slugify, fixRegulatorLabels } from './lib.mjs';

const WRITE = process.argv.includes('--write');
const files = walk('content').filter((f) => f.endsWith('.md')).map((f) => path.join('content', f));
const published = new Map();
for (const f of files) {
  const [kind, slug] = path.relative('content', f).replace(/\.md$/, '').split('/');
  if (slug && !published.has(slug)) published.set(slug, `/${kind}/${slug}/`);
}

const LINK_PIPE = /\[([^\]]+)\]\(([^)]+)\)((?:[^\[\]|\n]*[^\s\[\]|])?)\|(?=\S)/;
let fixed = 0;
let labels = 0;
const unresolved = [];

/** The first `n` characters of `raw` as a reader sees them (links count as their text). */
function readPlain(raw, n) {
  let plain = '';
  let i = 0;
  while (i < raw.length && plain.length < n) {
    const link = /^\[([^\]]+)\]\([^)]+\)/.exec(raw.slice(i));
    if (link) { plain += link[1]; i += link[0].length; } else { plain += raw[i]; i += 1; }
  }
  return { plain, used: i };
}

/** One nested-link residue in `line` repaired; null if there is none; {failed} if unsure. */
function repairOnce(line, self) {
  const m = LINK_PIPE.exec(line);
  if (!m) return null;
  const [all, linkText, , suffix] = m;
  const head = line.slice(0, m.index);
  const tail = line.slice(m.index + all.length);
  // The outer target is the link text, its suffix, and up to three words of what precedes it
  // (spaced words, or one joined with a hyphen as in "Rakta-[Chandana]").
  const run = /[\w' -]*$/.exec(head)[0];
  const starts = [run.length];
  for (let j = run.length - 1; j >= 0; j -= 1) if (j === 0 || run[j - 1] === ' ') starts.push(j);
  for (const j of starts.slice(0, 4)) {
    const pre = run.slice(j);
    if (pre && !/^[\w'-]/.test(pre)) continue;
    const target = `${pre}${linkText}${suffix}`;
    const { plain, used } = readPlain(tail, target.length);
    if (plain.toLowerCase() !== target.toLowerCase() || /^[\w']/.test(tail.slice(used))) continue;
    const found = published.get(slugify(target));
    const url = found === self ? null : found;
    const keep = head.slice(0, head.length - pre.length);
    return { line: keep + (url ? `[${plain}](${url})` : plain) + tail.slice(used) };
  }
  return { failed: all };
}

for (const f of files) {
  const [kind, slug] = path.relative('content', f).replace(/\.md$/, '').split('/');
  const self = `/${kind}/${slug}/`;
  const before = fs.readFileSync(f, 'utf8');
  const lines = before.split('\n').map((line) => {
    let cur = line;
    for (let guard = 0; guard < 20; guard += 1) {
      const r = repairOnce(cur, self);
      if (!r) break;
      if (r.failed) { unresolved.push(`${f}: ${cur.slice(0, 160)}`); break; }
      cur = r.line;
      fixed += 1;
    }
    return cur;
  });
  let text = lines.join('\n');
  labels += (text.match(/\*\*(India Cdsco|Us Fda|Eu Mdr):\*\*/g) ?? []).length;
  text = fixRegulatorLabels(text);
  if (text !== before) {
    if (!WRITE) console.log(`would change ${f}`);
    else fs.writeFileSync(f, text);
  }
}
console.log(`nested links repaired: ${fixed}; regulator labels: ${labels}; unresolved: ${unresolved.length}`);
for (const u of unresolved) console.log('  unresolved', u);
