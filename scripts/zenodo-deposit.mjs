#!/usr/bin/env node
/**
 * Put the actual data files in the Zenodo deposit, instead of a zip of the repository.
 *
 * WHAT IS WRONG TODAY. The concept DOI 10.5281/zenodo.22805684 is advertised on this site as the
 * persistent identifier for nineteen Dataset records. It resolves to version record 22805685, which
 * is correctly typed as a Dataset and contains exactly one file: a 7.5 MB archive of the GitHub
 * repository, deposited by the GitHub release integration. So a researcher who follows the DOI
 * expecting the data finds a source tree, and has to know this project's layout to get a CSV out of
 * it. Every dataset here is individually downloadable from the site and none of them is
 * individually downloadable from the archive, which is the wrong way round: the site can change and
 * the archive is the thing that is supposed to still be there in ten years.
 *
 * WHAT THIS DOES. Creates a NEW VERSION of record 22805685, which keeps the concept DOI pointing at
 * the newest version and keeps every existing citation of it valid, then uploads the data files
 * individually along with a manifest describing each one. It does NOT create a new deposition: the
 * script this replaces called POST /deposit/depositions with an empty body, which mints an
 * unrelated DOI and would have quietly orphaned the identifier the whole site now advertises.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never publishes. A published Zenodo version is permanent and
 * cannot be withdrawn, so this leaves the draft for a person to review in the Zenodo interface and
 * publish themselves. The review URL is printed at the end. Nothing here is irreversible: a draft
 * can be discarded.
 *
 * WHY RELEASES NO LONGER ARCHIVE THEMSELVES, which is a deliberate change and not a lapse.
 *
 * This repository had a Zenodo webhook firing on `release`, and that webhook is what created the
 * zip-only deposit in the first place. Leaving it armed would have undone this on the next release:
 * a new version containing one repository archive, becoming the newest version, so the concept DOI
 * would resolve to a zip again and the fix would silently expire. The webhook (id 680623506) was
 * therefore disabled on 9 October 2026, by `gh api -X PATCH .../hooks/680623506 -F active=false`.
 * It is disabled rather than deleted, so re-enabling it is one call if that turns out to be wrong.
 *
 * Nothing is lost by disabling it, and this was checked rather than assumed. The source is archived
 * independently by Software Heritage, through a second webhook that fires on PUSH rather than on
 * release: at the time of writing that origin has 108 visits with full snapshots, the most recent
 * the same day. So the division is now the one the record types already imply. Software Heritage
 * holds the code, continuously. Zenodo holds the data, under a DOI typed `dataset`.
 *
 * The consequence to remember: depositing is now a deliberate act. Run this script when the
 * datasets have moved enough to be worth a new version, and expect nothing to happen on its own.
 *
 *   node scripts/zenodo-deposit.mjs                    report what would be deposited, contact nobody
 *   node scripts/zenodo-deposit.mjs --manifest         write the manifest and README into public/
 *   ZENODO_TOKEN=... node scripts/zenodo-deposit.mjs --deposit    create the draft and upload
 *
 * The token needs the deposit:write and deposit:actions scopes, from
 * https://zenodo.org/account/settings/applications/tokens/new/
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DRY = !process.argv.includes('--deposit');
const WRITE_MANIFEST = process.argv.includes('--manifest') || process.argv.includes('--deposit');
const TOKEN = process.env.ZENODO_TOKEN;

/** The version record, not the concept record. The concept recid redirects here. */
const VERSION_RECID = '22805685';
const CONCEPT_DOI = '10.5281/zenodo.22805684';
const API = 'https://zenodo.org/api';
const SITE = 'https://nighantu.ageayurveda.com';
const PUB = 'public';

/**
 * What each file is, written once here so the manifest, the README and the site agree.
 *
 * A deposit of thirty unexplained JSON files is barely more usable than a zip. Every entry needs a
 * sentence saying what one row is, because that is the question a person downloading it has.
 */
