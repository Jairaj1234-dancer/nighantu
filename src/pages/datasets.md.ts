import type { APIRoute } from 'astro';
import { abs } from '../lib/site';

export const GET: APIRoute = async () => {
  const body = [
    '# Open Ayurvedic Datasets',
    '',
    '> Downloadable machine-readable datasets of classical Ayurvedic pharmacology, Dravyaguna properties, phytochemical constituents, and botanical taxonomy under CC BY 4.0.',
    '',
    'All datasets published by the Age Ayurveda Nighantu are generated directly from verified monograph records and classical texts.',
    '',
    '## Available Datasets',
    '',
    '- **Ayurvedic Dravyaguna Pharmacological Dataset**: 245 botanical monographs covering Rasa, Guna, Virya, Vipaka, and Prabhava.',
    `  - JSON: ${abs('/dravyaguna.json')}`,
    `  - CSV: ${abs('/dravyaguna.csv')}`,
    `  - Parquet: ${abs('/parquet/dravyaguna.parquet')}`,
    '',
    '- **Phytochemical Constituents & Co-occurrence Network**: 839 phytochemical entities with PubChem CIDs and 22,176 co-occurrence graph edges.',
    `  - JSON: ${abs('/compounds.json')}`,
    `  - CSV: ${abs('/compounds.csv')}`,
    `  - Parquet: ${abs('/parquet/compounds.parquet')}`,
    '',
    '- **Biomedical Literature & Research Citations**: 2,892 biomedical research citations cross-referenced with PubMed IDs and DOIs.',
    `  - JSON: ${abs('/research.json')}`,
    `  - CSV: ${abs('/research.csv')}`,
    `  - Parquet: ${abs('/parquet/research.parquet')}`,
    '',
    '- **Botanical Taxonomy & Identifier Crosswalk**: 241 resolved medicinal plant taxa mapped to GBIF keys, NCBI IDs, and Wikidata QIDs.',
    `  - JSON: ${abs('/taxonomy.json')}`,
    `  - Parquet: ${abs('/parquet/taxonomy.parquet')}`,
    '',
    '- **Nighantu Editorial Verification Ledger**: Claim verification audit history and run logs.',
    `  - JSON: ${abs('/verification.json')}`,
    '',
    '---',
    '',
    `Canonical version of this page: ${abs('/datasets/')}`,
    '',
    'Published by Age Ayurveda under CC BY 4.0. Educational and scientific research reference.',
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
