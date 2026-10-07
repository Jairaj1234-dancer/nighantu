#!/usr/bin/env node
/**
 * Check every dose that names a text against the one formulary we actually hold.
 *
 * 92 formulation pages end their dosage line with an attribution: "as per Sahasrayogam", "as per
 * AFI Part I", "as per Ashtanga Hridayam". That sentence is a citation, and until now nothing
 * checked it. It is the most load-bearing citation on the site, because it is attached to a
 * dose.
 *
 * WHAT MAKES THIS CHECKABLE. src/data/composition.json carries, for 101 formulations, the
 * Ayurvedic Formulary of India's OWN statement of where each formulation comes from, with a
 * chapter and an entry number: "Sahasrayoga, Tailaprakarana, 11", "Astangahrdaya,
 * Cikitsasthana, Adhyaya 14; 31-32". That is a published formulary's attribution, so it can
 * confirm or contradict the page without anyone owning the classical text itself.
 *
 * WHY THAT MATTERS FOR THE SAHASRAYOGAM. 35 pages cite the Sahasrayogam and no copy of it
 * exists in this project. It cannot simply be bought either: archive.org holds no edition, every
 * edition in print is modern and in copyright, and the editions disagree about their own
 * contents, running from roughly 700 formulations to over 1,200. There is no canonical
 * Sahasrayogam for "as per Sahasrayogam" to refer to.
 *
 * The AFI resolves it anyway. For 12 of the 35 the AFI independently attributes the formulation
 * to Sahasrayoga and gives the locator, so the claim is corroborated and can be made precise.
 * For 14 the AFI names a different text entirely, so the page is wrong and the correction is to
 * hand. For the remainder the AFI is silent, and the honest move is to claim less rather than to
 * keep an attribution nothing supports.
 *
 * WHAT THIS DOES NOT DO. It never touches a dose figure. Whether 15-30 mL of a decoction is the
 * right quantity is a clinical question and not one a provenance check has any standing to
 * answer. It reports only on the attribution, which is an evidentiary claim. Note too that an
 * AFI dose and a page dose can differ legitimately because they measure different things: the
 * AFI's "48 g" for a kashayam is the weight of drug used to prepare the decoction, not the
 * volume taken. So a quantity mismatch is reported as a note to read, never as an error.
 *
 *   node scripts/dose-provenance.mjs            # report
 *   node scripts/dose-provenance.mjs --json     # machine-readable
 */
import fs from 'node:fs';
import path from 'node:path';
import { sanitiseSource, sameSource } from './lib/afi-source.mjs';

const CONTENT = path.join('content', 'formulation');
const COMPOSITION = path.join('src', 'data', 'composition.json');
const AS_JSON = process.argv.includes('--json');

const records = JSON.parse(fs.readFileSync(COMPOSITION, 'utf8')).records ?? {};

/** The texts a page might name, and the pattern that finds each in the AFI's own prose. */
const TEXTS = [
  { name: 'Sahasrayogam', page: /sahasrayog/i, afi: /sahasrayog/i },
  { name: 'Ashtanga Hridayam', page: /ash?t[aā]nga\s*hr[iī]day/i, afi: /astangahrdaya|ashtangahrdaya/i },
  { name: 'Bhaishajya Ratnavali', page: /bhais?ha?jya\s*ratnavali/i, afi: /bhaisajyaratnavali/i },
  { name: 'Sharangdhara Samhita', page: /sh?[aā]ra?[nṅ]gdhara/i, afi: /sarangadharasamhita/i },
  { name: 'Yogaratnakara', page: /yogaratnakara/i, afi: /yogaratnakara/i },
  { name: 'Charaka Samhita', page: /charaka\s*samhita/i, afi: /carakasamhita/i },
  { name: 'Sushruta Samhita', page: /sushruta\s*samhita/i, afi: /susrutasamhita/i },
];

/** An attribution too vague to check, which is itself worth reporting. */
const VAGUE = /\b(classical|traditional)\s+texts?\b|\bphysician\s+direction\b/i;

const corroborated = [];
const contradicted = [];
const uncorroborated = [];
const vague = [];
const quantityNotes = [];

