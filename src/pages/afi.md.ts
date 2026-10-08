/**
 * Markdown twin of /afi/. Same entries, same caveats, same addresses.
 *
 * Figures are computed from the transcription, never typed in, for the reason the dataset
 * catalogue learned the hard way: a reference that misstates its own counts is the one thing a
 * data consumer cannot forgive.
 */
import type { APIRoute } from 'astro';
import composition from '../data/composition.json';
import summary from '../data/composition-summary.json';
import { abs } from '../lib/site';

export const GET: APIRoute = async () => {
  const n = (x: number) => x.toLocaleString('en-GB');
  const sum = summary as any;
  const records = (composition as any).records ?? {};
  const marked = (v: unknown) => /^\[illegible/i.test(String(v ?? ''));

  const entries = Object.entries(records).map(([slug, r]: [string, any]) => {
    const rows = (r.rows ?? []).filter((x: any) => !x.structural);
    const number = String(r.entryNumber ?? '');
    return {
      slug,
      part: String(r.afiPart ?? ''),
      number,
      heading: String(r.entryHeading ?? '').trim() || slug.replace(/-/g, ' '),
      classical: r.classicalSource ?? null,
      dose: r.dose ?? null,
      ingredients: rows.length,
      quantified: rows.filter((x: any) => x.quantity && !marked(x.quantity)).length,
      note: r.entryNameNote ?? null,
    };
  });

  entries.sort((a, b) => {
    const [ca, na] = a.number.split(':');
    const [cb, nb] = b.number.split(':');
    return a.part.localeCompare(b.part)
      || (Number.parseFloat(ca) || 0) - (Number.parseFloat(cb) || 0)
      || (Number.parseFloat(na) || 0) - (Number.parseFloat(nb) || 0)
      || a.slug.localeCompare(b.slug);
  });

  const parts = [...new Set(entries.map((e) => e.part))].sort();
  const cell = (v: string | null, blank: string) => (v ? v.replace(/\|/g, '\\|') : `_${blank}_`);

  const body = [
    '# The Ayurvedic Formulary of India, entry by entry',
    '',
    `> Canonical version of this page: ${abs('/afi/')}`,
    '',
    "> The Government of India's official formulary of classical Ayurvedic preparations. For each",
    '> entry it prints the ingredients, the part of each plant used, the quantity of each, the',
    '> method, the dose and the classical text the formula comes from.',
    '',
    `This lists the ${n(entries.length)} entries transcribed on this site. The formulary itself`,
    'contains more; what is held here is stated below rather than implied. Every figure was read',
    'off the page images of the book, row by row. A cell illegible in the scan is published as',
    "illegible rather than guessed at, and a correction to the scan is marked as the transcriber's",
    "rather than the book's.",
    '',
    '## What is transcribed here',
    '',
    '| Measure | Value |',
    '| --- | --- |',
    `| Entries | ${n(entries.length)}, across ${parts.length} formulary parts |`,
    `| Ingredient rows | ${n(sum.ingredientRows)} |`,
    `| Rows with a stated quantity | ${n(sum.rowsWithQuantity)} |`,
    `| Entries naming a classical source | ${n(entries.filter((e) => e.classical).length)} |`,
    `| Entries with the formulary's own dose | ${n(entries.filter((e) => e.dose).length)} |`,
    `| Cells illegible in the scan | ${n(sum.rowsIllegibleInScan)} |`,
    `| Rows carrying a transcription correction | ${n(sum.rowsWithAnOcrCorrection)} |`,
    '',
    '## How an entry number reads',
    '',
    'An entry is cited as a part, a chapter and a number within that chapter. `I 1:1` is Part I,',
    'chapter 1, first entry, which is Abhayarishta. That is the address to quote when checking a',
    'label against the formulary, and every composition on this site carries it.',
    '',
    'The chapter number is given as the book prints it and is not given a title. The chapters group',
    'preparations by kind, but not cleanly enough to name from the entries transcribed here: Part I',
    'chapters 12 and 20 both contribute vati entries to this set.',
    '',
    ...parts.flatMap((part) => [
      `## Part ${part}`,
      '',
      '| Entry | Formulation | Ingredients | Dose as the formulary states it | Classical source the formulary cites |',
      '| --- | --- | --- | --- | --- |',
      ...entries.filter((e) => e.part === part).map((e) => {
        const qty = e.quantified < e.ingredients ? `${e.ingredients} (${e.quantified} quantified)` : String(e.ingredients);
        const name = e.note ? `${e.heading} (entry name differs from the product name)` : e.heading;
        return `| ${part} ${e.number} | [${name}](${abs(`/formulation/${e.slug}/`)}) | ${qty} | ${cell(e.dose, 'not stated in the entry')} | ${cell(e.classical, 'none printed')} |`;
      }),
      '',
    ]),
    '## The whole thing as data',
    '',
    `Every row above, plus each ingredient with its plant part and quantity: ${abs('/composition.json')}`,
    `and ${abs('/composition.csv')}, CC BY 4.0. The CSV is one row per ingredient, which is the`,
    'shape anyone checking a product label against the formulary wants.',
    '',
    '## Where the text came from',
    '',
    'The Ayurvedic Formulary of India, Government of India, Ministry of AYUSH. Transcribed from the',
    'scans at https://archive.org/details/b32232184 and https://archive.org/details/b32232172,',
    'working from the page images rather than the optical character recognition, because the OCR of',
    'these tables misreads digits often enough to be unusable for quantities.',
    '',
    'Educational reference only. A formulary entry states what a preparation is made of; it is not',
    "a prescription, and the dose printed in the formulary is reported as the formulary's figure",
    'rather than offered as advice.',
    '',
  ].join('\n');

  return new Response(body, { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
};
