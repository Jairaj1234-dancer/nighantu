#!/usr/bin/env node
/**
 * What the label says to take, against what the formulary says to take.
 *
 * WHY THIS IS THE COMPARISON NOBODY CAN PUBLISH ABOUT THEMSELVES. A manufacturer can state its own
 * dose and nothing more. The Ayurvedic Formulary of India states a dose for 51 of the 101 entries
 * transcribed on this site. Putting the two side by side for the same named classical preparation
 * answers a question no brand page can: when ten companies all sell Saraswatarishta, do they agree
 * with the standard they all name, and with each other.
 *
 * WHY THE JUDGEMENT IS NOT MADE BY THIS SCRIPT. It was tried. Four successive hand-written
 * patterns over the collected label text each produced numbers that were wrong about named
 * companies, and the failures were not subtle:
 *
 *   "1/2-1 g" read as a range of 2 to 1 rather than half a gram to one gram.
 *   "15 ml to 25 ml" read as a flat 15 because the pattern wanted the unit after the second bound.
 *   A child dose on the same page as an adult dose, compared to the formulary's adult figure.
 *   A daily total compared to a per-administration figure.
 *
 * Every one of those would have published a false statement about a named manufacturer's dose. So
 * the comparison is made by a judgement pass, one agent per preparation reading the collected text,
 * and then every comparable verdict is re-checked by a second adversarial pass that defaults to
 * refusing. That pass refuted two claims out of 62, both correctly, and both would have been wrong
 * in print: one treated a figure that is Kerala Ayurveda's published CHILD dose as an adult dose,
 * and one compared a stated daily total to the formulary's per-dose weight.
 *
 * WHAT IS AND IS NOT COMPARABLE, which turned out to be the finding.
 *
 * Of 118 product pages where the formulary and the label BOTH state an amount, only 62 can be
 * compared at all. The reasons are not evenly spread:
 *
 *   24  the label counts tablets and never states what one tablet weighs
 *   17  the formulary figure is the weight of drug used to PREPARE a decoction, not the amount
 *       swallowed, so a ready-made kashayam volume is a different dimension. This is a property
 *       of the formulary and not a failing of the company.
 *    7  the label gives only a household measure with no gram or millilitre equivalent
 *    5  a different preparation class sold under the same classical name
 *    2  the label states no adult amount at all
 *
 * The first is the one that matters, because it is a disclosure choice. A company selling a
 * classical preparation as tablets, naming the formulary entry, and never printing a milligram
 * figure per tablet has published a product that cannot be checked against the standard it claims.
 *
 * WHAT THIS REFUSES TO SAY. Nothing here is a safety claim and nothing here is a finding that any
 * dose is wrong. A manufacturer may differ from the formulary for legitimate reasons: a different
 * preparation strength, a different indication, a modern clinical convention. The formulary dose is
 * a published standard, not a ceiling, and this records the relation between two published figures
 * and stops there. That restriction is also the house rule in scripts/dose-provenance.mjs, which
 * states that whether a quantity is clinically right "is not one a provenance check has any
 * standing to answer".
 *
 *   node scripts/dose-comparison.mjs --verdicts <file.json>   build src/data and public/
 *   node scripts/dose-comparison.mjs --dry-run                report only
 */
import fs from 'node:fs';
import path from 'node:path';

const ARG = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const DRY = process.argv.includes('--dry-run');
/**
 * The judgement pass's output is COMMITTED, at src/data/dose-verdicts.json, and is the default
 * input here.
 *
 * It has to be. The gate below holds the page's tables and prose figures against this dataset, and
 * a gate whose input lives in a scratchpad directory on one laptop is not a gate, it is a thing
 * that passed once. Committing the verdicts also means the judgement that produced every published
 * row, including the two it refused, can be read by anyone checking the page, which is the same
 * standard the rest of this site's claims are held to.
 */