const DESCRIBED = {
  'afi-crosswalk.json': 'The Ayurvedic Formulary of India ingredient-name crosswalk: every Sanskrit ingredient name the formulary uses, resolved to a botanical identity where one could be established, with the basis stated per row. Ambiguous names are published as ambiguous and unresolved ones as unresolved.',
  'afi-crosswalk.csv': 'The same crosswalk, one row per formulary ingredient row rather than per name, which is the join needed to check a label against the formulary.',
  'composition.json': 'The ingredient composition of the classical formulations transcribed from the Ayurvedic Formulary of India, with the quantity the formulary states, the plant part, and the part and entry number it was transcribed from. A cell illegible in the scan is published as illegible.',
  'composition.csv': 'The composition tables flattened to one row per ingredient.',
  'parquet/composition.parquet': 'The composition tables as Parquet, for columnar querying.',
  'parquet/composition.parquet.json': 'The schema sidecar for composition.parquet, used by this project\'s own Parquet gate.',
  'concepts.json': 'Ayurvedic concept records: contested questions with the competing positions attributed to the sources that hold them, explicit statements of what is not established, and classical citations with the translator and numbering named on each.',
  'concepts.csv': 'The concept records flattened to one row per attributed position.',
  'verse-numbering.json': 'Verse-numbering equivalences between the public-domain English translations of the Charaka and Sushruta Samhitas and the modern standard editions, with the words each source states the equivalence in. Includes the equivalences rejected on an adversarial check, with reasons.',
  'verse-numbering.csv': 'The verse-numbering crosswalk, one row per equivalence.',
  'lexicon.json': 'Ayurvedic technical terms with every English rendering found for each, the source that uses it, and an assessment of whether the rendering survives the classical passage it claims to render.',
  'lexicon.csv': 'The lexicon flattened to one row per rendering.',
  'dravyaguna.json': 'Rasa, guna, virya, vipaka and prabhava per monograph, parsed from the published pages so every value can be checked against the page it came from.',
  'dravyaguna.csv': 'The dravyaguna properties as a table.',
  'parquet/dravyaguna.parquet': 'The dravyaguna properties as Parquet.',
  'compounds.json': 'Phytochemical constituents named across the monographs, resolved to PubChem where an identifier exists, with a co-occurrence network computed from the pages themselves.',
  'compounds.csv': 'The constituents as a table, one row per constituent per monograph.',
  'parquet/compounds.parquet': 'The constituents as Parquet.',
  'chemistry.json': 'Constituents resolved against PubChem to a CID, molecular formula, weight and InChIKey, kept apart from compounds.json because an unresolved constituent is a different fact from a resolved one.',
  'research.json': 'Research papers cited across the site, each with its PubMed ID or DOI, the monographs that cite it, and a tier recording what kind of study it is rather than a verdict on it.',
  'research.csv': 'The research index as a table.',
  'parquet/research.parquet': 'The research index as Parquet.',
  'access.json': 'For every cited paper, the most openly readable copy that could be found: open-access full text where it exists, then PubMed Central, then the DOI.',
  'taxonomy.json': 'Botanical names resolved against GBIF, each carrying the match type so a fuzzy hit is never read as an exact one.',
  'parquet/taxonomy.parquet': 'The botanical taxonomy as Parquet.',
  'verification.json': 'The editorial verification ledger: what was checked, by what method, and what was rejected, with the counts computed from the run artefacts rather than stated.',
  'brand-disclosure.json': 'What Indian Ayurvedic manufacturers publish about their own products, measured across their product pages: whether each page names its ingredients, gives a quantity against them, states a dose amount, or cites an authority. Every count carries the page URL it came from.',
  'dose-comparison.json': 'Manufacturers\' stated doses against the dose the Ayurvedic Formulary of India states for the same classical preparation, with each manufacturer\'s own wording and the page it was read from. Includes the claims withheld on an adversarial check, with reasons.',
  'dose-comparison.csv': 'The dose comparison, one row per compared product page.',
  'manufacturer-register.json': 'A register of Indian Ayurvedic manufacturers with the website each publishes, the state it operates from, and what its robots.txt permits, measured one host at a time.',
  'manufacturer-register.csv': 'The manufacturer register as a table, with per-crawler permissions as columns.',
};

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

