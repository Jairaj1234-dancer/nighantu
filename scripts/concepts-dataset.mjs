#!/usr/bin/env node
/**
 * Publish the concept corpus as a dataset.
 *
 * TWO FILES, TWO SHAPES, for two different questions, as with the lexicon.
 *
 * concepts.json keeps the record structure: a concept, how much weight it bears, what is contested
 * in it, what is not known, the terms it is built from, its classical citations, and the research
 * assessed for it. That is the shape for anyone reading about a concept.
 *
 * concepts.csv is ONE ROW PER ATTRIBUTED POSITION, which is the shape for the question this corpus
 * is actually worth downloading for: where does Ayurvedic theory disagree with itself, and who
 * says what. 147 questions carry 461 positions between them, and a row per question would put the
 * interesting column inside a blob. Grouping the rows by `question` gives the per-question view
 * back; splitting a joined cell to get the positions back does not work.
 *
 * WHAT IS NOT IN EITHER, AND WHY.
 *
 * The withheld quotations are already absent: src/data/concepts.json carries a reason in their
 * place and never the text, so there is nothing to strip here. That is the licence work done
 * upstream, where the clearance rules live.
 *
 * What this file has to be careful about is the opposite direction. These downloads are offered
 * under CC BY 4.0, which invites modification, and they publish this project's own prose in full.
 * Our prose quotes the sources it criticises: 249 research assessments discuss papers we do not
 * own, and some of them quote a sentence of one in order to say what it does not establish. Short
 * quotation for comment is not a derivative work and is not ours to sublicense either way, so the
 * licence note carves it out and the gate at the bottom checks the claim rather than asserting it.
 *
 *   node scripts/concepts-dataset.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry-run');
const SRC = path.join('src', 'data', 'concepts.json');
const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const records = data.records ?? [];

const SITE = 'https://nighantu.ageayurveda.com';

const entries = records.map((r) => ({
  slug: r.slug,
  page: `/concept/${r.slug}/`,
  title: r.title,
  domain: r.domain ?? null,
  domainGroup: r.domainGroup ?? null,
  evidenceState: r.evidenceState ?? null,
  summary: r.summary ?? null,
  contested: r.contested ?? [],
  notKnown: r.notKnown ?? [],
  components: (r.components ?? []).map((c) => ({
    term: c.term,
    gloss: c.gloss ?? null,
    lexiconEntry: c.lexicon ? `/lexicon/${c.lexicon}/` : null,
  })),
  classical: r.classical ?? [],
  modern: r.modern ?? [],
  openQuestions: r.openQuestions ?? [],
  citationsChecked: r.verifiedOn ?? null,
}));

const summary = {
  concepts: entries.length,
  contestedQuestions: entries.reduce((a, r) => a + r.contested.length, 0),
  attributedPositions: entries.reduce((a, r) => a + r.contested.reduce((b, c) => b + (c.positions ?? []).length, 0), 0),
  notKnownStatements: entries.reduce((a, r) => a + r.notKnown.length, 0),
  componentTerms: entries.reduce((a, r) => a + r.components.length, 0),
  componentTermsLinkedToLexicon: entries.reduce((a, r) => a + r.components.filter((c) => c.lexiconEntry).length, 0),
  classicalCitations: entries.reduce((a, r) => a + r.classical.length, 0),
  quotationsPublished: entries.reduce((a, r) => a + r.classical.filter((c) => c.quote || c.sanskrit || c.translation).length, 0),
  quotationsWithheld: entries.reduce((a, r) => a + r.classical.filter((c) => c.withheld).length, 0),
  researchPapersAssessed: entries.reduce((a, r) => a + r.modern.length, 0),
};

console.log('concepts                    ', summary.concepts);
console.log('contested questions         ', summary.contestedQuestions);
console.log('attributed positions        ', summary.attributedPositions);
console.log('stated as not known         ', summary.notKnownStatements);
console.log('component terms             ', summary.componentTerms, `(${summary.componentTermsLinkedToLexicon} linked to a lexicon entry)`);
console.log('classical citations         ', summary.classicalCitations);
console.log('quotations published        ', summary.quotationsPublished);
console.log('quotations withheld         ', summary.quotationsWithheld);
console.log('research papers assessed    ', summary.researchPapersAssessed);

/**
 * The gate behind the carve-out in the licence note.
 *
 * The claim is that where our prose quotes a paper, it quotes a span and does not reproduce the
 * thing. A claim in a licence note that nothing checks is a hope, so this measures every quoted
 * span in the three fields that can carry one and refuses to write if any of them runs long.
 *
 * SPAN_WORDS matches MODERN_SPAN_WORDS in the lexicon's clearance library, which is the rule the
 * export already applied. This is a second, independent reading of the same rule on the far side
 * of the export, which is the point: the export could be wrong, and then this file would be the
 * one that published the consequence.
 */