const VERDICTS = ARG('--verdicts') ?? path.join('src', 'data', 'dose-verdicts.json');
const SITE = 'https://nighantu.ageayurveda.com';
const OUT = path.join('src', 'data', 'dose-comparison.json');

if (!fs.existsSync(VERDICTS)) { console.error(`No verdicts at ${VERDICTS}`); process.exit(2); }
const { compare, verify } = JSON.parse(fs.readFileSync(VERDICTS, 'utf8'));
const composition = JSON.parse(fs.readFileSync(path.join('src', 'data', 'composition.json'), 'utf8')).records;

const verifyOf = new Map(verify.map((v) => [v.formulation, v]));

/**
 * A claim survives only if the adversarial pass named its brand as confirmed.
 *
 * Not "was not refuted": NAMED as confirmed. The difference matters where a verifier returned for
 * some brands and not others, because silence about a claim is not a check of it, and this table
 * states figures about companies by name.
 */
const preparations = [];
let comparable = 0; let published = 0; let withheld = 0;
const withheldRows = [];
const notComparable = [];

for (const c of compare) {
  const v = verifyOf.get(c.formulation);
  const confirmed = new Set(v?.confirmedBrands ?? []);
  const refutedBy = new Map((v?.refuted ?? []).map((r) => [r.brand, r]));
  const rec = composition[c.formulation];
  const labels = [];
  for (const l of c.labels ?? []) {
    if (!l.comparable) {
      notComparable.push({ formulation: c.formulation, brand: l.brand, url: l.url,
        reason: l.notComparableReason ?? null, quote: l.quote ?? null });
      continue;
    }
    comparable++;
    if (!confirmed.has(l.brand)) {
      withheld++;
      withheldRows.push({ formulation: c.formulation, brand: l.brand, url: l.url,
        why: refutedBy.get(l.brand)?.problem ?? 'the adversarial check did not confirm this claim',
        correction: refutedBy.get(l.brand)?.correction ?? null });
      continue;
    }
    published++;
    labels.push({ brand: l.brand, url: l.url, population: l.population ?? 'unstated',
      low: l.adultLow ?? null, high: l.adultHigh ?? null, unit: l.unit ?? null,
      quote: l.quote ?? null, relation: l.relation ?? null });
  }
  if (!labels.length && !notComparable.some((n) => n.formulation === c.formulation)) continue;
  preparations.push({
    formulation: c.formulation,
    afiPart: rec?.afiPart ?? null,
    afiEntry: rec?.entryNumber ?? null,
    afiHeading: rec?.entryHeading ?? null,
    afiDose: rec?.dose ?? null,
    afiDoseMeans: c.afiDoseMeans ?? null,
    classNote: c.classNote ?? null,
    comparedLabels: labels,
  });
}

const rel = {};
for (const p of preparations) for (const l of p.comparedLabels) rel[l.relation] = (rel[l.relation] ?? 0) + 1;

console.log(`preparations judged        ${compare.length}`);
console.log(`label pages, both stated   ${comparable + notComparable.length}`);
console.log(`  comparable               ${comparable}`);
console.log(`  published after check    ${published}`);
console.log(`  withheld on the check    ${withheld}`);
console.log(`  not comparable           ${notComparable.length}`);
console.log(`relations published        ${JSON.stringify(rel)}`);
for (const w of withheldRows) console.log(`  withheld: ${w.formulation} / ${w.brand}`);

/**
 * The gate. A published row must carry a quote, both bounds, a unit and a relation.
 *
 * A row missing any of those is a figure about a named company with part of its evidence absent,
 * and the whole reason this table can exist is that every cell can be checked against the
 * manufacturer's own page.
 */
