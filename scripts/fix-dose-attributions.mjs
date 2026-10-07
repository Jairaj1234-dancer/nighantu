#!/usr/bin/env node
/**
 * Correct the dose attributions that scripts/dose-provenance.mjs finds wrong.
 *
 * THE UNDERLYING ERROR, which is worth naming because it explains every case. These lines
 * attribute a DOSE to a classical text: "1-3 g twice daily before meals, as per Sahasrayogam".
 * But a classical text is the source of the FORMULA. The Ayurvedic Formulary of India is the
 * thing that states doses, and it also states, separately, which classical text each formula
 * comes from. Conflating the two is what produced attributions the AFI itself contradicts: 13 of
 * them, including hinguvachadi-churna credited to the Sahasrayogam when the AFI gives
 * Astangahrdaya, Cikitsasthana, Adhyaya 14; 31-32, and guloochyadi-kashayam credited to it when
 * the AFI gives Sarangadharasamhita.
 *
 * So the correction separates the two claims instead of picking a better text for the dose. The
 * clinical sentence keeps its figures, and a second sentence states what the AFI actually says:
 * its dose, and its attribution of the formula, with the locator.
 *
 * WHAT IT WILL NOT DO. It does not change a dose figure. Whether 1-3 g or the AFI's 2 to 4 g is
 * right is a clinical question, and a provenance script has no standing to answer it. Where the
 * two differ in the same unit the script reports it and leaves both visible, so the conflict is
 * in front of the reader rather than resolved silently by a tool. For a kashayam the figures
 * usually are not in conflict at all: the AFI's weight is the drug used to prepare a decoction,
 * the page's volume is what is taken.
 *
 * Where the AFI holds nothing for a formulation, the attribution is simply removed. 9 pages name
 * the Sahasrayogam or the AFI with nothing here to support either, and since no canonical
 * Sahasrayogam exists to check, the honest move is to claim less rather than to keep a citation
 * that cannot be followed.
 *
 *   node scripts/fix-dose-attributions.mjs            # dry run
 *   node scripts/fix-dose-attributions.mjs --write
 */
import fs from 'node:fs';
import path from 'node:path';
import { sanitiseSource, refuseSource } from './lib/afi-source.mjs';

const CONTENT = path.join('content', 'formulation');
const COMPOSITION = path.join('src', 'data', 'composition.json');
const WRITE = process.argv.includes('--write');

const records = JSON.parse(fs.readFileSync(COMPOSITION, 'utf8')).records ?? {};

const TEXTS = [
  { name: 'Sahasrayogam', page: /sahasrayog\w*/gi, afi: /sahasrayog/i },
  { name: 'Ashtanga Hridayam', page: /ash?t[aā]nga\s*hr[iī]day\w*/gi, afi: /astangahrdaya|ashtangahrdaya/i },
  { name: 'Bhaishajya Ratnavali', page: /bhais?ha?jya\s*ratnavali/gi, afi: /bhaisajyaratnavali/i },
  { name: 'Sharangdhara Samhita', page: /sh?[aā]ra?[nṅ]gdhara\s*samhita/gi, afi: /sarangadharasamhita/i },
  { name: 'Yogaratnakara', page: /yogaratnakara/gi, afi: /yogaratnakara/i },
  { name: 'Charaka Samhita', page: /charaka\s*samhita/gi, afi: /carakasamhita/i },
];

const changes = [];
const conflicts = [];
const skipped = [];
const needsSource = [];

