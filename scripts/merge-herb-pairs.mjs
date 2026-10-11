#!/usr/bin/env node
/**
 * Consolidate four herb pairs where the alias page carries the substance and the primary is a stub.
 *
 * data/duplicates.json registers 29 pages that are the same drug under a different name. Each keeps
 * its URL and its content, and `primary` records which NAME this reference leads with: the
 * pharmacopoeial or classical one. On 14 of the 29 the alias is the longer page, which is not a
 * defect on its own, because primary is about the name and not about page quality.
 *
 * On four of them it is a defect, because the asymmetry is large and lopsided in what it contains:
 *
 *   karvellaka   266 w, 3 sections   vs karela      1810 w, 6 sections, and the WHO status
 *   lavanga      318 w, 3 sections   vs laung        895 w, 8 sections, and the WHO status
 *   manjishtha   313 w, 3 sections   vs manjistha    831 w, 5 sections, and the WHO status
 *   jambu        302 w, 3 sections   vs jamun        781 w, 4 sections
 *
 * The page named for the pharmacopoeial name was a stub with no pharmacopoeial status, while the
 * Hindi-named page held the monograph. Both are indexed, so a reader could land on either.
 *
 * THE SHAPE OF THE FIX IS THE UNION, copied from scripts/merge-duplicate-pairs.mjs, which did this
 * for four formulation pairs. The two versions are complementary rather than redundant: the thin
 * primary carries "Ayurvedic pharmacology (Dravyaguna)" or "What is it made of?" and nothing else,
 * and the fuller alias carries mechanism, research, trials and safety. So the primary gains the
 * sections only the alias had, in the order the alias had them, and keeps its own. Nothing is
 * deleted from either page and no URL stops working.
 *
 * NO NAME REWRITING, WHICH IS WHERE THIS DIFFERS FROM THE FORMULATION MERGES. That script rewrote
 * the alias spelling to the primary's in transplanted prose, because its pairs were transliteration
 * variants of one word, Hingwashtak against Hingvashtak, and the prose was the site's own.
 *
 * Here the alias names are different languages, and every occurrence of one inside a section being
 * transplanted turns out to sit in SOURCE TEXT: a published paper's title, its keyword list, its
 * journal line, or a quoted abstract. "Astounding Health Benefits of Jamun" is the name of a real
 * paper; "Modulatory Effects of Triphala and Manjistha Dietary Supplementation" is another.
 * Rewriting those would misquote the literature this site exists to cite. So the names are left
 * exactly as the sources print them, and the check below refuses the merge if an occurrence shows
 * up anywhere OTHER than a citation line, because there it would read as the page contradicting
 * its own title.
 *
 *   node scripts/merge-herb-pairs.mjs            # dry run
 *   node scripts/merge-herb-pairs.mjs --write
 */
import fs from 'node:fs';
import path from 'node:path';

const CONTENT = path.join('content', 'herb');
const WRITE = process.argv.includes('--write');

/**
 * primary, alias, the alias name to look for in transplanted prose, and whether the two names are
 * the SAME WORD transliterated two ways.
 *
 * That last flag decides what may happen when the alias name turns up in the site's own prose
 * rather than in a quoted source. manjistha and manjishtha are one Sanskrit word spelled two ways,
 * so rewriting it to the primary's spelling is a spelling fix. jamun and jambu are a Hindi name and
 * a Sanskrit name for the same plant, karela and karvellaka likewise: rewriting one into the other
 * would be asserting that a sentence said something it did not, so those refuse instead.
 */
const PAIRS = [
  { primary: 'karvellaka', alias: 'karela', name: 'Karela', transliteration: false },
  { primary: 'lavanga', alias: 'laung', name: 'Laung', transliteration: false },
  { primary: 'manjishtha', alias: 'manjistha', name: 'Manjistha', transliteration: true },
  { primary: 'jambu', alias: 'jamun', name: 'Jamun', transliteration: false },
];

const read = (slug) => fs.readFileSync(path.join(CONTENT, `${slug}.md`), 'utf8');