const bad = [];
for (const p of preparations) {
  for (const l of p.comparedLabels) {
    if (l.low == null || l.high == null || !l.unit || !l.quote || !l.relation) {
      bad.push(`${p.formulation} / ${l.brand}: published row is missing ${
        [['an amount', l.low == null || l.high == null], ['a unit', !l.unit],
          ['the label\'s own words', !l.quote], ['a relation', !l.relation]]
          .filter(([, missing]) => missing).map(([what]) => what).join(', ')}`);
    }
    if (l.high < l.low) bad.push(`${p.formulation} / ${l.brand}: range runs backwards (${l.low} to ${l.high})`);
  }
  if (p.comparedLabels.length && !p.afiDose) bad.push(`${p.formulation}: compared rows but no formulary dose`);
}
if (bad.length) {
  console.error('\nREFUSING TO WRITE:');
  for (const b of bad) console.error(`  ${b}`);
  process.exit(1);
}
console.log('row gate                   clean: every published row carries an amount, a unit, the label\'s own words and a relation');

if (DRY) { console.log('\nDry run. Nothing written.'); process.exit(0); }

const payload = {
  name: 'Label dose against the Ayurvedic Formulary of India',
  description: 'For classical preparations where the Ayurvedic Formulary of India states a dose, '
    + 'what each manufacturer states on its own product page, and how the two relate. Every row '
    + 'carries the manufacturer\'s own words and the URL they were read from.',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  measuredOn: '2026-10-09',
  method: 'Label text was collected deterministically from each manufacturer\'s own product page. '
    + 'The comparison itself was judged by a model, one pass per preparation, and every comparable '
    + 'verdict was then re-checked by a second adversarial pass that defaults to refusing. A claim '
    + 'is published only where that second pass named it confirmed. Two of 62 were withheld.',
  limits: 'This states the relation between two published figures and nothing else. It is not a '
    + 'safety assessment and not a finding that any dose is wrong. A manufacturer may differ from '
    + 'the formulary for legitimate reasons including preparation strength and indication. Where '
    + 'the formulary figure is the weight of drug used to prepare a decoction rather than the '
    + 'amount swallowed, no comparison is drawn.',
  summary: {
    preparationsJudged: compare.length,
    labelPagesWhereBothStatedAnAmount: comparable + notComparable.length,
    comparable,
    published,
    withheldOnTheAdversarialCheck: withheld,
    notComparable: notComparable.length,
    relations: rel,
  },
  preparations,
  withheld: withheldRows,
  notComparable,
};

fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
fs.writeFileSync(path.join('public', 'dose-comparison.json'), `${JSON.stringify(payload, null, 2)}\n`);

const cell = (v) => (v == null || v === '' ? '' : `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`);
const csv = [['formulation', 'afi_part', 'afi_entry', 'afi_dose', 'afi_dose_means', 'company',
  'label_low', 'label_high', 'unit', 'population', 'relation', 'label_own_words', 'product_url',
  'formulation_page'].join(',')];
for (const p of preparations) {
  for (const l of p.comparedLabels) {
    csv.push([p.formulation, p.afiPart, p.afiEntry, p.afiDose, p.afiDoseMeans, l.brand,
      l.low, l.high, l.unit, l.population, l.relation, l.quote, l.url,
      `${SITE}/formulation/${p.formulation}/`].map(cell).join(','));
  }
}
fs.writeFileSync(path.join('public', 'dose-comparison.csv'), `${csv.join('\n')}\n`);

console.log(`\nwrote ${OUT}`);
console.log(`published public/dose-comparison.json and public/dose-comparison.csv (${csv.length - 1} compared rows)`);

/**
 * The page's table, generated between sentinels rather than typed.
 *
 * Same mechanism as scripts/brand-disclosure.mjs and for the same reason: 60 rows of figures about
 * named companies are not something to maintain by hand, and a table that can drift from the
 * dataset behind it will. `--check` fails if the file and the data disagree, so CI holds them
 * together.
 */
const PAGE = path.join('content', 'choosing', 'label-dose-against-the-formulary.md');
const BEGIN = '<!-- BEGIN generated by scripts/dose-comparison.mjs -->';
const END = '<!-- END generated by scripts/dose-comparison.mjs -->';
const CHECK = process.argv.includes('--check');