for (const file of fs.readdirSync(CONTENT).filter((f) => f.endsWith('.md'))) {
  const slug = file.replace(/\.md$/, '');
  const md = fs.readFileSync(path.join(CONTENT, file), 'utf8');

  const doseLine = md.match(/\*\*Standard Dosage:\*\*([^\n]*)/)?.[1]?.trim();
  if (!doseLine) continue;

  const rec = records[slug];
  const afiSource = rec?.classicalSource ?? null;

  /**
   * The corrected sentence form, which this gate must also police.
   *
   * After scripts/fix-dose-attributions.mjs ran, the pages no longer say "as per Sahasrayogam"
   * but "The Ayurvedic Formulary of India gives a dose of X and attributes this formula to Y."
   * This gate was written against the old form only, so immediately after the fix it reported
   * zero of everything and declared a pass. A gate that goes quiet because it stopped
   * recognising its subject is worse than no gate: it reads as a clean bill of health. So the
   * new form is checked on its own terms, against the same data that generated it, which is
   * what catches a page edited by hand later into saying something the AFI does not say.
   */
  // Capture the locator to end of line, not to the first period: a locator can legitimately
  // contain one, and stopping early is what produced two false contradictions.
  const stated = doseLine.match(/Ayurvedic Formulary of India(?:\s+gives a dose of\s+([^.]*?))?\s*(?:and\s+)?attributes this formula to\s+(.+)$/i);
  if (stated) {
    const claimedDose = stated[1]?.trim();
    const claimedSource = stated[2]?.trim().replace(/[.\s]+$/, '');
    if (!rec) {
      contradicted.push({ slug, text: 'the AFI', attribution: doseLine,
        afiSource: '(none)', afiNames: 'nothing: this formulation is not in the AFI data held here' });
    } else {
      const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
      // Compare through the shared cleaner: a published string is the SANITISED form, so a raw
      // comparison flags the fix itself as an error.
      if (claimedSource && afiSource && !sameSource(claimedSource, afiSource)) {
        contradicted.push({ slug, text: 'the AFI', attribution: `states "${claimedSource}"`,
          afiSource: sanitiseSource(afiSource), afiNames: 'a different string than the AFI data holds' });
      } else if (claimedDose && rec.dose && norm(claimedDose) !== norm(rec.dose)) {
        contradicted.push({ slug, text: 'the AFI', attribution: `states a dose of "${claimedDose}"`,
          afiSource: rec.dose, afiNames: `the AFI data holds "${rec.dose}"` });
      } else {
        corroborated.push({ slug, text: 'the AFI (explicit)', attribution: 'states the AFI dose and locator', afiSource });
      }
    }
    continue;
  }

  // Only lines that actually make an attribution are in scope.
  const attribution = doseLine.match(/\b(?:as\s+per|per)\s+(.+)$/i)?.[1]?.trim();
  if (!attribution) continue;

  if (VAGUE.test(attribution) && !TEXTS.some((t) => t.page.test(attribution))) {
    vague.push({ slug, attribution });
    continue;
  }

  const named = TEXTS.filter((t) => t.page.test(attribution));
  if (!named.length) continue;

  for (const t of named) {
    if (/\bAFI\b/i.test(attribution) && !afiSource) {
      // The page claims the AFI and the AFI data does not cover this formulation.
      uncorroborated.push({ slug, text: t.name, attribution, why: 'the page names the AFI but this formulation is not in the AFI data held here' });
      continue;
    }
    if (!afiSource) {
      uncorroborated.push({ slug, text: t.name, attribution, why: 'not in the AFI data held here, so nothing corroborates the attribution' });
      continue;
    }
    if (t.afi.test(afiSource)) {
      corroborated.push({ slug, text: t.name, attribution, afiSource });
    } else {
      // Which text does the AFI actually name?
      const actual = TEXTS.find((x) => x.afi.test(afiSource))?.name ?? afiSource.split(/[,;]/)[0];
      contradicted.push({ slug, text: t.name, attribution, afiSource, afiNames: actual });
    }
  }

  if (rec?.dose) {
    const pageQty = doseLine.match(/\d+\s*(?:to|-|–)?\s*\d*\s*(?:mg|g|ml|mL)/i)?.[0];
    if (pageQty && !doseLine.toLowerCase().includes(String(rec.dose).toLowerCase())) {
      quantityNotes.push({ slug, page: pageQty, afi: rec.dose });
    }
  }
}

if (AS_JSON) {
  console.log(JSON.stringify({ corroborated, contradicted, uncorroborated, vague, quantityNotes }, null, 2));
  process.exit(contradicted.length ? 1 : 0);
}

const show = (title, rows, fmt) => {
  console.log(`\n${title} (${rows.length})`);
  for (const r of rows) console.log(`  ${r.slug.padEnd(34)} ${fmt(r)}`);
};

console.log('Dose attributions checked against the AFI\'s own source statements.');
console.log(`corroborated ${corroborated.length}  contradicted ${contradicted.length}  `
  + `uncorroborated ${uncorroborated.length}  too vague to check ${vague.length}`);

if (contradicted.length) {
  show('CONTRADICTED by the AFI, the page names the wrong text', contradicted,
    (r) => `page says ${r.text}; AFI says ${r.afiNames}  [${r.afiSource}]`);
}
if (uncorroborated.length) {
  show('UNCORROBORATED, nothing held here supports or refutes it', uncorroborated,
    (r) => `${r.text}: ${r.why}`);
}
if (vague.length) {
  show('TOO VAGUE TO BE A CITATION', vague, (r) => r.attribution);
}
if (corroborated.length) {
  show('CORROBORATED, and the AFI gives a locator worth citing', corroborated,
    (r) => `${r.text} -> ${r.afiSource}`);
}
if (quantityNotes.length) {
  console.log(`\nQUANTITY DIFFERS FROM THE AFI (${quantityNotes.length}) `
    + 'read before changing anything: for a kashayam the AFI states the weight of drug to '
    + 'prepare the decoction, while the page states the volume taken, so these are often '
    + 'measuring different things rather than disagreeing.');
  for (const q of quantityNotes) console.log(`  ${q.slug.padEnd(34)} page ${q.page}  |  AFI ${q.afi}`);
}

console.log(`\n${contradicted.length ? 'FAIL' : 'PASS'}: a contradicted attribution is a citation error.`);
process.exit(contradicted.length ? 1 : 0);
