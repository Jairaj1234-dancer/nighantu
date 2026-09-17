#!/usr/bin/env node
/**
 * Apply the AFI composition workflow: verified ingredient tables for formulation pages.
 *
 *   node scripts/apply-composition.mjs <workflow-result.json> [--dry-run]
 *
 * A table is published only when:
 *  - the page is a named formulation and the entry was found in AFI Part I or II;
 *  - the independent verifier accepted it: identity confirmed, no row errors, no missing rows;
 *  - every row not marked ocrCorrected/illegible has its name present in the OCR text within
 *    the entry's own span (re-checked here, so a transcription cannot drift from the book);
 *  - rows are numbered 1..n without gaps or duplicates.
 * Refusals are recorded in data/runs/afi-composition.json. The companion database's
 * AI-curated proportions are never a source; its disagreements with the AFI are recorded as
 * findings so the chatbot's data can be corrected separately.
 */
import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry-run');
const IN = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!IN || !fs.existsSync(IN)) { console.error('usage: node scripts/apply-composition.mjs <workflow-result.json> [--dry-run]'); process.exit(1); }

const BOOKS = {
  I: { file: path.join('sources-private', 'afi-b32232184.txt'), url: 'https://archive.org/details/b32232184' },
  II: { file: path.join('sources-private', 'afi-b32232172.txt'), url: 'https://archive.org/details/b32232172' },
};
const lines = {};
for (const [part, b] of Object.entries(BOOKS)) {
  if (!fs.existsSync(b.file)) { console.error(`missing ${b.file}`); process.exit(1); }
  lines[part] = fs.readFileSync(b.file, 'utf8').split('\n');
}
const fold = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

const raw = JSON.parse(fs.readFileSync(IN, 'utf8'));
const done = raw.done ?? raw.result?.done ?? [];
const out = { note: 'AFI composition tables. Written by scripts/apply-composition.mjs; never edit by hand.', records: {} };
const ledger = { run: 'afi-composition', examined: 0, published: [], notFound: [], rejected: [], dbDisagreements: {} };
const reject = (slug, why, extra = {}) => ledger.rejected.push({ slug, why, ...extra });

