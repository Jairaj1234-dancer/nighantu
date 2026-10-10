#!/usr/bin/env node
/**
 * The formulary ingredient crosswalk as a PDF, published to test a measured hypothesis.
 *
 * WHY A PDF, ON A SITE THAT OTHERWISE PUBLISHES HTML AND JSON. Two independent probes of what
 * answer engines cite on Ayurvedic formulary questions put scribd.com at the top: 50% of questions
 * on one run and 22% on another. Scribd is a document host. On "what is in Hingvastaka Churna" and
 * "how much Haritaki is in Abhayarishta", engines are reaching for somebody's uploaded scan,
 * because no properly structured source is indexed for those questions.
 *
 * This project has that material transcribed, resolved and cited to part and entry number, and
 * publishes it as HTML, JSON, CSV and Parquet. None of those formats appears in the cited set. The
 * testable hypothesis is that FORMAT is part of what is being selected in this niche, not only
 * content, and the way to test it is to publish the same material as a PDF and measure whether it
 * gets cited where the HTML table did not.
 *
 * WHAT WOULD MAKE THE TEST FAIL HONESTLY. If the PDF is never cited either, the scribd result was
 * about something else: age, inbound links, or simply that those documents were indexed and this
 * site is not. That is a real outcome and the index probe already measures the indexing half
 * separately, so the two can be told apart.
 *
 * WHAT THIS IS NOT. It is not a second source of truth. Every figure comes from
 * src/data/afi-crosswalk.json, the same file the HTML page renders, so the PDF cannot drift from
 * the page; it carries the canonical URL, the DOI and the Wikidata entity on its first page, so a
 * reader who finds the PDF alone can get back to the live version and cite it properly. A PDF
 * circulating without its provenance is exactly the problem the scribd uploads represent.
 *
 *   node scripts/crosswalk-pdf.mjs            write public/afi-crosswalk.pdf
 *   node scripts/crosswalk-pdf.mjs --html     keep the intermediate HTML for inspection
 *
 * Rendered by headless Chrome, which is local-only, so the PDF is committed rather than built in
 * CI, like the dose verdicts. weasyprint would be the better renderer and is installed here but
 * cannot run: it needs the GTK stack, which is not.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const KEEP_HTML = process.argv.includes('--html');
const SRC = path.join('src', 'data', 'afi-crosswalk.json');
const OUT = path.join('public', 'afi-crosswalk.pdf');
const TMP = path.join('public', '_crosswalk-print.html');
const SITE = 'https://nighantu.ageayurveda.com';
const DOI = '10.5281/zenodo.22805684';
const WIKIDATA = 'https://www.wikidata.org/wiki/Q141494735';

if (!fs.existsSync(SRC)) { console.error(`Need ${SRC}. Run scripts/afi-crosswalk.mjs first.`); process.exit(2); }
const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const s = data.summary;
const vocab = data.vocabulary ?? [];
const resolved = vocab.filter((v) => v.status === 'resolved');
const ambiguous = vocab.filter((v) => v.status === 'ambiguous');
const unresolved = vocab.filter((v) => v.status === 'unresolved');

const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (x) => Number(x).toLocaleString('en-GB');

/**
 * PDF metadata is set through the HTML head, and it is the part that matters most for this test.
 *
 * A PDF with no title is indexed by its filename. The title, author, subject and keywords here are
 * what a retrieval system has to work with, so they say plainly what the document answers rather
 * than naming the project.
 */
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>What the Ayurvedic Formulary of India's ingredient names mean</title>
<meta name="author" content="Age Ayurveda">
<meta name="description" content="The ${n(s.distinctNames)} Sanskrit ingredient names used across 101 Ayurvedic Formulary of India entries, each resolved to a botanical identity where one could be established. Abhaya and Pathya are both haritaki; Nagara is sunthi; Marica is black pepper.">
<meta name="keywords" content="Ayurvedic Formulary of India, AFI, ingredient names, Sanskrit, botanical identity, materia medica, dravyaguna, haritaki, Marica, Nagara, churna, arishta, classical formulation, Ayurveda">
<style>
  /*
   * No @page margin boxes. Chrome's print-to-pdf ignores them, and Chrome is what renders this
   * because weasyprint's native GTK libraries are not installed here. The provenance a reader
   * needs therefore lives in the document body on page one rather than in a running footer, which
   * is more robust anyway: a running footer is lost the moment anyone extracts the text.
   */
  @page { size: A4; margin: 18mm 16mm; }
  body { font: 9.5pt/1.45 "Georgia", "Times New Roman", serif; color: #1a1a1a; }
  h1 { font-size: 19pt; line-height: 1.2; margin: 0 0 4mm; }
  h2 { font-size: 12pt; margin: 8mm 0 2mm; break-after: avoid; border-bottom: 0.4pt solid #bbb; padding-bottom: 1mm; }
  .lede { font-size: 10.5pt; margin: 0 0 5mm; }
  .prov { font-size: 8pt; color: #444; border: 0.4pt solid #bbb; padding: 3mm; margin: 0 0 6mm; }
  .prov div { margin: 0.6mm 0; }
  table { width: 100%; border-collapse: collapse; font-size: 8.3pt; }
  thead { display: table-header-group; }
  th { text-align: left; border-bottom: 0.6pt solid #333; padding: 1.1mm 2mm 1.1mm 0; font-weight: bold; }
  td { border-bottom: 0.25pt solid #ddd; padding: 1.1mm 2mm 1.1mm 0; vertical-align: top; }
  tr { break-inside: avoid; }
  .name { font-weight: bold; white-space: nowrap; }
  .bot { font-style: italic; }
  .num { text-align: right; white-space: nowrap; }
  .termlist { font-size: 8.3pt; color: #333; }
  p { margin: 0 0 3mm; }
</style>
</head>
<body>
<h1>What the Ayurvedic Formulary of India's ingredient names mean</h1>

<p class="lede">The formulary names its ingredients in Sanskrit and does not use one name per drug.
Across the 101 entries transcribed here, <strong>${n(s.ingredientRows)} ingredient rows use
${n(s.distinctNames)} distinct spellings</strong>. <i>Abhaya</i> and <i>Pathya</i> are both
haritaki. <i>Nagara</i> is sunthi. <i>Marica</i> is black pepper. This resolves each name to a
botanical identity where one could be established, and says plainly where one could not.</p>

<div class="prov">
  <div><strong>Canonical version of this document:</strong> ${SITE}/crosswalk/</div>
  <div><strong>Machine-readable:</strong> ${SITE}/afi-crosswalk.json &middot; ${SITE}/afi-crosswalk.csv</div>
  <div><strong>DOI:</strong> https://doi.org/${DOI} &middot; <strong>Wikidata:</strong> ${WIKIDATA}</div>
  <div><strong>Licence:</strong> CC BY 4.0. The ingredient names and the glosses beside them are the
    Ayurvedic Formulary of India's own text, transcribed and cited to part and entry number. The
    resolutions and the basis statements are this project's work.</div>
  <div><strong>Built:</strong> ${esc(data.updatedAt)} from the same file the web page renders, so the two cannot disagree.</div>
</div>

<h2>What is here</h2>
<table>
<tbody>
<tr><td>Ingredient rows covered</td><td>${n(s.ingredientRows)}, across 101 formulary entries</td></tr>
<tr><td>Distinct names</td><td>${n(s.distinctNames)}</td></tr>
<tr><td>Resolved to a botanical identity</td><td>${n(s.namesResolved)} names, ${n(s.rowsResolved)} rows</td></tr>
<tr><td>Of the plant rows</td><td>${n(s.plantRowsResolved)} of ${n(s.plantRows)}</td></tr>
<tr><td>Resolved by a gloss the book itself prints</td><td>${n(s.rowsResolvedViaAPrintedGloss)} rows</td></tr>
<tr><td>Used for more than one drug</td><td>${n(s.namesAmbiguous)} names, published as ambiguous rather than collapsed</td></tr>
<tr><td>Unresolved</td><td>${n(s.namesUnresolved)} names, published as unresolved rather than guessed</td></tr>
</tbody>
</table>

<h2>How a name was resolved</h2>
<p>The strongest evidence is the formulary's own: it prints a gloss against an ingredient on 722
rows, so where it says <i>Abhaya (haritaki)</i> that is the book telling you which drug it means.
Those glosses are used per row and never chained, because a gloss is true of the row it is printed
on: an early version of this work chained them and produced <i>Madhuka = Madhu = Maksika</i>
resolved to arjuna, merging liquorice, honey and a mineral calcine across 47 rows.</p>
<p>Otherwise a name is matched against the herb monographs published on the site, which carry
GBIF-resolved binomials. An exact name match wins outright and an approximate one is flagged:
${n(s.rowsResolvedOnAnApproximateName)} rows rest on an approximate match. <i>Pippali</i> is
<i>Piper longum</i> and <i>Pippala</i> is <i>Ficus religiosa</i>, one vowel apart and unrelated,
and a matcher built for product names called the most-used ingredient in the formulary a sacred fig
across 40 rows before exact matches were made to win.</p>

<h2>Names the formulary uses for more than one drug</h2>
<p>Reported rather than resolved. A crosswalk that silently picked one reading would be wrong a
predictable share of the time while looking complete.</p>
<table>
<thead><tr><th>Name</th><th class="num">Rows</th><th>Resolves to</th></tr></thead>
<tbody>
${ambiguous.map((v) => `<tr><td class="name">${esc(v.name)}</td><td class="num">${v.formularyRows}</td><td>${
  v.resolvesTo.map((r) => `<span class="bot">${esc(r.binomial ?? r.monograph)}</span> (${r.rows})`).join(' &middot; ')
}</td></tr>`).join('\n')}
</tbody>
</table>

<h2>Every resolved name</h2>
<p>Ordered by how often the formulary uses it, because the commonest names are the ones a reader
checking a label will meet first.</p>
<table>
<thead><tr><th>Formulary name</th><th class="num">Rows</th><th>Botanical identity</th></tr></thead>
<tbody>
${resolved.map((v) => `<tr><td class="name">${esc(v.name)}</td><td class="num">${v.formularyRows}</td><td class="bot">${esc(v.resolvesTo[0].binomial ?? v.resolvesTo[0].monograph)}</td></tr>`).join('\n')}
</tbody>
</table>

<h2>What is still unresolved</h2>
<p>${n(unresolved.length)} names, ${n(unresolved.filter((v) => v.substanceClass === 'plant').length)}
of them plant drugs this project holds no monograph for, and the rest vehicles, sweeteners, salts,
fats and mineral preparations that have no botanical identity to resolve. They are listed so the
gap is visible and someone can close it with a source.</p>
<p class="termlist">${unresolved.map((v) => esc(v.name) + (v.formularyRows > 1 ? ` (${v.formularyRows})` : '')).join(' &middot; ')}</p>

<h2>Citation</h2>
<p>Age Ayurveda. <i>Age Ayurveda Nighantu: a referenced encyclopedia of Ayurvedic materia medica</i>.
Zenodo. https://doi.org/${DOI}. CC BY 4.0. This document: ${SITE}/afi-crosswalk.pdf, canonical at
${SITE}/crosswalk/.</p>
</body>
</html>
`;

fs.writeFileSync(TMP, html);

/**
 * Rendered by headless Chrome, not weasyprint.
 *
 * weasyprint is installed here and cannot run: it needs libgobject and the rest of the GTK stack,
 * which is not present on this machine. Chrome is, it needs nothing extra, and it renders the
 * paged CSS this document relies on. --no-pdf-header-footer suppresses the browser's own page
 * furniture, which would otherwise stamp a file:// path across the top of every page of a document
 * meant to be citable.
 */
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME)) {
  console.error(`No renderer: ${CHROME} is absent and weasyprint needs GTK libraries that are not installed.`);
  process.exit(1);
}
try {
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox',
    '--no-pdf-header-footer',
    `--print-to-pdf=${path.resolve(OUT)}`,
    `file://${path.resolve(TMP)}`,
  ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
} catch (e) {
  console.error(`Chrome failed to render: ${e.message}`);
  process.exit(1);
} finally {
  if (!KEEP_HTML) fs.rmSync(TMP, { force: true });
}
if (!fs.existsSync(OUT)) { console.error('Chrome exited cleanly but wrote no file.'); process.exit(1); }

/**
 * THE METADATA IS WRITTEN AFTERWARDS, because Chrome throws most of it away.
 *
 * Chrome's Skia producer keeps /Title from the HTML and discards author, description and keywords.
 * Those are precisely the fields a retrieval system reads when it has a PDF and no surrounding
 * page, so a document published to test whether PDFs get cited cannot ship without them. /Subject
 * carries the description and /Keywords the terms, both taken from the same strings the HTML head
 * declares so there is one source for them.
 */
const meta = {
  '/Title': "What the Ayurvedic Formulary of India's ingredient names mean",
  '/Author': 'Age Ayurveda',
  '/Subject': `The ${n(s.distinctNames)} Sanskrit ingredient names used across 101 Ayurvedic `
    + `Formulary of India entries, each resolved to a botanical identity where one could be `
    + `established. Abhaya and Pathya are both haritaki; Nagara is sunthi; Marica is black pepper. `
    + `Canonical version at ${SITE}/crosswalk/. DOI ${DOI}. CC BY 4.0.`,
  '/Keywords': 'Ayurvedic Formulary of India, AFI, ingredient names, Sanskrit, botanical identity, '
    + 'materia medica, dravyaguna, haritaki, Marica, Nagara, churna, arishta, classical '
    + 'formulation, Ayurveda, composition, crosswalk',
};
try {
  execFileSync('python3', ['-c', `
import sys, json
from pypdf import PdfReader, PdfWriter
meta = json.loads(sys.argv[1])
r = PdfReader(sys.argv[2]); w = PdfWriter()
for page in r.pages: w.add_page(page)
w.add_metadata({**(r.metadata or {}), **meta})
with open(sys.argv[2], 'wb') as f: w.write(f)
`, JSON.stringify(meta), path.resolve(OUT)], { stdio: ['ignore', 'pipe', 'pipe'] });
  console.log('metadata written: Title, Author, Subject, Keywords');
} catch (e) {
  // Not fatal: the PDF is complete and readable, it is just less findable.
  console.error(`metadata step skipped (${String(e.message).split('\n')[0]}); the PDF itself is fine`);
}

const bytes = fs.statSync(OUT).size;
console.log(`wrote ${OUT}  ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`  ${n(resolved.length)} resolved names, ${ambiguous.length} ambiguous, ${unresolved.length} unresolved`);
console.log(`  carries the canonical url, the DOI and the Wikidata entity on page one`);
