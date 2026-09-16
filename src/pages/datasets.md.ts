/**
 * Markdown twin of /datasets/. Figures are read from the datasets, never typed in.
 */
import type { APIRoute } from 'astro';
import { abs } from '../lib/site';
import compounds from '../data/compounds.json';
import dravyaguna from '../data/dravyaguna.json';
import research from '../data/research.json';
import taxonomy from '../data/taxonomy.json';

export const GET: APIRoute = async () => {
  const n = (x: number) => x.toLocaleString('en-GB');
  const c = (compounds as any).summary;
  const taxa = ((taxonomy as any).taxa ?? []).length;

  const body = [
    '# Open Ayurvedic Datasets',
    '',
    '> Machine-readable datasets of Ayurvedic pharmacology, phytochemical constituents,',
    '> botanical taxonomy and cited literature, under CC BY 4.0.',
    '',
    'Each dataset is generated from the published monographs on every build, so it cannot',
    'drift from the pages. Where a value is uncertain or a match is inexact, the dataset',
    'says so rather than dropping the caveat.',
    '',
    '## Available datasets',
    '',
    `- **Dravyaguna properties**: ${n((dravyaguna as any).summary.entries)} monographs with rasa, guna, virya, vipaka and prabhava.`,
    `  - JSON: ${abs('/dravyaguna.json')}`,
    `  - CSV: ${abs('/dravyaguna.csv')}`,
    `  - Parquet: ${abs('/parquet/dravyaguna.parquet')}`,
    '',
    `- **Phytochemical constituents and co-occurrence**: ${n(c.compounds)} constituents, ${n(c.linkable)} resolved to PubChem, ${n(c.edges)} co-occurrence edges computed from the pages.`,
    `  - JSON: ${abs('/compounds.json')}`,
    `  - CSV: ${abs('/compounds.csv')}`,
    `  - Parquet: ${abs('/parquet/compounds.parquet')}`,
    '',
    `- **Cited literature**: ${n((research as any).summary.papers)} papers with PubMed IDs and DOIs, cross-referenced to the monographs that cite them.`,
    `  - JSON: ${abs('/research.json')}`,
    `  - CSV: ${abs('/research.csv')}`,
    `  - Parquet: ${abs('/parquet/research.parquet')}`,
    '',
    `- **Botanical taxonomy crosswalk**: ${n(taxa)} taxa resolved against GBIF, with NCBI taxonomy IDs and Wikidata QIDs where the match is exact.`,
    `  - JSON: ${abs('/taxonomy.json')}`,
    `  - Parquet: ${abs('/parquet/taxonomy.parquet')}`,
    '',
    '- **Verification ledger**: every verification run with what it examined, published and rejected.',
    `  - JSON: ${abs('/verification.json')}`,
    '',
    '---',
    '',
    `Canonical version of this page: ${abs('/datasets/')}`,
    '',
    'Published by Age Ayurveda under CC BY 4.0. Educational and scientific reference, not medical advice.',
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