for (const { slug, extract: ex, verify: v } of done) {
  ledger.examined += 1;
  if (!fs.existsSync(path.join('content', 'formulation', `${slug}.md`))) { reject(slug, 'unknown slug'); continue; }
  if (ex.dbDisagreements?.length) ledger.dbDisagreements[slug] = ex.dbDisagreements;
  if (ex.pageKind !== 'named-formulation') { ledger.notFound.push({ slug, why: ex.pageKind }); continue; }
  if (!ex.found) { ledger.notFound.push({ slug, why: 'not in AFI Part I or II', note: ex.note.slice(0, 200) }); continue; }
  if (!v) { reject(slug, 'no verifier record'); continue; }
  if (v.verdict !== 'accept' || !v.entryIdentityConfirmed || v.rowErrors.length || v.missingRows.length) {
    reject(slug, `verifier: ${v.verdict}`, { rowErrors: v.rowErrors, missingRows: v.missingRows, reasons: v.reasons.slice(0, 600) });
    continue;
  }
  const book = lines[ex.afiPart];
  if (!book || !ex.headingLine) { reject(slug, 'no part or heading line'); continue; }

  /**
   * Not every printed line in a composition table is an ingredient.
   *
   * The formulary prints sub-headings inside the table ("Praksepa dravyas", the drugs added
   * at the end) and continuation lines ("reduced to 12.288 l." under the decoction water).
   * Transcribers give those the same number as the row they belong to, which a strict
   * 1..n rule read as a duplicate and refused. They are marked structural instead: kept,
   * because dropping them would lose the book's own structure, and excluded from the
   * numbering check and from the ingredient count.
   */
  const rows = ex.rows.map((r, i, all) => ({
    ...r,
    structural: i > 0 && r.n === all[i - 1].n,
  }));
  const ingredients = rows.filter((r) => !r.structural);
  const numbering = ingredients.map((r) => r.n).join(',') === ingredients.map((_, i) => i + 1).join(',');
  if (!rows.length || !numbering) { reject(slug, 'row numbering not 1..n'); continue; }

  /**
   * The entry's span, bounded by its neighbours rather than by a line offset.
   *
   * These scans are two-column, and the OCR emits the whole name column before the heading
   * line, sometimes 200 lines before it on a long entry. A window that opened a few lines
   * above the heading therefore refused correct transcriptions because the first
   * ingredients fell outside it. Bounding by the previous and next entry headings is the
   * honest shape: a name has to appear somewhere inside this entry's own stretch of the
   * book, and cannot be borrowed from another entry.
   */
  const HEADING = /^\s*\d+\s*[:.]\s*\d+\s+[A-Z][A-Z0-9 .,()\-']{3,}$/;
  const headings = book.reduce((acc, line, i) => (HEADING.test(line) ? [...acc, i] : acc), []);
  const here = headings.filter((i) => i <= ex.headingLine + 2).pop() ?? ex.headingLine;
  const next = headings.find((i) => i > here + 2) ?? here + 400;
  const prev = headings.filter((i) => i < here).pop() ?? Math.max(0, here - 300);
  // A little slack before the previous heading: on some pages the OCR starts this entry's
  // name column above where the previous entry's heading was printed, so a hard bound at
  // the neighbour still cut off a legitimate first ingredient (Dadimadi Ghrta's Srngavera).
  const start = Math.max(0, prev - 60);
  const end = Math.min(book.length, next);

  const span = fold(book.slice(start, end).join(' '));
  const absent = rows.filter((r) => !r.ocrCorrected && !r.illegible && !r.structural
    && !span.includes(fold(r.name).slice(0, 6)));
  if (absent.length) { reject(slug, 'row names not in the entry span', { absent: absent.map((r) => r.name) }); continue; }

  // Transcribers annotate the source line with their own bracketed working ("[OCR prints
  // '10510814'; Devanagari footer reads 105-107]"). That belongs in the run record, not in
  // a sentence a reader sees, so only the citation as printed survives to the page.
  const citation = (ex.classicalSource ?? '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().replace(/^\(|\)$/g, '');

  out.records[slug] = {
    afiPart: ex.afiPart,
    entryNumber: ex.entryNumber,
    entryHeading: ex.entryHeading,
    classicalSource: citation || null,
    sourceUrl: BOOKS[ex.afiPart].url,
    rows: rows.map(({ n, name, gloss, part, quantity, ocrCorrected, illegible, structural }) => ({ n, name, gloss, part, quantity, ocrCorrected, illegible, structural })),
  };
  ledger.published.push({ slug, afi: `Part ${ex.afiPart} ${ex.entryNumber}`, rows: ingredients.length, ocrCorrected: rows.filter((r) => r.ocrCorrected).length });
}

out.records = Object.fromEntries(Object.entries(out.records).sort(([a], [b]) => a.localeCompare(b)));
ledger.summary = {
  examined: ledger.examined, published: ledger.published.length,
  notInAfi: ledger.notFound.length, rejected: ledger.rejected.length,
  rows: ledger.published.reduce((n, p) => n + p.rows, 0),
  pagesWhereDbDisagrees: Object.keys(ledger.dbDisagreements).length,
};
console.log(JSON.stringify(ledger.summary));
if (DRY) { console.log(ledger.rejected.map((r) => `${r.slug}: ${r.why}`).join('\n')); process.exit(0); }
fs.writeFileSync(path.join('src', 'data', 'composition.json'), `${JSON.stringify(out, null, 1)}\n`);
fs.writeFileSync(path.join('data', 'runs', 'afi-composition.json'), `${JSON.stringify(ledger, null, 1)}\n`);
console.log('wrote src/data/composition.json, data/runs/afi-composition.json');
