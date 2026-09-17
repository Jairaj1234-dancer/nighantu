/**
 * Markdown twin of /icd-tm2/. Same rows, same caveats, no dataset download: WHO's terms are
 * CC BY-ND 3.0 IGO and are reproduced unaltered here rather than offered for reuse.
 */
import type { APIRoute } from 'astro';
import crosswalk from '../data/icd-tm2.json';
import { abs } from '../lib/site';

export const GET: APIRoute = async () => {
  const data = crosswalk as any;
  const rows = [...data.rows].sort((a: any, b: any) => a.sanskrit.localeCompare(b.sanskrit));

  const body = [
    '# Ayurvedic disease names in WHO ICD-11 (TM2)',
    '',
    "> Which Ayurvedic terms WHO lists against which ICD-11 Traditional Medicine Module 2",
    '> codes, taken from the classification itself.',
    '',
    'A row says only that WHO lists this Sanskrit term, in its Ayurveda field, against that',
    'code. It is not a claim that the Ayurvedic condition and the biomedical category are the',
    'same thing, and it is not a diagnosis. No causes, symptoms or treatments appear here.',
    '',
    '| Ayurvedic term | As WHO spells it | Code | WHO title |',
    '| --- | --- | --- | --- |',
    ...rows.flatMap((r: any) => r.codes.map((c: any, i: number) => (
      `| ${i === 0 ? r.sanskrit : ''} | ${c.term} | ${c.code} | ${c.title.replace(/\s*\(TM2\)\s*$/, '')} |`
    ))),
    '',
    `${rows.length} terms. Source: ${data.source}, licensed by WHO under CC BY-ND 3.0 IGO and`,
    'reproduced unaltered. Browse it at https://icd.who.int/browse/2026-01/mms/en',
    '',
    '---',
    '',
    `Canonical version of this page: ${abs('/icd-tm2/')}`,
    '',
    'Published by Age Ayurveda in the Nighantu. Educational reference only, not medical advice.',
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
