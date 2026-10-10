#!/usr/bin/env node
/**
 * Find literature for formulation pages, which the citation pipeline has never once queried for.
 *
 * THE DEFECT THIS EXISTS FOR. scripts/citations.mjs fetches fresh literature with
 *
 *     pages.filter((p) => p.binomial && ...)
 *
 * and a formulation is a multi-herb preparation with no single botanical binomial: 142 of 143
 * formulation pages have an empty `botanical` field. So every one of them was silently excluded
 * from the only step that fetches new papers. 102 of 143 hold no literature at all, against a
 * median of 12 per herb page, and the 72 they do hold arrived by other routes.
 *
 * That matters because formulation pages are not a dead surface. All 144 Bing AI citations this
 * site has earned went to herb and formulation pages, and Bing's named queries are
 * formulation-shaped: "sitopaladi churna" in eight spellings, "karpooradi thailam ingredients",
 * "trikatu in ayush pharmacopoeia". It is the thinnest part of the channel that demonstrably works.
 *
 * WHY THIS IS A SEPARATE SCRIPT AND REPORTS BEFORE IT WRITES. A formulation name query is a
 * precision problem in a way a binomial query is not. "Cinnamomum verum"[Title/Abstract] cannot
 * match the wrong plant. "Guggulu" matches papers about Commiphora resin that say nothing about
 * Punarnavadi Guggulu, and attaching one to the other is a false attribution, which is the most
 * damaging error this corpus can make. So the default is a report a person reads, and writing is
 * opt-in.
 *
 *   node scripts/formulation-research.mjs                    report, write nothing
 *   node scripts/formulation-research.mjs --limit 20         just the first 20 empty pages
 *   node scripts/formulation-research.mjs --json out.json    save candidates for review
 *   node scripts/formulation-research.mjs --thin 6            pages holding fewer than 6 papers
 *   node scripts/formulation-research.mjs --names n.json      add externally supplied name variants
 *   node scripts/formulation-research.mjs --collection herb   any collection, not just formulations
 *   node scripts/formulation-research.mjs --slugs s.json      restrict to a named set of slugs
 *
 * It never writes src/data/citations.json. Promoting reviewed candidates is a separate, later step,
 * deliberately, because citations.mjs is the script that once emptied 31 live pages.
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk, parseFrontmatter } from './lib.mjs';
import { esearch, esummary, tierOf } from './lib/pubmed.mjs';

const CITATIONS = path.join('src', 'data', 'citations.json');
const RETRACTIONS = path.join('data', 'retractions.json');

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const LIMIT = Number(argOf('--limit', 0)) || Infinity;
const JSON_OUT = argOf('--json', null);
const PER_PAGE = 12;

/**
 * Dosage-form and category words that are NOT a formulation identity.
 *
 * A page titled "Guggulu" or "Avaleha" names a class of preparation, not a preparation. Querying
 * for it returns the pharmacology of a resin or the general literature on confections, none of
 * which is about any particular formulation. These are skipped and reported as skipped, because an
 * unqueried page is a known gap and a wrongly-populated one is a lie.
 */
const FORM_WORDS = new Set([
  'churna', 'choorna', 'curna', 'vati', 'gutika', 'taila', 'tailam', 'thailam', 'ghrita',
  'ghritam', 'ghrta', 'kashayam', 'kashaya', 'kwath', 'kwatha', 'arishta', 'arista', 'asava',
  'avaleha', 'leham', 'rasayana', 'guggulu', 'guggul', 'bhasma', 'lepa', 'arka', 'svarasa',
  'khanda', 'mandura', 'parpati', 'malahara', 'oil', 'ghee', 'powder', 'tablet',
]);