const SPAN_WORDS = 60;
const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
const QUOTED = /[“"]([^“”"]{40,})[”"]/g;

const overlong = [];
for (const e of entries) {
  for (const [i, m] of e.modern.entries()) {
    // A dedicated `quote` field is wholly a quotation and is measured whole.
    if (words(m.quote) > SPAN_WORDS) {
      overlong.push({ slug: e.slug, where: `modern[${i}].quote`, n: words(m.quote), text: String(m.quote) });
    }
    for (const field of ['establishes', 'quality']) {
      for (const hit of String(m[field] ?? '').matchAll(QUOTED)) {
        if (words(hit[1]) > SPAN_WORDS) {
          overlong.push({ slug: e.slug, where: `modern[${i}].${field}`, n: words(hit[1]), text: hit[1] });
        }
      }
    }
  }
}
if (overlong.length) {
  console.error(`\nREFUSING TO WRITE: ${overlong.length} quoted span(s) run past the ${SPAN_WORDS}-word limit this`);
  console.error('file\'s licence note claims for them. A span that long is republication, not comment.');
  for (const x of overlong.slice(0, 6)) console.error(`  ${x.slug} ${x.where} (${x.n} words): ${x.text.slice(0, 90)}`);
  process.exit(1);
}
console.log('quoted-span check           ', `clean: no quotation of a paper runs past ${SPAN_WORDS} words`);

/**
 * And the other direction: no record may reach the download carrying BOTH a withholding notice and
 * the text it withholds. The export writes one or the other, and this checks that it did.
 */
const leaked = entries.flatMap((e) => e.classical
  .map((c, i) => ({ e, c, i }))
  .filter(({ c }) => c.withheld && (c.quote || c.sanskrit || c.translation))
  .map(({ i }) => `${e.slug} classical[${i}]`));
if (leaked.length) {
  console.error(`\nREFUSING TO WRITE: ${leaked.length} citation(s) carry a withholding notice and the text:`);
  for (const x of leaked.slice(0, 6)) console.error(`  ${x}`);
  process.exit(1);
}
console.log('withholding check           ', 'clean: no citation carries both a notice and the text it withholds');

if (DRY) {
  console.log('\nDry run. Nothing written.');
  process.exit(0);
}

fs.writeFileSync(path.join('public', 'concepts.json'), JSON.stringify({
  name: data.name,
  description: data.description,
  licenceNote: 'This download is CC BY 4.0, WITH ONE CARVE-OUT. The records, the contested '
    + 'questions, the statements of what is not known, the glosses and every assessment are this '
    + 'project\'s own work and are offered on those terms. Classical quotations present here are '
    + 'either Sanskrit mula or a translation out of copyright, and a quotation this project may '
    + 'not reproduce is absent with a note in its place rather than silently dropped. THE '
    + 'CARVE-OUT: where our prose quotes a modern paper briefly in order to say what it does and '
    + 'does not establish, those quoted words remain under their own licence and are not granted '
    + 'by this one. Quotation for comment is not a derivative work; sub-licensing someone else\'s '
    + 'wording would be. A build-time check refuses to write this file if any quotation of a paper '
    + 'runs past sixty words, so what is here is comment and not republication.',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  updatedAt: data.updatedAt,
  provenance: data.provenance,
  domains: data.domains,
  summary,
  entries,
}));

const cell = (v) => (v == null || v === '' ? '' : `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`);
const rows = [[
  'concept', 'concept_title', 'subject_area', 'domain_as_recorded',
  'question', 'position_number', 'position', 'positions_on_this_question',
  'how_much_weight_the_concept_bears', 'citations_checked', 'page',
].join(',')];

for (const e of entries) {
  // A concept with nothing contested still gets a row, or the dataset would quietly lose the
  // concepts on which the sources happen to agree, which is itself a finding about them.
  const qs = e.contested.length ? e.contested : [null];
  for (const q of qs) {
    const ps = q && (q.positions ?? []).length ? q.positions : [null];
    for (const [i, p] of ps.entries()) {
      rows.push([
        e.slug, e.title, e.domainGroup, e.domain,
        q?.question, q ? i + 1 : '', p, q ? (q.positions ?? []).length : '',
        e.evidenceState, e.citationsChecked, `${SITE}${e.page}`,
      ].map(cell).join(','));
    }
  }
}
fs.writeFileSync(path.join('public', 'concepts.csv'), `${rows.join('\n')}\n`);

console.log(`\nwrote public/concepts.json and public/concepts.csv (${rows.length - 1} position rows)`);
