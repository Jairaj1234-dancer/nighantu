#!/usr/bin/env node
/**
 * Consolidate four pairs of pages that are the same formulation spelled two ways.
 *
 * src/data/duplicates.json already handles 29 such pairs: the alias keeps its URL and its
 * content and declares the primary as its canonical, so a retrieval index consolidates the two
 * instead of picking one arbitrarily. These four were never registered, and they were found by
 * noticing that every dose correction had to be made twice:
 *
 *   hingvashtak-churna / hingwashtak-churna          AFI 7:37  HINGVASTAKA CURNA
 *   kalyanaka-ghrita / kalyanaka-ghritam             AFI 6:7   KALYANAKA GHRTA
 *   karpas-asthyadi-thailam / karpasasthyadi-thailam AFI 8:6   KARPASASTHYADI TAILA
 *   kumkumadi-tailam / kumkumadi-thailam             AFI 8:8   KUNKUMADI TAILA
 *
 * WHICH ONE IS PRIMARY, decided on an objective criterion rather than on taste: the spelling the
 * Ayurvedic Formulary of India itself prints. That gives hingvashtak (v, not w), kalyanaka-ghrita
 * (ghrta, not ghritam), karpasasthyadi (one word) and kumkumadi-tailam (taila, not thaila). For a
 * site whose value is that its claims are checkable, the canonical URL should carry the
 * transliteration the source uses.
 *
 * THE PROBLEM WITH DOING ONLY THAT. In two of the four pairs the AFI spelling is the THINNER
 * page: hingvashtak-churna has 411 words against hingwashtak-churna's 679, and kalyanaka-ghrita
 * 390 against kalyanaka-ghritam's 650. Declaring the thin page primary would consolidate the
 * signal onto the weaker document, which is a loss dressed up as a fix.
 *
 * The two versions turn out to be complementary rather than redundant. The thin pages carry
 * "Ayurvedic pharmacology (Dravyaguna)" and nothing else; the fuller ones drop Dravyaguna and add
 * "Where is it described in the classical texts?", "How does it work?", "Which traditional uses
 * are supported by research?", "What do recent clinical trials show?" and "Recent safety
 * updates". So the primary gets the union: its own Dravyaguna section plus the five sections only
 * the other page had. Nothing is deleted from either page and no URL stops working.
 *
 * The transplanted prose names the drug by the alias spelling, so occurrences are rewritten to
 * the primary's spelling. Links in that prose are left exactly as they are: they are internal
 * links to other monographs and to the alias's own URL, which still resolves.
 *
 *   node scripts/merge-duplicate-pairs.mjs            # dry run
 *   node scripts/merge-duplicate-pairs.mjs --write
 */
import fs from 'node:fs';
import path from 'node:path';

const CONTENT = path.join('content', 'formulation');
const DUPES = path.join('src', 'data', 'duplicates.json');
const WRITE = process.argv.includes('--write');
const TODAY = new Date().toLocaleDateString('en-CA');

/** primary, alias, and the AFI heading that decided which is which. */
const PAIRS = [
  { primary: 'hingvashtak-churna', alias: 'hingwashtak-churna', afi: 'HINGVASTAKA CURNA (7:37)', names: [['Hingwashtak', 'Hingvashtak']] },
  { primary: 'kalyanaka-ghrita', alias: 'kalyanaka-ghritam', afi: 'KALYANAKA GHRTA (6:7)', names: [['Kalyanaka Ghritam', 'Kalyanaka Ghrita']] },
  { primary: 'karpasasthyadi-thailam', alias: 'karpas-asthyadi-thailam', afi: 'KARPASASTHYADI TAILA (8:6)', names: [['Karpas Asthyadi', 'Karpasasthyadi']] },
  { primary: 'kumkumadi-tailam', alias: 'kumkumadi-thailam', afi: 'KUNKUMADI TAILA (8:8)', names: [['Kumkumadi Thailam', 'Kumkumadi Tailam']] },
];

const read = (slug) => fs.readFileSync(path.join(CONTENT, `${slug}.md`), 'utf8');

