#!/usr/bin/env node
/**
 * Build a botanical-identity index from the Ayurvedic Pharmacopoeia of India (API),
 * Part I, Volumes I to VI.
 *
 *   node scripts/api-index.mjs [path/to/api-all.txt]
 *
 * Every API monograph opens with a sentence of one shape:
 *   "Ajamoda consists of dried, aromatic fruits of Apium leptophyllum (Pers.) ... (Fam. Umbelliferae)"
 * That sentence is the official statement of which plant a drug name refers to, so it is
 * extracted by pattern rather than judged. Output: data/sources/api-botanicals.json.
 *
 * The source text is the archive.org OCR layer of the Government of India publication
 * (item AyurvedicPharmacopoeiaOfIndiaAllVolume). It is kept out of git in sources-private/,
 * because it is large and OCR-noisy; only the extracted facts are committed.
 */
import fs from 'node:fs';
import path from 'node:path';

const IN = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? path.join('sources-private', 'api-all.txt');
const OUT = path.join('data', 'sources', 'api-botanicals.json');
const SOURCE = 'https://archive.org/details/AyurvedicPharmacopoeiaOfIndiaAllVolume';

if (!fs.existsSync(IN)) {
  console.error(`missing ${IN}; download the _djvu.txt layer from ${SOURCE}`);
  process.exit(1);
}

const text = fs.readFileSync(IN, 'utf8');

// Volume boundaries, so each record can be cited to a volume.
const volumes = [...text.matchAll(/^VOLUME\s*-\s*([IVX]+)\s*$/gm)].map((m) => ({ at: m.index, vol: m[1] }));
const volumeAt = (i) => [...volumes].reverse().find((v) => v.at <= i)?.vol ?? '?';

// Epithets that follow "Genus" in an OCR line but are not species names.
const NOT_EPITHET = new Set(['syn', 'fam', 'and', 'or', 'var', 'ex', 'linn', 'l']);

const records = [];
const skipped = [];
const RX = /(?:^|\n)[ \t]*([A-Z][A-Za-z\-]+(?:[ \-][A-Za-z]+)?)[ \t]+consists?[ \t]+of[ \t]+([\s\S]{0,420}?)(?:\(Fam\.?[ \t\n]*([A-Za-z]+)\)|\n\n)/g;

for (const m of text.matchAll(RX)) {
  const subject = m[1].trim();
  if (/^(Drug|It|The|This|Powder|Material)$/i.test(subject)) continue;
  const clause = m[2].replace(/\s+/g, ' ');
  // Everything after the last " of " before the genus is the part used.
  const bin = /\bof ((?:the )?[a-z ,\-]*?)?\b([A-Z][a-z]{2,})\s+(×\s*)?([a-z][a-z\-]{2,})\b/.exec(clause);
  if (!bin || NOT_EPITHET.has(bin[4])) { skipped.push({ subject, clause: clause.slice(0, 120) }); continue; }
  const syn = /Syn\.?\s+([A-Z][a-z]{2,})\s+([a-z][a-z\-]{2,})/.exec(clause);
  const heading = text.slice(Math.max(0, m.index - 200), m.index).match(/([A-Z][A-Z\-' ]{2,40})\s*\(([^)]{2,40})\)\s*$/);
  records.push({
    name: subject,
    heading: heading ? `${heading[1].trim()} (${heading[2].trim()})` : null,
    part: heading ? heading[2].trim().toLowerCase() : null,
    binomial: `${bin[2]} ${bin[4]}`,
    synonym: syn ? `${syn[1]} ${syn[2]}` : null,
    family: m[3] ?? null,
    volume: volumeAt(m.index),
    sentence: `${subject} consists of ${clause.slice(0, 240).trim()}`,
  });
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({
  source: 'The Ayurvedic Pharmacopoeia of India, Part I, Volumes I-VI (Government of India)',
  sourceUrl: SOURCE,
  method: 'Pattern extraction of each monograph\'s opening "consists of" sentence. No judgement.',
  count: records.length,
  records,
}, null, 1)}\n`);

console.log(`records  ${records.length}`);
console.log(`skipped  ${skipped.length}`);
console.log(`by vol   ${JSON.stringify(records.reduce((a, r) => ({ ...a, [r.volume]: (a[r.volume] ?? 0) + 1 }), {}))}`);
if (process.argv.includes('--show-skipped')) console.log(skipped);
