#!/usr/bin/env node
/**
 * The answer block ends where its bibliography begins. 60 pages did not know that.
 *
 * WHAT IS LIVE RIGHT NOW. /formulation/chyawanprash/ tells Google, verbatim:
 *
 *   Chyawanprash is a classical Ayurvedic avaleha, a semi-solid herbal confection. [Safety and
 *   Efficacy of Chyawanprash as a Prophylaxis Treatment for COVID-19: A Systematic Review and
 *   Meta-Analysis of Randomized Control Trials](https://pubmed.ncbi.nlm.nih.gov/39544586/). ...
 *
 * Raw markdown in the snippet, and a COVID prophylaxis claim in the snippet, on the page for the
 * product this company's sister business sells. 60 answer blocks carry a markdown link, 46 of them
 * inside the first 155 characters, which is the part Google displays.
 *
 * HOW IT PASSED EVERY GATE. Three failures lined up.
 *
 * 1. scripts/lib.mjs stripMarkup handles Obsidian wikilinks, bold, italic and code, and has no rule
 *    for a standard markdown link, so `[Title](url)` passes through untouched. answer.mjs calls it
 *    under the comment "Nothing resembling markup may reach the answer block". One missing line.
 * 2. answer.mjs lifts its traditional-use sentence from "Which traditional uses are supported by
 *    research?", which is the one section lib/claims.mjs fills with `[Title](url). *Journal*. PMID`.
 *    The composer asked the bibliography for a sentence about the drug.
 * 3. isDiseaseClaim is a conjunction of a disease word and an efficacy word, and a study title
 *    asserts by naming rather than predicating. "Antitumor Activity of the Ethanolic Extract from
 *    Syzygium aromaticum in Colorectal Cancer Xenograft Mice" has the disease word and no verb.
 *
 * AND I MADE IT WORSE ON PURPOSE. lib/answer-safety.mjs records that the first isLeakedStructure
 * matched any sentence opening with "[" and "flagged 61 legitimate markdown links", so I narrowed
 * it. Those links were not legitimate. The check had found this defect and I taught it not to.
 *
 * WHY TRUNCATION, AND NOT A CAREFUL REMOVAL. The first version of this script deleted each link
 * plus the journal and author-year fragments that followed it, matched against that page's own
 * records in src/data/citations.json so the deletions were grounded rather than guessed. Its dry
 * run showed why that is the wrong shape: it left `PMID ·`, the bare scaffolding either side of the
 * two links in `PMID [id](url) · [doi:x](url)`, and worse, it left the research finding that
 * follows a citation line in the body, so brahmi-vati would have kept "Bacosides enhance nerve
 * impulse transmission, promote repair of damaged neurons" as its meta description. A surgical
 * removal of the citation preserves exactly the material that had no business being lifted.
 *
 * The survey that settled it: all 60 answers have at least 60 characters of real sentence before
 * the first link, and exactly ONE has anything after it worth keeping, herb/rasamanikya's "Shodhana
 * significantly reduced arsenic content compared to raw orpiment" , which is already in that page's
 * body at line 42 with more detail around it. So truncation costs one duplicated sentence and
 * cannot leave scaffolding, a misattributed author list, or a lifted claim behind.
 *
 * NOTHING IS LOST. The citations render on the page from src/data/citations.json, which holds 88 of
 * the 90 linked papers. The 2 it does not, laung PMID 41599187 and rakta-chandana PMID 15866805,
 * are papers the per-page cap displaced on pages that already carry 12 citations each: absent from
 * the reference list by an existing editorial decision, not by this one.
 *
 * WHAT THIS DOES NOT FIX. 41 of the 60 are left with their identity sentence alone, around 80
 * characters, which is thin for a meta description. Thin and true beats long and wrong, and these
 * are mostly formulations, which have no `family` or names.json entry for the enrichment that
 * fix-generic-answers.mjs applied to 284 herb pages. Enriching them needs composition data and is
 * a separate pass with its own grounding.
 *
 *   node scripts/fix-answer-citations.mjs            report what would change
 *   node scripts/fix-answer-citations.mjs --write    apply it
 *   node scripts/fix-answer-citations.mjs --verbose  every page, not the first six
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk } from './lib.mjs';
import { answerViolations } from './lib/answer-safety.mjs';

const WRITE = process.argv.includes('--write');
const VERBOSE = process.argv.includes('--verbose');

/** A citation link, which is any inline markdown link to an http URL. */
const LINK = /\[[^\]]*\]\(\s*https?:\/\/[^)]*\)/;

/**
 * A link can also arrive BROKEN, and the gate is wider than this script was.
 *
 * herb/himsra reads "... from the Capparaceae family. (Capparaceae): A Scoping Review of
 * Phytochemistry, Ethnopharmacology and Pharmacological Activities](https://pubmed...)." The paper
 * is titled "Capparis spinosa L. (Capparaceae): A Scoping Review ...", the composer split it on the
 * period in "L.", and the half that survived lost its opening bracket. So LINK above, which needs
 * that bracket, did not match, while lib/answer-safety.mjs isMarkup did: the repair left behind the
 * one page its own gate then failed the build on.
 *
 * The cut point therefore comes from the markup, not from the bracket: the start of a well-formed
 * link where there is one, otherwise the sentence boundary before the wreckage.
 */