/** Split a monograph body into its `## ` sections, keeping the front matter separate. */
const split = (md) => {
  const fmEnd = md.indexOf('\n---', 4);
  const front = md.slice(0, fmEnd + 4);
  const body = md.slice(fmEnd + 4);
  const parts = body.split(/\n(?=## )/);
  const sections = new Map();
  const order = [];
  for (const p of parts) {
    const h = p.match(/^## (.+)$/m)?.[1]?.trim();
    if (!h) continue;
    sections.set(h, p.replace(/^\n+/, ''));
    order.push(h);
  }
  return { front, sections, order, lead: parts[0].startsWith('## ') ? '' : parts[0] };
};

const planned = [];

for (const pair of PAIRS) {
  const pMd = read(pair.primary);
  const aMd = read(pair.alias);
  const P = split(pMd);
  const A = split(aMd);

  const missing = A.order.filter((h) => !P.sections.has(h));
  if (!missing.length) {
    planned.push({ ...pair, missing: [], note: 'nothing to transplant; the primary already has every section the alias has' });
    continue;
  }

  /**
   * Insert each borrowed section where it sits in the alias, relative to sections the primary
   * also has, so the reading order stays the one an editor chose rather than an append pile.
   */
  const newOrder = [];
  for (const h of A.order) {
    if (P.sections.has(h)) { if (!newOrder.includes(h)) newOrder.push(h); continue; }
    newOrder.push(h);
  }
  // Any section unique to the primary keeps its place relative to its neighbours.
  for (const h of P.order) if (!newOrder.includes(h)) {
    const at = P.order.indexOf(h);
    const prev = P.order[at - 1];
    const i = prev ? newOrder.indexOf(prev) + 1 : 0;
    newOrder.splice(i, 0, h);
  }

  let rebuilt = `${P.front}\n${P.lead.trim() ? `${P.lead.trim()}\n\n` : ''}`;
  for (const h of newOrder) {
    let sec = P.sections.get(h) ?? A.sections.get(h);
    if (!P.sections.has(h)) {
      for (const [from, to] of pair.names) sec = sec.split(from).join(to);
    }
    rebuilt += `${sec.trimEnd()}\n\n`;
  }
  rebuilt = `${rebuilt.trimEnd()}\n`;

  planned.push({
    ...pair,
    missing,
    before: pMd.split(/\s+/).length,
    after: rebuilt.split(/\s+/).length,
    rebuilt,
  });
}

// ---- report --------------------------------------------------------------

console.log('pairs                 ', PAIRS.length);
for (const p of planned) {
  console.log(`\n  primary ${p.primary}`);
  console.log(`  alias   ${p.alias}`);
  console.log(`  chosen on the AFI's own spelling: ${p.afi}`);
  if (!p.missing.length) { console.log(`  ${p.note}`); continue; }
  console.log(`  transplanting ${p.missing.length} section(s) the primary lacked:`);
  for (const m of p.missing) console.log(`      ${m}`);
  console.log(`  words ${p.before} -> ${p.after}`);
}

if (!WRITE) {
  console.log('\nDry run. Pass --write to apply.');
  process.exit(0);
}

for (const p of planned) {
  if (p.rebuilt) fs.writeFileSync(path.join(CONTENT, `${p.primary}.md`), p.rebuilt);
}

const dupes = JSON.parse(fs.readFileSync(DUPES, 'utf8'));
dupes.aliases = dupes.aliases ?? {};
for (const p of PAIRS) {
  dupes.aliases[p.alias] = {
    primary: p.primary,
    why: `The same formulation spelled two ways. The primary carries the spelling the Ayurvedic `
      + `Formulary of India prints, ${p.afi}. Both pages keep their URL and their content; the `
      + `alias declares the primary as its canonical so the two stop competing.`,
    registeredOn: TODAY,
  };
}
dupes.count = Object.keys(dupes.aliases).length;
dupes.updatedAt = TODAY;
fs.writeFileSync(DUPES, `${JSON.stringify(dupes, null, 2)}\n`);

console.log(`\nwrote ${planned.filter((p) => p.rebuilt).length} page(s) and registered ${PAIRS.length} alias(es); ${dupes.count} aliases total`);