const NAMES = Object.fromEntries((JSON.parse(fs.readFileSync(path.join('src', 'data', 'brand-disclosure.json'), 'utf8'))
  .companies ?? []).map((c) => [c.id, c.name]));
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const RELATION_WORD = {
  identical: 'the same',
  overlapping: 'overlapping',
  'entirely higher': 'entirely above',
  'entirely lower': 'entirely below',
};

const lines = [BEGIN, ''];
for (const p of preparations.filter((x) => x.comparedLabels.length)) {
  lines.push(`### ${p.afiHeading ?? p.formulation}`, '');
  lines.push(`The formulary states **${p.afiDose}** (Ayurvedic Formulary of India part ${p.afiPart}, `
    + `entry ${p.afiEntry}). The composition is at [/formulation/${p.formulation}/](../../formulation/${p.formulation}/).`, '');
  lines.push('| Company | States | Against the formulary | In their own words |');
  lines.push('|---|---|---|---|');
  for (const l of p.comparedLabels.slice().sort((a, b) => (a.low ?? 0) - (b.low ?? 0))) {
    const amount = l.low === l.high ? `${l.low} ${l.unit}` : `${l.low} to ${l.high} ${l.unit}`;
    lines.push(`| ${esc(NAMES[l.brand] ?? l.brand)} | ${esc(amount)} | ${esc(RELATION_WORD[l.relation] ?? l.relation)} | ${esc(l.quote)} |`);
  }
  lines.push('');
}
lines.push(`Every cell was read on ${payload.measuredOn}. ${published} rows across `
  + `${preparations.filter((x) => x.comparedLabels.length).length} preparations.`, '', END);
const block = lines.join('\n');

const current = fs.readFileSync(PAGE, 'utf8');
const b = current.indexOf(BEGIN);
const e = current.indexOf(END);
if (b < 0 || e < 0) {
  console.error(`FAIL: ${PAGE} is missing the generated-block sentinels.`);
  process.exit(1);
}
const next = current.slice(0, b) + block + current.slice(e + END.length);

if (CHECK) {
  if (next !== current) {
    console.error(`FAIL: ${PAGE} does not match ${OUT}.`);
    console.error('Run `node scripts/dose-comparison.mjs --verdicts <file>` and commit the result.');
    process.exit(1);
  }
  /**
   * The prose figures, which the generated block does not cover.
   *
   * Same gate as the disclosure page, and it exists because that page carried a wrong dose total
   * in public for a day: the table regenerated itself and a sentence three paragraphs away still
   * stated the old number. Each load-bearing total must appear somewhere in the prose.
   */
  const prose = current.slice(0, b) + current.slice(e + END.length);
  const checks = [
    ['comparable pages', comparable],
    ['published rows', published],
    ['withheld on the check', withheld],
    ['not comparable', notComparable.length],
    ['pages where both stated an amount', comparable + notComparable.length],
    ...Object.entries(rel).map(([k, v]) => [`rows ${k}`, v]),
  ];
  const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
    'nineteen', 'twenty'];
  const missing = [];
  for (const [label, value] of checks) {
    const forms = [String(value), Number(value).toLocaleString('en-GB')];
    if (value <= 20) forms.push(WORD[value]);
    if (!forms.some((f) => new RegExp(`(?<![\\w,.])${f}(?![\\w%])`, 'i').test(prose))) {
      missing.push(`${label}: ${value} appears nowhere in the prose`);
    }
  }
  if (missing.length) {
    console.error(`FAIL: ${missing.length} figure(s) are absent from the page's prose.`);
    for (const m of missing) console.error(`  ${m}`);
    process.exit(1);
  }
  console.log(`prose figures      ${checks.length} totals all present`);
  console.log(`${PAGE} agrees with ${OUT}`);
} else if (next !== current) {
  fs.writeFileSync(PAGE, next);
  console.log(`updated the generated table in ${PAGE}`);
} else {
  console.log(`${PAGE} was already current`);
}