/**
 * MANIFEST.json is written by this script into the same directory it scans, so without this it
 * lands in its own file list and the description gate rejects the next run. It is uploaded
 * separately, after the described files, and it cannot describe itself.
 *
 * The prose companion is CORPUS-FILES.md and not the obvious DATASETS.md, because the site already
 * serves a Markdown twin of its datasets page at /datasets.md. On a case-insensitive filesystem
 * those are one path and one silently overwrote the other; on the case-sensitive server they are
 * two URLs. A file that behaves differently locally and deployed is worse than a badly named one.
 * Inside the Zenodo deposit it is uploaded as README.md, where nothing collides.
 */
const GENERATED = new Set(['MANIFEST.json', 'CORPUS-FILES.md']);

const files = walk(PUB)
  .filter((f) => /\.(json|csv|parquet)$/.test(f))
  .map((f) => path.relative(PUB, f))
  .filter((rel) => !rel.startsWith('_') && !GENERATED.has(rel))
  .sort();

/** Every file must be described, or the deposit ships an unexplained file. */
const undescribed = files.filter((f) => !DESCRIBED[f]);
const describedButAbsent = Object.keys(DESCRIBED).filter((f) => !files.includes(f));
if (undescribed.length || describedButAbsent.length) {
  console.error('REFUSING: the file list and the descriptions disagree.');
  for (const f of undescribed) console.error(`  present but undescribed: ${f}`);
  for (const f of describedButAbsent) console.error(`  described but absent:    ${f}`);
  console.error('\nEvery deposited file needs a sentence saying what one row is. Add it to DESCRIBED.');
  process.exit(1);
}

const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rowsOf = (rel) => {
  if (rel.endsWith('.csv')) {
    const t = fs.readFileSync(path.join(PUB, rel), 'utf8');
    return Math.max(0, t.split('\n').filter((l) => l.trim()).length - 1);
  }
  return null;
};

