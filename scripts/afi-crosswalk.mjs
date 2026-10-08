#!/usr/bin/env node
/**
 * The ingredient vocabulary of the Ayurvedic Formulary of India, resolved to botanical identity.
 *
 * WHY THIS EXISTS. The formulary states each official composition in Sanskrit, and it does not
 * state one name per ingredient: across the 101 entries transcribed here, 1,973 ingredient rows
 * use 750 distinct spellings for roughly 366 distinct things. `Abhaya` and `Pathya` are both
 * haritaki. `Nagara` is sunthi. `Amrta` is guduci. `Ghrta`, `go ghrta`, `Sarpi`, `goghrta`,
 * `Havisa` and `Havi` are all ghee. Nobody publishes a crosswalk for this vocabulary, which means
 * nobody can mechanically compare a manufacturer's published ingredient list against the
 * formulary entry it claims, because the two are written in different registers: the formulary in
 * Sanskrit, the label in Hindi trade names and botanical binomials.
 *
 * That comparison is the obvious next thing this site should publish, and it was blocked on
 * exactly this. So this builds the bridge, and publishes its own coverage honestly rather than
 * claiming to be complete.
 *
 * WHERE EVERY LINK COMES FROM, because a crosswalk nobody can check is a guess with a schema.
 *
 *   printed-gloss     The formulary itself prints a gloss against an ingredient name: "Abhaya
 *                     (haritaki)". 722 rows carry one. These are the book's own synonym statements
 *                     and they are the strongest evidence here.
 *
 *                     USED PER ROW, NEVER CLOSED TRANSITIVELY, and the first version of this file
 *                     got that wrong in a way worth recording. It merged names into synonym
 *                     clusters by chaining the glosses: if the book says A is B anywhere, and C is
 *                     B anywhere, treat A, B and C as one thing. A gloss is CONTEXTUAL. It is true
 *                     of the row it is printed on. "Patra" is glossed as tejapatra in one entry
 *                     and means a different leaf elsewhere; "Madhuka" is liquorice in one place
 *                     and the gloss "madhu" is honey. Chaining them produced
 *                     `Madhuka = Madhu = Maksika = Dhatumaksika-bhasma` resolved to arjuna, with
 *                     47 formulary rows riding on it, and `Ambu = Bala = Jala` where two of those
 *                     three mean water. Six of the twenty highest-volume clusters were wrong like
 *                     that. So resolution is now per (entry, row): the gloss printed on a row
 *                     disambiguates that row and nothing else.
 *   monograph-name    A cluster member matches the name of a herb monograph published on this
 *                     site, by the same token-and-skeleton matcher used to identify products.
 *                     That brings the monograph's binomial, family and multilingual names with it.
 *   monograph-sanskrit  The monograph's own names table prints a Sanskrit name. Only 24 of 505 do,
 *                     but one of them is black pepper, and `Marica` is the single most-used
 *                     unresolved name in the formulary at 34 rows.
 *
 * NOTHING IS INFERRED BEYOND THOSE. No model is asked what `Prativisa` is. An ingredient this
 * cannot resolve is published as unresolved, with the number of formulary rows riding on it, so
 * the gap is visible and someone can close it with a source.
 *
 * AND POLYSEMY IS REPORTED RATHER THAN RESOLVED. A name that resolves to more than one monograph
 * across the formulary is marked ambiguous and its rows are counted separately. That is the honest
 * treatment: `Candana` is sandalwood in one row and red sanders in another, and a crosswalk that
 * silently picked one would be wrong half the time while looking complete.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not say whether a product complies with the formulary.
 * It resolves names. The comparison built on top of it has to be a documentary one, between what a
 * page states and what the book states, and it will carry this file's coverage as its own limit.
 *
 *   node scripts/afi-crosswalk.mjs            report coverage, write nothing
 *   node scripts/afi-crosswalk.mjs --write    write src/data/afi-crosswalk.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildMatcher } from './lib/formulation-names.mjs';

const WRITE = process.argv.includes('--write');
const OUT = path.join('src', 'data', 'afi-crosswalk.json');

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const afi = read(path.join('src', 'data', 'composition.json')).records;
const names = read(path.join('src', 'data', 'names.json')).pages;
const taxa = read(path.join('src', 'data', 'taxonomy.json')).taxa;

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const ILLEGIBLE = /illegible/i;

// ----------------------------------------------------------------- the monographs, as targets
/**
 * Every herb monograph on the site, carrying every name form the repository holds for it.
 *
 * Getting this set wrong is how the coverage figure for this bridge was wrong three times over.
 * Indexing only names.json offered the matcher 270 of the 354 monographs and never showed it black
 * pepper at all, so `Marica` read as a dravya the site does not cover when it has a monograph and
 * a GBIF-resolved binomial. The lesson is cheap and worth the comment: measure the input set
 * before measuring what it covers.
 */