for (const file of fs.readdirSync(CONTENT).filter((f) => f.endsWith('.md'))) {
  const slug = file.replace(/\.md$/, '');
  const full = path.join(CONTENT, file);
  const md = fs.readFileSync(full, 'utf8');

  const m = md.match(/(\*\*Standard Dosage:\*\*)([^\n]*)/);
  if (!m) continue;
  const whole = m[0];
  const body = m[2];

  // The attribution clause: ", as per X" / ". As per X." at the end of the line.
  const attrMatch = body.match(/[,.]\s*(?:as\s+per|per)\s+([^.]*)\.?\s*$/i);
  if (!attrMatch) continue;
  const attribution = attrMatch[1].trim();
  const clinical = body.slice(0, attrMatch.index).trim().replace(/[,.]\s*$/, '');

  const named = TEXTS.filter((t) => new RegExp(t.page.source, 'i').test(attribution));
  const claimsAfi = /\bAFI\b|Ayurvedic Formulary/i.test(attribution);
  if (!named.length && !claimsAfi) {
    // "classical texts", "physician direction" and the like: too vague to be a citation, but
    // not a false attribution either. Left alone; dose-provenance.mjs lists them.
    skipped.push({ slug, attribution, why: 'attribution names no specific text' });
    continue;
  }

  const rec = records[slug];
  if (!rec) {
    // Nothing held here corroborates or refutes it. Claim less: drop the attribution.
    const replacement = `${m[1]} ${clinical}.`;
    changes.push({ slug, full, whole, replacement, kind: 'attribution removed',
      note: `named ${named.map((t) => t.name).join(' / ') || 'the AFI'}; not in the AFI data held here` });
    continue;
  }

  const refusal = rec.classicalSource ? refuseSource(rec.classicalSource) : null;
  if (refusal) {
    // Do not publish a damaged locator. Strip the unsupportable attribution and report it.
    changes.push({ slug, full, whole, replacement: `${m[1]} ${clinical}.`,
      kind: 'source refused', note: refusal });
    needsSource.push({ slug, raw: rec.classicalSource, why: refusal });
    continue;
  }
  const afiSource = rec.classicalSource ? sanitiseSource(rec.classicalSource) : null;
  const wrong = named.filter((t) => afiSource && !t.afi.test(rec.classicalSource));
  const right = named.filter((t) => afiSource && t.afi.test(rec.classicalSource));

  if (!wrong.length && right.length && !claimsAfi) {
    // Attribution is corroborated and names only correct texts. Make it precise by giving the
    // AFI's locator, which is the thing that makes it checkable.
    const sentence = `${m[1]} ${clinical}. The Ayurvedic Formulary of India`
      + `${rec.dose ? ` gives a dose of ${rec.dose} and` : ''} attributes this formula to `
      + `${afiSource}.`;
    if (sentence === whole) continue;
    changes.push({ slug, full, whole, replacement: sentence, kind: 'locator added',
      note: `${right.map((t) => t.name).join(' / ')} corroborated by the AFI` });
  } else {
    // Either a named text is contradicted, or the line claims the AFI and should say what the
    // AFI says. Replace the attribution with the AFI's own two statements.
    const sentence = `${m[1]} ${clinical}. The Ayurvedic Formulary of India`
      + `${rec.dose ? ` gives a dose of ${rec.dose} and` : ''} attributes this formula to `
      + `${afiSource}.`;
    changes.push({ slug, full, whole, replacement: sentence,
      kind: wrong.length ? 'wrong text replaced' : 'AFI claim made specific',
      note: wrong.length
        ? `page said ${wrong.map((t) => t.name).join(' / ')}; AFI says ${afiSource}`
        : `claimed the AFI without saying what it states` });
  }

  // Same-unit quantity disagreements are a clinical matter, reported not resolved.
  if (rec.dose) {
    const unit = (s) => (String(s).match(/\b(mg|g|ml)\b/i) ?? [])[1]?.toLowerCase();
    const pageQ = clinical.match(/[\d.]+\s*(?:to|-|–)\s*[\d.]+\s*(?:mg|g|mL|ml)/i)?.[0];
    if (pageQ && unit(pageQ) && unit(pageQ) === unit(rec.dose)) {
      const nums = (s) => (String(s).match(/[\d.]+/g) ?? []).map(Number);
      const [a1, a2] = nums(pageQ);
      const [b1, b2] = nums(rec.dose);
      if (a1 !== b1 || a2 !== b2) conflicts.push({ slug, page: pageQ, afi: rec.dose });
    }
  }
}

const byKind = {};
for (const c of changes) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;

console.log(`pages to change   ${changes.length}`);
for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`);
console.log(`left alone        ${skipped.length} (attribution names no specific text)`);

console.log('\nCHANGES:');
for (const c of changes) {
  console.log(`\n  ${c.slug}  [${c.kind}]`);
  console.log(`    why: ${c.note}`);
  console.log(`    was: ${c.whole.slice(0, 150)}`);
  console.log(`    now: ${c.replacement.slice(0, 190)}`);
}

if (needsSource.length) {
  console.log(`\nAFI SOURCE STRING NOT PUBLISHABLE (${needsSource.length}); attribution stripped, wants a human:`);
  for (const n of needsSource) {
    console.log(`  ${n.slug}`);
    console.log(`    raw: ${JSON.stringify(n.raw).slice(0, 170)}`);
    console.log(`    why: ${n.why}`);
  }
}

if (conflicts.length) {
  console.log(`\nSAME-UNIT DOSE DISAGREEMENTS (${conflicts.length}) NOT changed by this script.`);
  console.log('These are not unit mismatches: the page and the AFI state different quantities in');
  console.log('the same unit. Changing a dose is a clinical decision, so both are now visible on');
  console.log('the page and the figures want a human.');
  for (const c of conflicts) console.log(`  ${c.slug.padEnd(32)} page ${c.page}  |  AFI ${c.afi}`);
}

if (!WRITE) {
  console.log('\nDry run. Pass --write to apply.');
  process.exit(0);
}
for (const c of changes) {
  const md = fs.readFileSync(c.full, 'utf8');
  fs.writeFileSync(c.full, md.replace(c.whole, c.replacement));
}
console.log(`\nwrote ${changes.length} page(s)`);
