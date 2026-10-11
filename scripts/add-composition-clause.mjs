#!/usr/bin/env node
/**
 * Give 14 answer blocks a sentence that says what the substance actually is.
 *
 * All five salt pages carry the IDENTICAL answer, word for word:
 *
 *   Saindhava Lavana is a salt or alkali preparation used in Ayurveda.
 *   Samudra Lavana  is a salt or alkali preparation used in Ayurveda.
 *   Souvarchala Lavana is a salt or alkali preparation used in Ayurveda.
 *   Vida Lavana     is a salt or alkali preparation used in Ayurveda.
 *   Yavakshara      is a salt or alkali preparation used in Ayurveda.
 *
 * and eight animal-derived pages carry another identical sentence between them. A searcher who
 * wants to know which salt they are looking at is told nothing, and five pages compete on one
 * description. Saindhava is rock salt at 97-99% NaCl; Samudra is sea salt at 85-90%; Yavakshara is
 * not a chloride at all but potassium carbonate from barley ash. The pages know all of that.
 *
 * I DIAGNOSED THIS WRONG TWICE BEFORE GETTING HERE, which is worth recording because the wrong
 * answers were both plausible. First reading: these pages are thin and need content written.
 * False, isabgol has a 1374-word body and the salts carry 420 to 560 words each. Second reading:
 * answer.mjs failed to compose from that body. Also false, and it failed CORRECTLY: those bodies
 * are bullet lists of chemical names and labelled manufacturing fields, not prose, and
 * sentenceList is looking for sentences. There was nothing for it to find.
 *
 * What is there is grounded compositional data, in the same position on every page, and that is
 * what these clauses are built from.
 *
 * WHY THESE ARE WRITTEN OUT RATHER THAN GENERATED. The bullets are too varied in shape to
 * transform mechanically: "Sodium chloride (NaCl) - 97-99%", "Water (95%)", "Sugars: fructose
 * (38%), glucose (31%)", "Muscone (3-methylcyclopentadecanone) - primary active component". A
 * parser for all of those would be guesswork with a regex. 14 is a readable number, so each clause
 * is written from its page's own bullets, the bullet is quoted beside it, and VERIFY below checks
 * every figure in the clause against the page before anything is written.
 *
 * FOUR PAGES ARE EXCLUDED AND THE REASON IS A SEPARATE DEFECT. isabgol, jyotishmati, camphor and
 * menthol all give their composition as "Derived from constituent herbs (see individual herb
 * profiles)", which is boilerplate and, on these pages, false: isabgol is Plantago ovata husk and
 * menthol is a single compound, so neither is derived from constituent herbs. Composing a sentence
 * over that would bury the problem. They are reported instead.
 *
 *   node scripts/add-composition-clause.mjs            report what would change
 *   node scripts/add-composition-clause.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';
import { answerViolations } from './lib/answer-safety.mjs';

const WRITE = process.argv.includes('--write');
const DIR = path.join('content', 'herb');

/**
 * clause: the sentence appended. from: the bullet(s) it was written from, quoted so the two can be
 * compared without opening the page.
 */
const CLAUSES = {
  'saindhava-lavana': {
    clause: 'It is rock salt, 97-99% sodium chloride, carrying up to 84 trace minerals including potassium, magnesium, calcium and the iron that colours some varieties pink.',
    from: 'Sodium chloride (NaCl) - 97-99% / Up to 84 trace minerals and elements / Iron (responsible for pink color in some varieties)',
  },
  'samudra-lavana': {
    clause: 'It is sea salt, 85-90% sodium chloride, with magnesium chloride and sulfate, calcium sulfate and potassium chloride making up the rest.',
    from: 'Sodium chloride (NaCl) - 85-90% / Magnesium chloride and sulfate / Calcium sulfate / Potassium chloride',
  },
  'souvarchala-lavana': {
    clause: 'It is sodium chloride combined with sodium sulfide and sodium sulfate, and the hydrogen sulfide it carries gives it an egg-like odour.',
    from: 'Sodium chloride with sodium sulfide / Sodium sulfate (Na2SO4) / Hydrogen sulfide (H2S - volatile, gives egg-like odor)',
  },
  'vida-lavana': {
    clause: 'Sodium chloride is its primary component, with sodium sulfate and the sodium sulfide responsible for its sulfurous smell.',
    from: 'Sodium chloride (NaCl) - primary component / Sodium sulfate (Na2SO4) / Sodium sulfide (Na2S) - responsible for egg-like sulfurous smell',
  },
  yavakshara: {
    clause: 'It is not a chloride but an alkali: potassium carbonate as its primary component, with sodium carbonate and silica from the barley epidermis it is made from.',
    from: 'Potassium carbonate (K2CO3) - primary component / Sodium carbonate (Na2CO3) / Silica (from barley plant epidermis)',
  },
  madhu: {
    clause: 'It is honey: fructose at 38% and glucose at 31% with maltose and sucrose, the enzymes glucose oxidase, diastase and invertase, and gluconic acid as its main organic acid.',
    from: 'Sugars: fructose (38%), glucose (31%), maltose, sucrose / Enzymes: glucose oxidase, diastase, invertase, catalase / Organic acids: gluconic acid (primary)',
  },
  ghrita: {
    clause: 'It is clarified butter, carrying butyric acid at 3-4%, oleic acid at about 25% alongside palmitic and stearic acids, and conjugated linoleic acid.',
    from: 'Short-chain fatty acids: butyric acid (3-4%) / Long-chain fatty acids: oleic acid (25%), palmitic, stearic, myristic / Conjugated linoleic acid (CLA)',
  },
  dadhi: {
    clause: 'It is curd, set by Lactobacillus bulgaricus and Streptococcus thermophilus, and the lactic acid they produce both sours it and raises the bioavailability of its calcium above milk.',
    from: 'Lactic acid bacteria (Lactobacillus bulgaricus, Streptococcus thermophilus) / Lactic acid (responsible for sour taste) / Calcium (higher bioavailability than milk due to lactic acid)',
  },
  takra: {
    clause: 'It is buttermilk, carrying Lactobacillus and Leuconostoc species, lactic acid and short-chain organic acids, and the sphingolipids and phospholipids of the milk fat globule membrane.',
    from: 'Lactic acid bacteria (Lactobacillus, Leuconostoc species) / Lactic acid and short-chain organic acids / Sphingolipids and phospholipids (from milk fat globule membrane)',
  },
  godugdha: {
    clause: 'It is cow milk, carrying the alpha-s1, alpha-s2, beta and kappa caseins, whey proteins including lactoferrin and immunoglobulins, and the A2 beta-casein found in indigenous Indian breeds such as Gir and Sahiwal.',
    from: 'Casein proteins (alpha-s1, alpha-s2, beta, kappa casein) / Whey proteins: lactoferrin (7.3%), immunoglobulins (17.1%) / A2 beta-casein (in indigenous Indian breeds like Gir, Sahiwal)',
  },
  gomutra: {
    clause: 'It is cow urine, 95% water with urea at 2.5% and a further 2.5% of minerals and salts, plus the enzymes urokinase and creatinine.',
    from: 'Water (95%) / Urea (2.5%) / Minerals and 24 types of salts (2.5%) / Enzymes (urokinase, creatinine)',
  },
  gorochana: {
    clause: 'It is a bovine biliary concretion, carrying the bile salts cholate, deoxycholate and taurocholate, the bilirubin and biliverdin that colour it, and the amino acid taurine.',
    from: 'Bile salts: cholate, deoxycholate, taurocholate, chenodeoxycholate / Bilirubin and biliverdin (responsible for color) / Amino acids: taurine, cysteine',
  },
  kasturi: {
    clause: 'Its primary active component is muscone, with muscopyridine and muscopyranol alongside cholesterol and fatty acids.',
    from: 'Muscone (3-methylcyclopentadecanone) - primary active component / Muscopyridine and muscopyranol / Cholesterol and fatty acids',
  },
  ikshu: {
    clause: 'Its juice carries 12-17% sucrose, with the polyphenols chlorogenic, caffeic and cinnamic acid and the flavonoids luteolin, apigenin and tricin.',
    from: 'Sucrose (12-17% in juice) / Polyphenols: chlorogenic acid, caffeic acid, cinnamic acid / Flavonoids: luteolin, apigenin, tricin',
  },
};