const entries = files.map((rel) => {
  const abs = path.join(PUB, rel);
  const size = fs.statSync(abs).size;
  return {
    file: rel.replace(/\//g, '_'),
    sourcePath: rel,
    bytes: size,
    sha256: sha256(abs),
    csvRows: rowsOf(rel),
    describes: DESCRIBED[rel],
    liveAt: `${SITE}/${rel}`,
  };
});

const totalBytes = entries.reduce((n, e) => n + e.bytes, 0);
const mb = (b) => `${(b / 1024 / 1024).toFixed(2)} MB`;

console.log(`files to deposit     ${entries.length}`);
console.log(`total size           ${mb(totalBytes)}`);
console.log(`concept DOI          ${CONCEPT_DOI}`);
console.log(`new version of       record ${VERSION_RECID}`);
console.log('');
for (const e of entries) {
  console.log(`  ${e.file.padEnd(38)}${String(mb(e.bytes)).padStart(9)}`
    + `${e.csvRows != null ? `  ${e.csvRows.toLocaleString('en-GB')} rows` : ''}`);
}

/**
 * The manifest and the README, which are what turn a pile of files into a deposit someone can use.
 *
 * Both are generated, because a hand-written file list beside thirty-one generated files is a
 * promise to drift. The sha256 of each file is included so a downloader can tell whether the copy
 * they hold is the copy that was deposited, which matters more for an archive than for a website.
 */
const manifest = {
  name: 'Age Ayurveda Nighantu: open datasets',
  conceptDoi: CONCEPT_DOI,
  conceptDoiUrl: `https://doi.org/${CONCEPT_DOI}`,
  license: 'https://creativecommons.org/licenses/by/4.0/',
  licenceNote: 'CC BY 4.0. Monograph text incorporates material from the Amidha Ayurveda Herb '
    + 'Database under CC BY 4.0. Renderings drawn from NoDerivs-licensed sources appear on the '
    + 'site and are withheld from these files; see the note inside lexicon.json. Classical text '
    + 'quotations are from public-domain translations only, and where no public-domain translation '
    + 'exists the passage is cited without a quotation.',
  site: SITE,
  datasetsPage: `${SITE}/datasets/`,
  fileCount: entries.length,
  totalBytes,
  files: entries,
};

const readme = [
  '# Age Ayurveda Nighantu: open datasets',
  '',
  `Concept DOI: https://doi.org/${CONCEPT_DOI}`,
  'Licence: CC BY 4.0',
  `Site: ${SITE}`,
  // The live address of this file. Inside the deposit it tells a downloader where the current copy
  // is; on the site it satisfies the canonical rule crawl-audit enforces on every .md the build
  // serves. The wording matches that gate's single exact phrase rather than reading more naturally
  // as "this file": widening a gate that guards 1,128 real page twins, to accommodate one file,
  // would be the wrong trade.
  `Canonical version of this page: ${SITE}/CORPUS-FILES.md`,
  '',
  'A *nighantu* is the classical Ayurvedic lexicon of medicinal substances. These are the machine',
  'readable datasets behind a modern one.',
  '',
  '## Why this version exists',
  '',
  'Earlier versions of this deposit held a single archive of the project repository. Every dataset',
  'was in there and none of them was individually retrievable, so following the DOI gave you a',
  'source tree rather than the data. This version deposits each dataset as its own file.',
  '',
  '## What is in each file',
  '',
  ...entries.flatMap((e) => [
    `### \`${e.file}\``,
    '',
    e.describes,
    '',
    `- ${mb(e.bytes)}${e.csvRows != null ? `, ${e.csvRows.toLocaleString('en-GB')} data rows` : ''}`,
    `- sha256 \`${e.sha256}\``,
    `- live copy: ${e.liveAt}`,
    '',
  ]),
  '## What these datasets refuse to do',
  '',
  'Three habits run through all of them and are the reason they are worth citing.',
  '',
  'A value that could not be established is published as unestablished rather than guessed: an',
  'unresolved formulary name, a botanical match that is fuzzy rather than exact, a quotation nobody',
  'has read against its source. The record says so and keeps the address.',
  '',
  'A claim about a named third party carries the evidence for it. Every count in the manufacturer',
  'datasets carries the URL it was read from, and every dose comparison carries the manufacturer\'s',
  'own wording, so any company named can check its own row.',
  '',
  'A rejected finding is published as rejected. verification.json records what was thrown out and',
  'why, the dose comparison carries the claims an adversarial check refused, and the verse-numbering',
  'crosswalk carries the equivalences it would not assert.',
  '',
  '## Citation',
  '',
  '```bibtex',
  '@dataset{ageayurveda_nighantu,',
  '  title     = {Age Ayurveda Nighantu: a referenced encyclopedia of Ayurvedic materia medica},',
  '  author    = {{Age Ayurveda}},',
  '  publisher = {Zenodo},',
  `  doi       = {${CONCEPT_DOI}},`,
  `  url       = {${SITE}},`,
  '  license   = {CC-BY-4.0}',
  '}',
  '```',
  '',
].join('\n');

if (WRITE_MANIFEST) {
  fs.writeFileSync(path.join(PUB, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(PUB, 'CORPUS-FILES.md'), readme);
  console.log('\nwrote public/MANIFEST.json and public/CORPUS-FILES.md');
}

if (DRY) {
  console.log('\nNothing was sent to Zenodo. Re-run with --deposit and ZENODO_TOKEN set to upload.');
  console.log('This script never publishes: it leaves a draft for a person to review.');
  process.exit(0);
}

if (!TOKEN) {
  console.error('\nZENODO_TOKEN is not set. Create one with the deposit:write and deposit:actions');
  console.error('scopes at https://zenodo.org/account/settings/applications/tokens/new/ and re-run.');
  process.exit(2);
}

const auth = { Authorization: `Bearer ${TOKEN}` };
const api = async (url, opts = {}) => {
  const r = await fetch(url.startsWith('http') ? url : `${API}${url}`, {
    ...opts,
    headers: { ...auth, ...(opts.headers ?? {}) },
  });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!r.ok) {
    throw new Error(`${opts.method ?? 'GET'} ${url} -> ${r.status}\n${
      typeof body === 'string' ? body.slice(0, 600) : JSON.stringify(body, null, 2).slice(0, 900)}`);
  }
  return body;
};

console.log('\n==> looking for an existing draft before creating one');
/**
 * Reuse an existing draft rather than making a second one.
 *
 * A half-finished run should be resumable. Creating a new version on every invocation would leave
 * a trail of abandoned drafts on the account, and the one thing worse than a deposit with the
 * wrong contents is several of them.
 */
let draft = null;
const existing = await api(`/deposit/depositions?q=&size=50&sort=mostrecent`);
for (const d of Array.isArray(existing) ? existing : []) {
  if (String(d.conceptrecid) === '22805684' && d.state === 'unsubmitted') { draft = d; break; }
}

if (draft) {
  console.log(`    reusing draft ${draft.id}`);
} else {
  console.log(`==> creating a new version of record ${VERSION_RECID}`);
  const res = await api(`/deposit/depositions/${VERSION_RECID}/actions/newversion`, { method: 'POST' });
  const latest = res?.links?.latest_draft;
  if (!latest) throw new Error(`no latest_draft link returned:\n${JSON.stringify(res, null, 2).slice(0, 800)}`);
  draft = await api(latest);
  console.log(`    draft ${draft.id}`);
}

/**
 * A new version inherits the previous version's files, so the repository zip is sitting in the
 * draft. It is removed: leaving it would mean the fix shipped alongside the thing it fixes, and a
 * reader would still have to guess which to download. The published source archive remains
 * available on the earlier version, which is what version history is for.
 */
const current = await api(`/deposit/depositions/${draft.id}/files`);
for (const f of Array.isArray(current) ? current : []) {
  console.log(`==> removing inherited file ${f.filename ?? f.id}`);
  await api(`/deposit/depositions/${draft.id}/files/${f.id}`, { method: 'DELETE' });
}

const bucket = draft.links?.bucket;
if (!bucket) throw new Error('the draft has no bucket link, so files cannot be uploaded');

console.log(`==> uploading ${entries.length} files`);
for (const e of entries) {
  const body = fs.readFileSync(path.join(PUB, e.sourcePath));
  await api(`${bucket}/${encodeURIComponent(e.file)}`, {
    method: 'PUT',
    body,
    headers: { 'content-type': 'application/octet-stream' },
  });
  console.log(`    ${e.file} (${mb(e.bytes)})`);
}
for (const [name, content] of [['MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`], ['README.md', readme]]) {
  await api(`${bucket}/${name}`, { method: 'PUT', body: content, headers: { 'content-type': 'application/octet-stream' } });
  console.log(`    ${name}`);
}

console.log('==> updating metadata');
const described = entries.map((e) => `<li><code>${e.file}</code>: ${e.describes}</li>`).join('\n');
await api(`/deposit/depositions/${draft.id}`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    metadata: {
      ...draft.metadata,
      upload_type: 'dataset',
      version: 'v2.0.0',
      title: 'Age Ayurveda Nighantu: a referenced encyclopedia of Ayurvedic materia medica',
      license: 'cc-by-4.0',
      access_right: 'open',
      notes: 'This version deposits each dataset as its own file. Earlier versions held a single '
        + 'archive of the project repository, in which every dataset was present and none was '
        + 'individually retrievable. The repository archive remains available on the earlier '
        + 'version. MANIFEST.json lists every file with its size, row count and sha256.',
      description: `${draft.metadata?.description ?? ''}\n<p><strong>Files in this version.</strong> `
        + `Each dataset is deposited individually; MANIFEST.json carries the size, row count and `
        + `sha256 of each.</p>\n<ul>\n${described}\n</ul>`,
    },
  }),
});

console.log('');
console.log('Draft prepared and NOT published. Nothing is permanent yet.');
console.log(`Review it at: https://zenodo.org/uploads/${draft.id}`);
console.log('Check the file list and the description, then publish from that page.');
console.log(`Publishing keeps the concept DOI ${CONCEPT_DOI} resolving to the newest version,`);
console.log('so every citation of it on the site stays correct.');