/** Split a monograph into front matter, any lead prose, and its `## ` sections in order. */
const split = (md) => {
  const fmEnd = md.indexOf('\n---', 4);
  const front = md.slice(0, fmEnd + 4);
  const parts = md.slice(fmEnd + 4).split(/\n(?=## )/);
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

/**
 * A line that is quoting or describing a source, where a drug name belongs to the source and not
 * to this page: an abstract quote, a bibliographic field, a markdown link (every citation title is
 * one), a PMID or DOI line, or a numbered citation heading.
 */
const isCitationLine = (line) => /^\s*>/.test(line)
  || /\*\*(Authors|Journal|Keywords|PMID|DOI)/i.test(line)
  || /\]\(https?:\/\//.test(line)
  || /\bPMID\b|\bdoi:/i.test(line)
  || /^\s*#{3,4}\s*\d+\./.test(line);

const planned = [];
const refused = [];

for (const pair of PAIRS) {
  const pMd = read(pair.primary);
  const P = split(pMd);
  const A = split(read(pair.alias));

  const missing = A.order.filter((h) => !P.sections.has(h));
  if (!missing.length) { planned.push({ ...pair, missing: [], note: 'primary already has every section the alias has' }); continue; }

  // Where does the alias name appear in what is being moved, and is it always source text?
  const stray = [];
  const rx = new RegExp(pair.name, 'i');
  for (const h of missing) {
    for (const line of A.sections.get(h).split('\n')) {
      if (!rx.test(line) || isCitationLine(line)) continue;
      stray.push(`${h}: ${line.trim().slice(0, 110)}`);
    }
  }
  if (stray.length && !pair.transliteration) {
    refused.push([`${pair.alias} -> ${pair.primary}`, `the alias name appears in non-citation prose, and the two names are different words so it cannot be rewritten:\n        ${stray.join('\n        ')}`]);
    continue;
  }
  /**
   * LINE BY LINE, AND ONLY OFF THE CITATION LINES. The same section holds both "Modulatory Effects
   * of Triphala and Manjistha Dietary Supplementation", which is a real paper's title and must keep
   * the spelling its authors used, and "4-week RCT with 2000 mg/day Manjistha showed...", which is
   * this site's own summary and should match the page it sits on. A whole-section replace would
   * misquote the first to fix the second.
   */
  const renameIn = (sec) => sec.split('\n')
    .map((line) => (isCitationLine(line) ? line
      : line.replace(new RegExp(pair.name, 'g'), pair.primary[0].toUpperCase() + pair.primary.slice(1))))
    .join('\n');
  const renamed = stray.length ? renameIn : (s) => s;

  /** Borrowed sections sit where the alias had them, so the reading order is one an editor chose. */
  const newOrder = [];
  for (const h of A.order) if (!newOrder.includes(h)) newOrder.push(h);
  for (const h of P.order) if (!newOrder.includes(h)) {
    const at = P.order.indexOf(h);
    const prev = P.order[at - 1];
    newOrder.splice(prev ? newOrder.indexOf(prev) + 1 : 0, 0, h);
  }

  /**
   * TWO FRONT MATTER FIELDS FOLLOW THE BODY, because leaving them would leave the fix half done.
   *
   * `whoStatus` was the sharpest part of the defect: karvellaka, lavanga and manjishtha are the
   * pharmacopoeially named pages and carried an EMPTY pharmacopoeial status, while the Hindi-named
   * alias held it. It is a fact about the drug and not about the page, it renders as
   * `pharmacopoeialStatus` in the JSON-LD and as a row in the markdown twin, and the alias already
   * publishes it, so copying it adds no claim this site was not already making. Only copied where
   * the primary's is empty; an existing one is never overwritten.
   *
   * `words` is stale the moment the body grows. Nothing reads it, which is exactly why it would
   * have sat there wrong indefinitely.
   */
  let front = P.front;
  const aWho = /^whoStatus:\s*"([^"]*)"/m.exec(read(pair.alias))?.[1] ?? '';
  const pWho = /^whoStatus:\s*"([^"]*)"/m.exec(front)?.[1] ?? '';
  let tookWho = '';
  if (aWho.trim() && !pWho.trim() && !aWho.includes('"')) {
    front = front.replace(/^whoStatus:\s*"[^"]*"/m, `whoStatus: "${aWho}"`);
    tookWho = aWho;
  }

  let rebuilt = `${front}\n${P.lead.trim() ? `${P.lead.trim()}\n\n` : ''}`;
  for (const h of newOrder) {
    // Only a transplanted section is ever rewritten; the primary's own prose is left untouched.
    const sec = P.sections.has(h) ? P.sections.get(h) : renamed(A.sections.get(h));
    rebuilt += `${sec.trimEnd()}\n\n`;
  }
  rebuilt = `${rebuilt.trimEnd()}\n`;

  const words = (s) => (s.match(/\S+/g) || []).length;
  // Refresh `words` from the body that now exists, not the one that used to.
  const bodyWords = words(rebuilt.slice(rebuilt.indexOf('\n---', 4) + 4));
  rebuilt = rebuilt.replace(/^words:\s*\d+/m, `words: ${bodyWords}`);
  planned.push({
    ...pair,
    missing,
    before: words(pMd),
    after: words(rebuilt),
    order: newOrder,
    tookWho,
    rebuilt,
  });
}

console.log(`${planned.filter((p) => p.rebuilt).length} pairs to merge, ${refused.length} refused.\n`);
for (const p of planned) {
  if (!p.rebuilt) { console.log(`  ${p.primary.padEnd(14)} ${p.note}`); continue; }
  console.log(`  ${p.alias} -> ${p.primary}   ${p.before} -> ${p.after} words`);
  console.log(`     gains:  ${p.missing.join(' | ')}`);
  if (p.tookWho) console.log(`     whoStatus copied from the alias: ${p.tookWho.slice(0, 92)}`);
  console.log(`     order:  ${p.order.join(' > ')}`);
  console.log();
  if (WRITE) fs.writeFileSync(path.join(CONTENT, `${p.primary}.md`), p.rebuilt);
}
if (refused.length) {
  console.log('REFUSED, nothing written for these:');
  for (const [k, why] of refused) console.log(`   ${k}  ${why}`);
}
console.log('\nThe alias pages are NOT modified: both URLs keep working and nothing is deleted.');
if (!WRITE) console.log('Dry run. Nothing written. Re-run with --write to apply.');