/** Pages whose composition section is boilerplate, reported rather than written over. */
const PLACEHOLDER = /Derived from constituent herbs|Standardized on primary bioactive/i;

/** The page's composition section, as plain text with links flattened. */
function compositionOf(md) {
  const sec = md.split(/\n## /).find((p) => /^(Key Phytochemical Constituents|What is it made of\?)/.test(p));
  return sec ? sec.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') : '';
}

const changed = [];
const refused = [];
const flagged = [];

for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith('.md')) continue;
  const slug = f.replace(/\.md$/, '');
  const file = path.join(DIR, f);
  const raw = fs.readFileSync(file, 'utf8');
  const m = /^answer:\s*"(.*?)"\s*$/m.exec(raw);
  if (!m) continue;

  const comp = compositionOf(raw);
  if (comp && PLACEHOLDER.test(comp) && (m[1].match(/\S+/g) || []).length <= 12) {
    flagged.push([slug, 'composition section is boilerplate: "Derived from constituent herbs", which is also false for this page']);
    continue;
  }

  const spec = CLAUSES[slug];
  if (!spec) continue;

  /**
   * VERIFY EVERY FIGURE AGAINST THE PAGE before writing. These clauses are written by hand from the
   * bullets, so the failure mode is a number I typed wrong or remembered, and that is exactly the
   * class of error this project keeps finding in its own output. A figure in the clause that the
   * composition section does not contain means the clause is refused, not corrected.
   */
  const figures = [...new Set(spec.clause.match(/\d+(?:\.\d+)?/g) ?? [])];
  const missing = figures.filter((n) => !comp.includes(n));
  if (missing.length) { refused.push([slug, `figures not found in the page's composition section: ${missing.join(', ')}`]); continue; }

  const next = `${m[1].replace(/\s*$/, '')} ${spec.clause}`;
  if (next.includes('"')) { refused.push([slug, 'quote would break frontmatter']); continue; }
  const v = answerViolations(next, { kind: 'herb' });
  if (v.length) { refused.push([slug, `gate refused: ${JSON.stringify(v)}`]); continue; }

  changed.push({ slug, before: m[1], after: next, figures, from: spec.from });
  if (WRITE) fs.writeFileSync(file, raw.replace(m[0], `answer: "${next}"`));
}

const words = (s) => (s.match(/\S+/g) || []).length;
console.log(`${changed.length} composition clauses added, ${refused.length} refused, ${flagged.length} flagged.\n`);
for (const c of changed) {
  console.log(`  ${c.slug}   ${words(c.before)} -> ${words(c.after)} words, figures checked: ${c.figures.join(', ') || 'none'}`);
  console.log(`    now:  ${c.after}`);
  console.log(`    from: ${c.from}`);
  console.log();
}
if (refused.length) {
  console.log('REFUSED:');
  for (const [k, why] of refused) console.log(`   ${k}  ${why}`);
}
if (flagged.length) {
  console.log('\nFLAGGED, a separate content defect rather than something to write over:');
  for (const [k, why] of flagged) console.log(`   ${k}  ${why}`);
}
if (!WRITE) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