const forms = new Map();
const addForm = (slug, f) => {
  if (!f || !/[a-zA-Z]/.test(String(f))) return;
  if (!forms.has(slug)) forms.set(slug, new Set());
  forms.get(slug).add(String(f).trim());
};
const binomial = new Map();
const family = new Map();

for (const t of taxa) {
  for (const p of t.pages ?? []) {
    if (p.kind !== 'herb') continue;
    const slug = `herb/${p.slug}`;
    addForm(slug, p.slug.replace(/-/g, ' '));
    addForm(slug, p.title);
    addForm(slug, t.canonicalName);
    addForm(slug, t.query);
    if (t.canonicalName && !binomial.has(slug)) binomial.set(slug, t.canonicalName);
    if (t.family && !family.has(slug)) family.set(slug, t.family);
  }
}
for (const [k, v] of Object.entries(names)) {
  addForm(k, k.split('/')[1].replace(/-/g, ' '));
  for (const arr of Object.values(v)) {
    if (!Array.isArray(arr)) continue;
    for (const x of arr) { addForm(k, x.name); addForm(k, x.iast); }
  }
}

/** The Sanskrit and Hindi rows printed in each monograph's own names table. */
const monographSanskrit = new Map();
const HERBS = path.join('content', 'herb');
if (fs.existsSync(HERBS)) {
  for (const f of fs.readdirSync(HERBS).filter((x) => x.endsWith('.md'))) {
    const slug = `herb/${f.replace(/\.md$/, '')}`;
    const body = fs.readFileSync(path.join(HERBS, f), 'utf8');
    for (const m of body.matchAll(/^\|\s*(Sanskrit|Hindi)\s*\|\s*([^|\n]+)\|/gmi)) {
      const lang = m[1].toLowerCase();
      // "Maricha, Krishna" is two names, and the link syntax of an English row leaks into none of
      // these, but strip it anyway rather than index "[Black Pepper](/herb/black-pepper/)".
      //
      // The PARENTHETICAL also has to go, and it was the biggest single gap in this file. Ginger's
      // row reads "Ardraka (fresh), Shunthi (dry), Nagara", and indexing "Shunthi (dry)" makes a
      // two-token target that the one-token formulary name `Sunthi` can never match: the matcher
      // looks for the target's run inside the candidate. 31 ingredient rows, the largest
      // unresolved name in the book, turned on a qualifier in brackets. The qualifier says which
      // state of the drug is meant; it is not part of its name.
      for (const piece of m[2].split(',')) {
        const clean = piece
          .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
          .replace(/\([^)]*\)/g, ' ')
          .replace(/[*_`]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!clean) continue;
        addForm(slug, clean);
        if (lang === 'sanskrit') {
          if (!monographSanskrit.has(slug)) monographSanskrit.set(slug, []);
          monographSanskrit.get(slug).push(clean);
        }
      }
    }
  }
}

const targets = [...forms].map(([slug, set]) => ({ slug, names: [...set] }));
const match = buildMatcher(targets);

/**
 * EXACT NAMES BEAT FUZZY ONES, and for this file that is not a refinement, it is the difference
 * between a usable crosswalk and a dangerous one.
 *
 * buildMatcher exists to recognise a PRODUCT from a URL slug, where a vowel difference is almost
 * always a transliteration variant and folding it is right. Applied to dravya identity the same
 * tolerance is wrong, because a vowel can be the whole distinction between two unrelated drugs.
 * `Pippali` is Piper longum, long pepper. `Pippala` is Ficus religiosa, the sacred fig. The
 * skeleton match reduces both to p-p-l, and the first version of this file therefore resolved
 * `Pippali` to /herb/ashwattha/ and called Ficus religiosa the most-used ingredient in the
 * formulary, across 40 rows.
 *
 * So an exact normalised match is tried first and wins outright. The fuzzy matcher is still used,
 * because it correctly bridges real variants like Sunthi and Shunthi, but only where nothing
 * matches exactly, and its links are recorded as the weaker evidence they are.
 */
const exact = new Map();
for (const [slug, set] of forms) {
  for (const f of set) {
    const n = norm(f);
    if (!n) continue;
    if (!exact.has(n)) exact.set(n, slug);
  }
}

// -------------------------------------------------------------- resolve, one row at a time
/**
 * Resolution is per (entry, row). The gloss printed on a row disambiguates THAT row.
 *
 * The gloss is tried first, because when the book bothers to print one it is the book telling you
 * which drug it means. The bare name is tried second. Nothing is chained.
 */
const resolveOne = (name, gloss) => {
  for (const [candidate, via] of [[gloss, 'printed-gloss'], [name, 'name']]) {
    const n = norm(candidate);
    if (!n || ILLEGIBLE.test(String(candidate))) continue;

    const exactSlug = exact.get(n);
    const slug = exactSlug ?? match(n)[0]?.slug;
    if (!slug) continue;

    const sanskrit = (monographSanskrit.get(slug) ?? []).some((x) => norm(x) === n);
    const how = exactSlug
      ? (sanskrit ? 'monograph-sanskrit' : 'monograph-name')
      : 'monograph-name-approximate';
    return {
      monograph: slug,
      matchedOn: String(candidate).trim(),
      exact: Boolean(exactSlug),
      basis: via === 'printed-gloss' ? `printed-gloss, then ${how}` : how,
    };
  }
  return null;
};

// ------------------------------------------------------------------------------ classify
/**
 * What kind of thing a cluster is, which decides whether an unresolved one is a gap at all.
 *
 * Water, ghee, jaggery, rock salt, sugar and the calcined minerals have no herb monograph and
 * should not have one: they are vehicles, sweeteners, excipients and mineral preparations. Reading
 * them as "a dravya this site does not cover" overstates the gap by about a third of it, so they
 * are separated and counted apart.
 */
const CLASS = [
  [/^water|^jala$|\bdecoction\b|^dugdha|milk|^dadhi|^takra|^kanji|^dhanyamla|^sura$|^madya/i, 'vehicle'],
  [/ghrta|^sarpi|^havi|^taila$|^tila$|oil$/i, 'fat'],
  [/^guda$|^sarkara|^sita$|^khanda|^madhu$|^maksika|sugar|jaggery|honey/i, 'sweetener'],
  [/lavana|^saindhava|^sindhuttha|^yava ksara|^ksara|^tankana|^sphatika/i, 'salt-or-alkali'],
  [/bhasma|pisti|^loha$|^abhraka|^tamra|^rasa sindura|^gandhaka|^parada|^hingula|^mandura|^svarna|^rajata/i, 'mineral-or-metal'],
  [/^gomutra|urine|^mamsa|musk|^kasturi|^sankha|^mukta$|^pravala/i, 'animal-or-shell'],
];
const classOf = (labels) => {
  for (const l of labels) for (const [re, k] of CLASS) if (re.test(l)) return k;
  return 'plant';
};

// ------------------------------------------------------------------------------ build
const rows = [];
/** Per distinct name: which monographs it resolved to anywhere in the book. */
const byName = new Map();

for (const [slug, rec] of Object.entries(afi)) {
  const where = `Part ${rec.afiPart}, ${rec.entryNumber}`;
  for (const r of (rec.rows ?? []).filter((x) => !x.structural)) {
    if (!r.name || ILLEGIBLE.test(r.name)) continue;
    const got = resolveOne(r.name, r.gloss);
    const kind = classOf([r.name, r.gloss ?? ''].filter(Boolean));
    const row = {
      formulation: slug,
      printedIn: where,
      n: r.n,
      name: r.name,
      printedGloss: r.gloss ?? null,
      substanceClass: kind,
      monograph: got ? `/${got.monograph}/` : null,
      matchedOn: got?.matchedOn ?? null,
      binomial: got ? binomial.get(got.monograph) ?? null : null,
      family: got ? family.get(got.monograph) ?? null : null,
      basis: got?.basis ?? 'unresolved',
      exactName: got ? got.exact : null,
    };
    rows.push(row);
    const key = norm(r.name);
    if (!byName.has(key)) byName.set(key, { name: r.name, rows: 0, monographs: new Map(), substanceClass: kind });
    const e = byName.get(key);
    e.rows += 1;
    if (got) e.monographs.set(got.monograph, (e.monographs.get(got.monograph) ?? 0) + 1);
  }
}

/**
 * The name-level view, where polysemy becomes visible.
 *
 * A name that resolved to two different monographs in two different entries is not a crosswalk
 * failure, it is a fact about the vocabulary, and it is the fact a comparison built on this most
 * needs to know. It is flagged rather than collapsed.
 */
const vocabulary = [...byName.values()].map((e) => {
  const ms = [...e.monographs.entries()].sort((a, b) => b[1] - a[1]);
  return {
    name: e.name,
    formularyRows: e.rows,
    substanceClass: e.substanceClass,
    resolvesTo: ms.map(([slug, n]) => ({ monograph: `/${slug}/`, binomial: binomial.get(slug) ?? null, rows: n })),
    ambiguous: ms.length > 1,
    status: ms.length === 0 ? 'unresolved' : (ms.length > 1 ? 'ambiguous' : 'resolved'),
  };
}).sort((a, b) => b.formularyRows - a.formularyRows || a.name.localeCompare(b.name));

// ------------------------------------------------------------------------------ report
const pc = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '0%');
const resolvedRows = rows.filter((r) => r.monograph).length;
const plantRows = rows.filter((r) => r.substanceClass === 'plant');
const plantResolved = plantRows.filter((r) => r.monograph).length;
const viaGloss = rows.filter((r) => r.basis.startsWith('printed-gloss')).length;
const viaSanskrit = rows.filter((r) => r.basis === 'monograph-sanskrit').length;
const approximate = rows.filter((r) => r.monograph && !r.exactName).length;

console.log(`formulary ingredient rows             ${rows.length}`);
console.log(`  resolved to a monograph             ${resolvedRows}  ${pc(resolvedRows, rows.length)}`);
console.log(`    via a gloss the book prints       ${viaGloss}`);
console.log(`    via a monograph's Sanskrit name   ${viaSanskrit}`);
console.log(`    on an exact name, not a near one  ${resolvedRows - approximate}`);
console.log(`    on an APPROXIMATE name match      ${approximate}  (weaker evidence, flagged per row)`);
console.log(`  of the PLANT rows                   ${plantResolved} of ${plantRows.length}  ${pc(plantResolved, plantRows.length)}`);
console.log('');
console.log(`distinct names                        ${vocabulary.length}`);
for (const st of ['resolved', 'ambiguous', 'unresolved']) {
  const v = vocabulary.filter((x) => x.status === st);
  console.log(`  ${st.padEnd(12)} ${String(v.length).padStart(4)} names  ${String(v.reduce((a, x) => a + x.formularyRows, 0)).padStart(5)} rows`);
}
const amb = vocabulary.filter((x) => x.ambiguous).slice(0, 10);
if (amb.length) {
  console.log('');
  console.log('names the formulary uses for more than one drug:');
  for (const a of amb) {
    console.log(`  ${String(a.formularyRows).padStart(3)}  ${a.name.padEnd(20)} ${a.resolvesTo.map((r) => `${r.monograph} (${r.rows})`).join('  ')}`);
  }
}
const gaps = vocabulary.filter((x) => x.status === 'unresolved' && x.substanceClass === 'plant');
console.log('');
console.log(`plant names with no monograph: ${gaps.length}, carrying ${gaps.reduce((a, x) => a + x.formularyRows, 0)} rows`);
for (const g of gaps.slice(0, 10)) console.log(`  ${String(g.formularyRows).padStart(3)}  ${g.name}`);
if (gaps.length > 10) console.log(`  and ${gaps.length - 10} more`);

if (!WRITE) {
  console.log('');
  console.log('Dry run. Pass --write to write the crosswalk.');
  process.exit(0);
}

const byClass = {};
for (const r of rows) {
  byClass[r.substanceClass] ??= { rows: 0, resolved: 0 };
  byClass[r.substanceClass].rows += 1;
  if (r.monograph) byClass[r.substanceClass].resolved += 1;
}

fs.writeFileSync(OUT, `${JSON.stringify({
  name: 'Ayurvedic Formulary of India ingredient crosswalk',
  description: 'Every ingredient row of the 101 formulary entries transcribed on this site, '
    + 'resolved to a botanical identity where this project holds a monograph for it. Resolution is '
    + 'per row, because the synonym glosses the formulary prints are true of the row they appear '
    + 'on and not of the name everywhere. Every link states its basis, a name used for more than '
    + 'one drug is flagged ambiguous rather than collapsed, and a name nothing here establishes is '
    + 'published as unresolved rather than guessed.',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  basisVocabulary: {
    'printed-gloss, then monograph name': 'the formulary prints a synonym on this row, and that synonym matches a monograph published here',
    'monograph-name': 'the printed name matches, exactly, the name of a monograph published here',
    'monograph-name-approximate': 'the printed name matches a monograph only approximately, by token and consonant skeleton. Weaker evidence, because a vowel can separate two unrelated drugs: Pippali is Piper longum and Pippala is Ficus religiosa.',
    'monograph-sanskrit': "the printed name matches the Sanskrit name in a monograph's own names table",
    unresolved: 'no source in this project establishes an identity for this name; deliberately not guessed',
  },
  summary: {
    ingredientRows: rows.length,
    rowsResolved: resolvedRows,
    rowsResolvedViaAPrintedGloss: viaGloss,
    rowsResolvedOnAnApproximateName: approximate,
    plantRows: plantRows.length,
    plantRowsResolved: plantResolved,
    distinctNames: vocabulary.length,
    namesResolved: vocabulary.filter((x) => x.status === 'resolved').length,
    namesAmbiguous: vocabulary.filter((x) => x.status === 'ambiguous').length,
    namesUnresolved: vocabulary.filter((x) => x.status === 'unresolved').length,
    byClass,
  },
  vocabulary,
  rows,
}, null, 2)}\n`);
console.log('');
console.log(`wrote ${OUT}`);