const isGeneric = (title) => {
  const words = title.toLowerCase().replace(/[^a-z\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => FORM_WORDS.has(w));
};

/**
 * Conservative orthographic variants of a formulation name.
 *
 * The literature transliterates these a dozen ways and PubMed phrase search is literal, so the
 * exact page title alone misses papers that are unambiguously about the same preparation.
 *
 * EVERY RULE HERE MUST BE UNABLE TO CHANGE WHICH FORMULATION IS NAMED. s/sh, v/w, oo/u and a
 * trailing -m are spelling, not identity. Deliberately NOT included: swapping a stem vowel, which
 * would turn "Amalaka Rasayana" into "Amalaki Rasayana", and those are arguably separate entries.
 * That is the difference between finding the same drug spelled differently and inventing a match.
 */
function variantsOf(title) {
  const base = title.trim();
  const out = new Set([base]);
  const swaps = [
    [/sh/gi, 's'], [/\bs(?=[aeiou])/gi, 'sh'],
    [/v/gi, 'w'], [/w/gi, 'v'],
    [/oo/gi, 'u'], [/\bch/gi, 'c'],
    [/m$/i, ''],
    [/th/gi, 't'],
  ];
  for (const [re, to] of swaps) {
    const v = base.replace(re, to);
    if (v && v.toLowerCase() !== base.toLowerCase()) out.add(v);
  }
  // Cap it. Each variant is a PubMed round trip, and the point is coverage, not exhaustiveness.
  return [...out].slice(0, 5);
}

/**
 * Does this record actually name the formulation?
 *
 * PubMed phrase search should guarantee it, and this verifies it rather than trusting it. A record
 * whose title and abstract do not contain a recognisable form of the name is dropped: better an
 * empty page than a page citing a paper that is not about its subject.
 */
const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');
function namesTheFormulation(rec, variants) {
  const hay = squash(`${rec.title ?? ''} ${rec.abstract ?? ''} ${rec.journal ?? ''}`);
  return variants.some((v) => hay.includes(squash(v)));
}

/**
 * Does the paper actually name a LONGER, DIFFERENT formulation that merely starts with this one?
 *
 * The name check above is a containment test, and classical nomenclature is built by extension, so
 * containment is not identity. Two real cases came out of the first full run of 55 candidates:
 *
 *   page "Dashamula"          paper "Saponification equivalent of dasamula taila"
 *   page "Panchatikta Ghrita" paper "...management by Panchatikta Ghrita Guggulu"
 *
 * Dasamula Taila is an oil and Dashamula is the ten-root group; Panchatikta Ghrita Guggulu is a
 * separate formulary entry from Panchatikta Ghrita. Both would have been false attributions, and
 * both are invisible to a containment test because the longer name contains the shorter one.
 *
 * So a match immediately followed by another preparation-forming word is rejected. The failure
 * direction is a missed paper rather than a wrong citation, which is the right way round: a reader
 * can live with a thin page and cannot detect a plausible wrong reference.
 *
 * Deliberately only the word IMMEDIATELY after the match counts. "Murivenna and Abha Guggulu" is a
 * paper about Murivenna among other drugs, which is fine; "Panchatikta Ghrita Guggulu" is one name.
 */
/**
 * Is this record correspondence, where the "match" is somebody's surname?
 *
 * Found by running the 50 non-plant herb pages. Three records attached to the page for Madhu,
 * honey, on titles like "Reply to Madhu et al" and "Re: Ronald D. Ennis, Liangyuan Hu, Shannon N.
 * Ryemon, Joyce Lin, Madhu Mazumdar. Brachytherapy...". Madhu is a common Indian given name, and a
 * PubMed [Title/Abstract] search cannot tell it from the Sanskrit for honey, because the author's
 * name really is in the title of a reply.
 *
 * Correspondence is also not a study, so excluding it costs this corpus nothing it wants.
 */
/**
 * Preprint servers, which are not peer-reviewed literature.
 *
 * /herb/menthol matched "Structural Basis of Cold and Menthol Sensing by TRPM8" in bioRxiv. The
 * paper may well be right and the mechanism is exactly what an Ayurvedic entry would discuss for
 * menthol's cooling property, but References.astro tells readers this section is "literature
 * indexed in PubMed ... grouped by study type", and a preprint has no study type assigned by
 * anybody. Keeping it would make the page's own description of its references untrue.
 */
const PREPRINT = /\b(biorxiv|medrxiv|arxiv|chemrxiv|research square|ssrn|preprint)\b/i;
const isPreprint = (rec) => PREPRINT.test(String(rec.journal ?? ''));

const CORRESPONDENCE = /^(reply to|re:|response to|comment on|letter to|author repl|correspondence)|\bet al\b/i;
const isCorrespondence = (rec) => CORRESPONDENCE.test(String(rec.title ?? '').trim());

/**
 * A short single-word name is too ambiguous to attach on its own evidence.
 *
 * "Dadhi" (5 characters) matched a paper on infant birth outcomes and DNA damage biomarkers, where
 * Dadhi is an author. "Menthol" (7) matched thirteen papers, most of them tobacco-control studies
 * about menthol cigarettes, which is the right word and the wrong subject for an Ayurvedic materia
 * medica entry. "Trikatu" (7) matched eleven papers that are all genuinely about the formulation.
 *
 * So length alone does not decide it and no rule here will. These are reported as NEEDING REVIEW
 * rather than kept or dropped, because the distinction is editorial: whether the literature under
 * an ambiguous word is about this drug is a judgement a person should make once per name, not a
 * threshold.
 */
const ambiguousName = (title) => title.trim().split(/\s+/).length === 1 && title.trim().length < 8;

function namesALongerFormulation(rec, matchedOn) {
  const title = String(rec.title ?? '').toLowerCase();
  const name = String(matchedOn ?? '').toLowerCase();
  const at = title.indexOf(name);
  if (at === -1) return false;
  const next = /^([a-z]+)/.exec(title.slice(at + name.length).trim());
  return Boolean(next && FORM_WORDS.has(next[1]));
}

// ------------------------------------------------------------------ inputs
const cit = fs.existsSync(CITATIONS) ? JSON.parse(fs.readFileSync(CITATIONS, 'utf8')).pages ?? {} : {};

/** PMIDs already known to be retracted or corrected. Cumulative by design; never re-attach one. */
const blocked = new Set();
if (fs.existsSync(RETRACTIONS)) {
  for (const f of JSON.parse(fs.readFileSync(RETRACTIONS, 'utf8')).flagged ?? []) {
    if (f.pmid) blocked.add(String(f.pmid));
  }
}

/**
 * THIN, NOT EMPTY. The first version of this filtered on pages holding zero citations, which
 * measured the wrong population and skipped 40 pages.
 *
 * The page it skipped that mattered most is sitopaladi-churna: it holds one paper, seven exist
 * under its exact name, and it is the largest named query cluster this site has on Bing, 42
 * impressions across eight spellings. A page with one citation is not a covered page.
 *
 * The threshold is 6 because that is the number citations.mjs itself uses to decide a page needs
 * topping up, and having two different definitions of "thin" in one project is how the measurements
 * start disagreeing. 142 of 143 formulation pages are below it.
 */
const THIN = Number(argOf('--thin', 6));

/**
 * WHICH COLLECTION, because this is not only a formulation problem.
 *
 * The binomial filter in citations.mjs excludes any page with no botanical name, and that is not
 * confined to formulations. 108 herb pages hold no literature, and only 11 of them have a binomial:
 * 37 are minerals, bhasmas, salts, rasa preparations, animal products or isolates, for which no
 * binomial exists or could, and 13 are multi-herb formulations filed under herb/. A binomial query
 * for godanti-bhasma or dadhi is a category error, not a gap. All 50 are searched by name, exactly
 * as a formulation is.
 *
 * --slugs restricts a run to a named set, so a bucket worked out elsewhere can be targeted without
 * re-querying a whole collection.
 */
const COLLECTION = argOf('--collection', 'formulation');
const SLUGS_FILE = argOf('--slugs', null);
const ONLY_SLUGS = SLUGS_FILE && fs.existsSync(SLUGS_FILE)
  ? new Set(JSON.parse(fs.readFileSync(SLUGS_FILE, 'utf8')))
  : null;

/**
 * Extra names per page, supplied from outside, for the one part of this that a pattern cannot do.
 *
 * variantsOf() deliberately refuses any change that could alter which drug is named, which means it
 * cannot reach "Ajmodadi" from "Ajamodadi" or "Dashmoolarishta" from "Dashamularishta". A probe of
 * eight zero-yield pages found papers under exactly those unreachable spellings for four of them:
 * 6 papers for Ajmodadi Churna and 6 for Dashamularishta that this script had missed entirely.
 *
 * Deciding that two transliterations name the same preparation is a judgement, so it is made
 * elsewhere, by something that can judge, and the result is handed in here as data. The same probe
 * also found the trap: "Pippali rasayana" has 5 papers and is NOT Pippali Khanda. So a supplied
 * name is a candidate query and nothing more. Every guard below still applies to whatever it
 * returns, and the longer-formulation guard is what catches that specific class of mistake.
 *
 * Shape: { "formulation/slug": ["Alternate Name", "Another"], ... }
 */
const NAMES_FILE = argOf('--names', null);
const extraNames = NAMES_FILE && fs.existsSync(NAMES_FILE)
  ? JSON.parse(fs.readFileSync(NAMES_FILE, 'utf8'))
  : {};

const pages = [];
for (const rel of walk('content')) {
  if (rel.split(path.sep)[0] !== COLLECTION) continue;
  const slug = path.basename(rel, '.md');
  if (ONLY_SLUGS && !ONLY_SLUGS.has(slug)) continue;
  const key = `${COLLECTION}/${slug}`;
  const held = (cit[key]?.citations ?? []).length;
  if (held >= THIN) continue;
  const { data } = parseFrontmatter(fs.readFileSync(path.join('content', rel), 'utf8'));
  pages.push({ slug, key, title: data.title ?? slug, held });
}
pages.sort((a, b) => a.slug.localeCompare(b.slug));

const generic = pages.filter((p) => isGeneric(p.title));
const queryable = pages.filter((p) => !isGeneric(p.title)).slice(0, LIMIT);

const empty = pages.filter((p) => p.held === 0).length;
console.log(`${pages.length} ${COLLECTION} pages hold fewer than ${THIN} papers ` +
  `(${empty} hold none, ${pages.length - empty} hold 1 to ${THIN - 1}).`);
console.log(`  ${generic.length} skipped as a dosage form rather than a formulation: ` +
  `${generic.map((p) => p.title).join(', ') || 'none'}`);
console.log(`  ${queryable.length} will be queried by name.`);
console.log(`  ${blocked.size} PMIDs are blocked as retracted or corrected and can never attach.`);
if (NAMES_FILE) {
  const n = Object.values(extraNames).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
  console.log(`  ${n} supplied names across ${Object.keys(extraNames).length} pages from ${NAMES_FILE}.`);
}
console.log('');

// ------------------------------------------------------------------ prospect
const found = {};
let withAny = 0;
let totalKept = 0;
let totalDropped = 0;
let totalLonger = 0;
let totalCorrespondence = 0;
let totalPreprint = 0;

for (const [i, p] of queryable.entries()) {
  const supplied = Array.isArray(extraNames[p.key]) ? extraNames[p.key] : [];
  // Supplied names are added, never substituted: the page's own title stays the first query.
  const variants = [...new Set([...variantsOf(p.title), ...supplied.map((x) => String(x).trim())])]
    .filter(Boolean);
  const seen = new Map();
  // Papers the page already carries. Without this a thin page re-proposes what it holds and the
  // candidate count overstates what would actually be added.
  const alreadyHeld = new Set((cit[p.key]?.citations ?? []).map((c) => String(c.pmid)));
  let droppedHere = 0;
  let droppedLonger = 0;
  let droppedCorrespondence = 0;
  let droppedPreprint = 0;

  for (const v of variants) {
    const term = `"${v}"[Title/Abstract] AND english[Language]`;
    const hit = await esearch(term, { retmax: PER_PAGE });
    if (!hit.ids.length) continue;
    const fresh = hit.ids.filter((id) => !seen.has(String(id))
      && !blocked.has(String(id)) && !alreadyHeld.has(String(id)));
    if (!fresh.length) continue;
    for (const rec of await esummary(fresh)) {
      const pmid = String(rec.pmid);
      if (blocked.has(pmid) || seen.has(pmid) || alreadyHeld.has(pmid)) continue;
      if (!namesTheFormulation(rec, variants)) { droppedHere += 1; continue; }
      if (namesALongerFormulation(rec, v)) { droppedLonger += 1; continue; }
      if (isCorrespondence(rec)) { droppedCorrespondence += 1; continue; }
      if (isPreprint(rec)) { droppedPreprint += 1; continue; }
      seen.set(pmid, { ...rec, tier: tierOf(rec.pubtypes), matchedOn: v, source: 'pubmed-formulation' });
    }
  }

  const kept = [...seen.values()];
  totalKept += kept.length;
  totalDropped += droppedHere;
  totalLonger += droppedLonger;
  totalCorrespondence += droppedCorrespondence;
  totalPreprint += droppedPreprint;
  if (kept.length) {
    withAny += 1;
    found[p.key] = {
      title: p.title,
      alreadyHeld: p.held,
      variantsTried: variants,
      needsReview: ambiguousName(p.title) || undefined,
      candidates: kept,
    };
  }
  const mark = kept.length ? String(kept.length).padStart(2) : ' .';
  console.log(`  ${String(i + 1).padStart(3)}/${queryable.length}  ${mark} new  ` +
    `(holds ${String(p.held).padStart(2)})  ` +
    `${p.title}${droppedHere ? `   (${droppedHere} dropped: did not name it)` : ''}` +
    `${droppedLonger ? `   (${droppedLonger} dropped: names a longer formulation)` : ''}`);
}

console.log(`\n${withAny} of ${queryable.length} pages found at least one paper.`);
console.log(`${totalKept} candidates kept, ${totalDropped} dropped for not naming the formulation,`);
console.log(`${totalLonger} dropped for naming a longer formulation that merely starts with it,`);
console.log(`${totalCorrespondence} dropped as correspondence, where the match is an author's surname,`);
console.log(`${totalPreprint} dropped as a preprint rather than peer-reviewed literature.`);
const review = Object.entries(found).filter(([, v]) => v.needsReview).map(([k]) => k.split('/')[1]);
if (review.length) {
  console.log(`\nNEEDS REVIEW before promotion, name too short and ambiguous to trust alone:`);
  console.log(`  ${review.join(', ')}`);
}
console.log('\nNOTHING WAS WRITTEN. This is a report; review it before any of it reaches a page.');

if (JSON_OUT) {
  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, `${JSON.stringify({
    note: 'Candidate literature for formulation pages holding none. NOT verified for relevance '
      + 'beyond a literal name match, and not attached to any page. Review before promoting.',
    prospectedOn: new Date().toISOString().slice(0, 10),
    collection: COLLECTION,
    thinThreshold: THIN,
    pagesThin: pages.length,
    pagesEmpty: empty,
    skippedAsGeneric: generic.map((p) => p.title),
    queried: queryable.length,
    pagesWithCandidates: withAny,
    candidatesKept: totalKept,
    droppedForNotNamingIt: totalDropped,
    droppedForNamingALongerFormulation: totalLonger,
    droppedAsCorrespondence: totalCorrespondence,
    droppedAsPreprint: totalPreprint,
    pages: found,
  }, null, 2)}\n`);
  console.log(`Candidates saved to ${JSON_OUT} for review.`);
}
