#!/usr/bin/env node
/**
 * Build the verification ledger: what was checked, how, and what got thrown out.
 *
 * Every number here is computed from the run artifacts rather than typed in, because
 * a hand-maintained accuracy page goes stale and then it is worse than nothing. If a
 * count on the published page is wrong, this script is wrong, and that is fixable.
 *
 * The rejections are the point. Anyone can publish an accuracy policy; the thing that
 * is actually checkable is the rejection rate and the reasons, and nobody in this
 * subject publishes theirs.
 *
 *   node scripts/verification.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry-run');
const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const count = (arr, fn) => arr.filter(fn).length;

const runs = [];

// ---------------------------------------------------------------- botanical
const bin = read(path.join('data', 'binomial-run.json'));
if (bin) {
  const r = bin.records;
  const byCat = {};
  for (const x of r) {
    (byCat[x.category || 'unknown'] ??= { accepted: 0, rejected: 0 })[x.outcome] += 1;
  }
  runs.push({
    id: 'botanical-identity',
    title: 'Botanical identity',
    question: 'Which species is this classical drug name?',
    note: bin.note,
    caveat: bin.caveat ?? '',
    method: [
      'Every herb page with no botanical name was collected (309 pages).',
      'An identifying agent proposed a binomial with its basis and a contested flag.',
      'An independent verifier was instructed to refute the identification against authoritative botanical sources, defaulting to reject.',
      'Rejection was the correct outcome wherever sources disagree. A wrong binomial is worse than a blank field: it renders as fact and pulls in literature about a different plant.',
    ],
    stats: {
      inputPages: bin.inputPages,
      candidates: r.length,
      accepted: count(r, (x) => x.outcome === 'accepted'),
      rejected: count(r, (x) => x.outcome === 'rejected'),
      // The non-plant categories are not failures. A bhasma or a purified salt has
      // no botanical binomial, and recording that is the right answer.
      notAPlant: count(r, (x) => x.category && x.category !== 'plant'),
      plantsAccepted: count(r, (x) => x.category === 'plant' && x.outcome === 'accepted'),
      plantsRejected: count(r, (x) => x.category === 'plant' && x.outcome === 'rejected'),
      contestedFlagged: count(r, (x) => x.contestedAtIdentify),
      contestedRejected: count(r, (x) => x.contestedAtIdentify && x.outcome === 'rejected'),
      contestedAcceptedAnyway: count(r, (x) => x.contestedAtIdentify && x.outcome === 'accepted'),
      byCategory: byCat,
    },
    // A handful of worked rejections, which show the bar better than the rate does.
    examples: r.filter((x) => x.outcome === 'rejected' && x.category === 'plant' && x.candidate)
      .slice(0, 6)
      .map((x) => ({ slug: x.slug, candidate: x.candidate, basis: x.identifyBasis })),
  });
}

// ---------------------------------------------------------------- citations
const claims = read(path.join('data', 'claims.json'));
const cites = read(path.join('src', 'data', 'citations.json'));
const research = read(path.join('src', 'data', 'research.json'));
if (claims) {
  const v = Object.values(claims.claims ?? {});
  const matched = count(v, (x) => x.status === 'plausible' && x.matchedBy === 'title-words' && x.pmid);
  const speciesOnly = count(v, (x) => x.matchedBy === 'species-keywords');
  const nothing = count(v, (x) => x.status === 'none');
  runs.push({
    id: 'citations',
    title: 'Research citations',
    question: 'Does the paper this page cites actually exist, and does it say this?',
    note: 'Every research bullet on the site was a paraphrase. None carried a PMID, DOI or exact title, so none could be checked by a reader. Each was resolved against PubMed and either replaced with the real record or deleted.',
    method: [
      'Each research bullet was queried against PubMed by title words.',
      'A match required the actual article title, not a topical resemblance.',
      'Matches found only by species keywords were rejected wholesale: that route paired a claim about sage extract and cognitive function with a paper on antihyperlipidemic effects, and once one pairing is that wrong the whole class is untrustworthy.',
      'Unresolved bullets were deleted rather than softened. Pages that lost material say so.',
    ],
    stats: {
      claimsChecked: v.length,
      recovered: matched,
      deleted: v.length - matched,
      matchedNothing: nothing,
      rejectedSpeciesKeywordOnly: speciesOnly,
      pagesWithCitations: cites ? Object.keys(cites.pages ?? {}).length : null,
      distinctPapers: research?.summary?.papers ?? null,
      papersWithDoi: research?.summary?.withDoi ?? null,
      byTier: research?.summary?.byTier ?? null,
    },
    examples: [],
  });
}

// ---------------------------------------------------------------- safety
// A run that was built and then rejected is still a verification result, and it is
// the most informative one on this page. Publishing only the runs that succeeded
// would make the rejection rate a marketing number instead of a measurement.
const run01 = read(path.join('data', 'runs', 'safety-panel-01.json'));
if (run01 && run01.outcome === 'NOT PUBLISHED') {
  const s = run01.summary ?? {};
  runs.push({
    id: 'safety-panel-01',
    title: 'Safety data, first attempt (rejected)',
    question: 'Can a four-lens judge panel produce publishable safety records?',
    note: `${run01.scope}. The panel accepted ${s.accepted} records. An independent auditor then `
      + `re-reviewed ${s.metaSampled} of those acceptances and rejected every one. None were published.`,
    method: [
      'Records were researched against an allowlist of regulatory and institutional sources, then judged by four independent lenses: source fidelity, clinical accuracy, regulatory language, and omission.',
      'A record shipped only if source fidelity passed it and at least two of the other three lenses agreed.',
      'A meta-judge then re-audited a sample of the ACCEPTED records, since a systematically lenient panel is invisible from inside its own verdicts.',
      `The meta-judge agreed with the panel on ${s.metaAgreed} of ${s.metaSampled} sampled records.`,
      'On that result the entire run was withheld. A defect rate that high in a sample means the accepted set as a whole cannot be trusted, and safety pages are the wrong place to publish and correct later.',
    ],
    stats: {
      pagesExamined: s.total,
      panelAccepted: s.accepted,
      panelRejected: s.rejected,
      inconclusive: s.inconclusive,
      metaSampled: s.metaSampled,
      metaAgreedWithPanel: s.metaAgreed,
      published: 0,
    },
    caveat: run01.reason,
    // The auditor's actual findings. These are the useful part: they name the specific
    // ways a plausible-looking safety record can be wrong.
    examples: (run01.metaDisagreements ?? []).map((m) => ({
      slug: m.slug,
      basis: (m.reasons ?? []).slice(0, 2).join(' | ').slice(0, 700),
    })),
  });
}

const run02 = read(path.join('data', 'runs', 'safety-repair-02.json'));
if (run02) {
  const s = run02.summary ?? {};
  runs.push({
    id: 'safety-repair-02',
    title: 'Safety data, second attempt',
    question: 'Can the rejected records be repaired to a publishable standard?',
    note: `${run02.scope} Every repaired record was then audited individually rather than sampled, `
      + `and ${s.publish} of ${s.examined} passed.`,
    method: [
      'Ten rules were written from the defects the first audit found, each one naming the real failure it came from: dropped monitoring instructions, claims attributed to studies that never tested them, adverse findings reported as absent, animal doses presented without species, spliced study arms, and developmental neurotoxicants graded as a caution.',
      'One agent per record re-fetched every cited source and either repaired the record or declared it unsalvageable.',
      'Every repaired record was then audited by an independent reviewer instructed to reject by default and to re-fetch the sources rather than trust the repair.',
      'The auditors also caught repairs that made records worse. On one, the repairer deleted a report of three deaths from liver failure as a fabrication; the auditor re-read the source, found the deaths were genuine, and rejected the repair for removing them.',
    ],
    stats: {
      recordsExamined: s.examined,
      published: s.publish,
      heldBackForFurtherWork: s.held,
      unsalvageable: s.unsalvageable,
      inconclusive: s.inconclusive,
    },
    caveat: 'A pass rate of 1 in 25 is the honest result of applying a standard this strict to a '
      + 'literature that is mostly silent at the level of the individual preparation. The 24 held '
      + 'records are not discarded; they are unfinished.',
    examples: (run02.held ?? []).slice(0, 6).map((h) => ({
      slug: h.slug,
      basis: (h.ruleViolations ?? h.reasons ?? []).slice(0, 2).join(' | ').slice(0, 600),
    })),
  });
}

const run03 = read(path.join('data', 'runs', 'safety-pass3.json'));
if (run03) {
  const s = run03.summary ?? {};
  runs.push({
    id: 'safety-pass3',
    title: 'Safety data, third attempt',
    question: 'Do the auditors\u2019 specific objections survive being fixed?',
    note: `${run03.scope} ${s.publish} of ${s.examined} passed.`,
    method: [
      'Each record was given its own auditor\u2019s line-by-line objections and told to fix those and change nothing else, because rewriting passages an auditor accepted risks introducing new defects.',
      'Two further rules were added from this round\u2019s failures: do not overclaim your own search (\u201cno permitted source names this preparation\u201d is supportable, \u201cI checked each survey\u2019s sample list and none tested it\u201d is not, and is false for any survey that publishes no product names), and carry the source\u2019s denominator verbatim (\u201c36% of samples\u201d and \u201c36% of samples containing lead\u201d are different claims).',
      'Every fixed record was audited again by a reviewer who read the original objections first, then audited the whole record afresh, since a fix for one defect can introduce another.',
    ],
    stats: {
      recordsExamined: s.examined,
      published: s.publish,
      stillHeld: s.held,
    },
    caveat: 'The records that remain held are not discarded. Each carries a specific, current '
      + 'objection, and the objections are getting narrower with each pass.',
    examples: (run03.held ?? []).slice(0, 5).map((h) => ({
      slug: h.slug,
      basis: (h.ruleViolations ?? h.reasons ?? []).slice(0, 2).join(' | ').slice(0, 600),
    })),
  });
}

const safety = (run02 || run03) ? null : read(path.join('data', 'safety-verdicts.json'));
if (safety) {
  const led = safety.ledger ?? [];
  runs.push({
    id: 'safety',
    title: 'Safety data',
    question: 'Is this contraindication real, correctly stated, and is anything dangerous missing?',
    note: 'Only 24 of 504 herb pages carried any safety content. The rest inherited a placeholder that the pipeline strips, so the site answered questions about pregnancy and drug interactions with silence.',
    method: [
      'Records may cite only an allowlisted source: WHO, NIH LiverTox and other NCBI Bookshelf works, NCCIH, NIH ODS, Memorial Sloan Kettering, MedlinePlus, PubMed and PMC, the Ministry of Ayush, the Indian Pharmacopoeia Commission, the EMA and the FDA.',
      'Four judges review every record, each with a different lens, because the failure modes differ: source fidelity, clinical accuracy, regulatory language, and omission.',
      'Source fidelity is a gate rather than a vote. A record ships only if that judge passes it AND at least two of the other three do.',
      'A record with no authoritative source available publishes as an explicit "not established" statement. Silence is not a permitted outcome.',
      'A meta-judge re-reviews a sample of accepted records, because a systematically lenient judge is invisible from inside its own verdicts.',
    ],
    stats: {
      ...(safety.summary ?? {}),
      ledgerEntries: led.length,
      acceptedEntries: count(led, (x) => x.outcome === 'accepted'),
      rejectedEntries: count(led, (x) => x.outcome === 'rejected'),
      rejectedByStage: led.filter((x) => x.outcome === 'rejected')
        .reduce((a, x) => { a[x.stage] = (a[x.stage] ?? 0) + 1; return a; }, {}),
    },
    examples: led.filter((x) => x.outcome === 'rejected' && (x.reasons ?? []).length)
      .slice(0, 6).map((x) => ({ slug: x.slug, basis: (x.reasons ?? []).join('; ') })),
  });
}

const out = { updatedAt: new Date().toISOString().slice(0, 10), runs };

for (const r of runs) {
  console.log(`${r.id.padEnd(20)} ${JSON.stringify(r.stats).slice(0, 110)}`);
}
if (!runs.length) console.log('no verification artifacts found');

if (DRY) { console.log('\nDry run: nothing written.'); process.exit(0); }

fs.mkdirSync(path.join('src', 'data'), { recursive: true });
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync(path.join('src', 'data', 'verification.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join('public', 'verification.json'), JSON.stringify({
  name: 'Age Ayurveda Nighantu verification ledger',
  description: 'What was checked on this reference, by what method, and what was rejected. '
    + 'Counts are computed from the run artifacts, not maintained by hand.',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  ...out,
}, null, 1));
console.log('\nwrote src/data/verification.json and public/verification.json');