const MARKUP_AT = /\]\(\s*https?:/;

const CITES = JSON.parse(fs.readFileSync(path.join('src', 'data', 'citations.json'), 'utf8')).pages;

/**
 * An author list can also land BEFORE the first link, which truncation cannot reach.
 *
 * herb/chandana reads "... is referenced in WHO traditional medicine guidelines. aureus Moy RL,
 * Levenson C 2017. [Sandalwood Album Oil ...](url)." The composer split a findings line on the
 * period in "S. aureus" and carried half of it plus an author credit into the answer.
 *
 * The author forms are built from that page's own citation records and matched as exact strings
 * anchored to a sentence boundary, never as a pattern. Anchoring is what makes it safe: an
 * unanchored substring test flagged the journal "Ayu" inside the word "Ayurvedic" on two pages.
 * lib/claims.mjs prints at most three names before "and others", so both shapes are generated.
 */
function authorSentences(key) {
  const out = new Set();
  for (const c of CITES[key]?.citations ?? []) {
    const names = (c.authors ?? [])
      .map((x) => (typeof x === 'string' ? x : `${x.last ?? ''} ${x.initials ?? ''}`.trim()));
    if (!names.length || !c.year) continue;
    for (const n of [1, 2, 3]) {
      if (names.length < n) break;
      const head = names.slice(0, n).join(', ');
      if (names.length > n) out.add(`${head} and others ${c.year}.`);
      if (names.length === n) out.add(`${head} ${c.year}.`);
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}

/**
 * A sentence that opens in lower case and runs to three words or fewer is wreckage, not prose.
 * It is what the removal above leaves behind when the fragment it deleted was itself half of a
 * mis-split sentence: "aureus." on chandana. Real sentences on these pages start with a capital.
 */
const isOrphan = (s) => /^[a-z]/.test(s.trim()) && s.trim().split(/\s+/).length <= 3;

const changed = [];
const refused = [];

for (const rel of walk('content')) {
  const file = path.join('content', rel);
  const raw = fs.readFileSync(file, 'utf8');
  const m = /^answer:\s*"(.*?)"\s*$/m.exec(raw);
  if (!m) continue;

  const markupAt = m[1].search(MARKUP_AT);
  if (markupAt === -1) continue;
  const linkAt = m[1].search(LINK);
  // A well-formed link is cut at its bracket; a broken one at the sentence boundary before it,
  // which keeps the last complete sentence and discards only the fragment.
  const at = linkAt !== -1 && linkAt <= markupAt
    ? linkAt
    : m[1].lastIndexOf('. ', markupAt) + 2;
  if (at <= 0) continue;

  const key = `${rel.split(path.sep)[0]}/${path.basename(rel, '.md')}`;

  // Everything before the first citation link.
  let next = m[1].slice(0, at);

  // Then any author credit stranded inside that head, and only then the wreckage it leaves.
  // The orphan sweep is deliberately conditional: splitting on sentence boundaries is unsafe in
  // this corpus ("Taxus wallichiana Zucc.", "(syn. Senna occidentalis)"), so it runs only where a
  // removal actually fired and there is therefore known wreckage to clear.
  let credits = 0;
  for (const s of authorSentences(key)) {
    const i = next.indexOf(` ${s}`);
    if (i === -1) continue;
    next = next.slice(0, i) + next.slice(i + 1 + s.length);
    credits += 1;
  }
  if (credits) {
    next = next
      .split(/(?<=[.!?])\s+/)
      .filter((s) => !isOrphan(s))
      .join(' ');
  }

  next = next.replace(/\s+/g, ' ').trim().replace(/[\s,;:]+$/, '');
  if (next && !/[.!?]$/.test(next)) next += '.';

  /**
   * REFUSE RATHER THAN PUBLISH A FAULT. Each case has its own reason: surviving markup means the
   * cut did not land where it looked; a violation means the head was already carrying a claim and
   * needs composing rather than trimming; too short means the answer was nothing but bibliography,
   * which is a page to compose from data, not a string to edit.
   */
  if (LINK.test(next) || next.includes('](')) { refused.push([key, 'markup survived the cut']); continue; }
  if (next.includes('"')) { refused.push([key, 'quote would break frontmatter']); continue; }
  if (next.length < 40) { refused.push([key, `only ${next.length} characters precede the bibliography`]); continue; }
  const v = answerViolations(next);
  if (v.length) { refused.push([key, `violates after the cut: ${JSON.stringify(v)}`]); continue; }

  changed.push({ key, before: m[1], after: next, cut: m[1].length - next.length });
  if (WRITE) fs.writeFileSync(file, raw.replace(m[0], `answer: "${next}"`));
}

const lens = changed.map((c) => c.after.length).sort((a, b) => a - b);
const median = lens.length ? lens[Math.floor(lens.length / 2)] : 0;

console.log(`${changed.length} answers truncated at their bibliography, ${refused.length} refused.`);
console.log(`${changed.reduce((n, c) => n + c.cut, 0)} characters of bibliography removed;`
  + ` surviving answers are ${lens[0]} to ${lens[lens.length - 1]} characters, median ${median}.\n`);

for (const c of (VERBOSE ? changed : changed.slice(0, 6))) {
  console.log(`  ${c.key}`);
  console.log(`    was: ${c.before.slice(0, 190)}`);
  console.log(`    now: ${c.after}`);
  console.log();
}

if (refused.length) {
  console.log('REFUSED, nothing written for these:');
  for (const [k, why] of refused) console.log(`   ${k}  ${why}`);
}
if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
