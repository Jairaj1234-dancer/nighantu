/**
 * Markdown twin of /datasets/. Figures are read from the datasets, never typed in.
 */
import type { APIRoute } from 'astro';
import { abs } from '../lib/site';
import compounds from '../data/compounds.json';
import compositionSummary from '../data/composition-summary.json';
import lexicon from '../data/lexicon.json';
import conceptsData from '../data/concepts.json';
import crosswalk from '../data/afi-crosswalk.json';
import dravyaguna from '../data/dravyaguna.json';
import research from '../data/research.json';
import taxonomy from '../data/taxonomy.json';

export const GET: APIRoute = async () => {
  const n = (x: number) => x.toLocaleString('en-GB');
  const c = (compounds as any).summary;
  const taxa = ((taxonomy as any).taxa ?? []).length;
  const comp = compositionSummary as any;
  const lex = (lexicon as any).summary;
  const con = (conceptsData as any).summary;
  const cw = (crosswalk as any).summary;

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
    `- **Formulary ingredient name crosswalk**: the ${n(cw.distinctNames)} Sanskrit ingredient names used across the 101 formulary entries transcribed here, ${n(cw.namesResolved)} resolved to a botanical identity with the basis stated on every row, ${n(cw.namesAmbiguous)} published as ambiguous and ${n(cw.namesUnresolved)} as unresolved. The crosswalk nobody else publishes between what the formulary calls a drug and what a label calls it.`,
    `  - JSON: ${abs('/afi-crosswalk.json')}`,
    `  - CSV: ${abs('/afi-crosswalk.csv')} (one row per ingredient row)`,
    `  - Browse: ${abs('/crosswalk/')}`,
    '',
    `- **Contested questions in Ayurvedic theory**: ${n(con.contestedQuestions)} questions on which the classical sources genuinely disagree, across ${n(con.records)} concepts, with ${n(con.attributedPositions)} positions given as their sources state them and none presented as the settled answer. Plus ${n(con.notKnownStatements)} statements of what is not established, ${n(con.classicalCitations)} classical citations and ${n(con.researchItems)} research papers assessed.`,
    `  - JSON: ${abs('/concepts.json')}`,
    `  - CSV: ${abs('/concepts.csv')} (one row per attributed position)`,
    `  - Browse: ${abs('/concept/')}`,
    '',
    `- **Ayurvedic terminology lexicon**: ${n(lex.records)} technical terms and ${n(lex.renderings)} English renderings, each with its source and our assessment of whether it holds. ${n(lex.quotesPublished)} classical quotations, every one checked against its source. Renderings from NoDerivs-licensed sources are on the pages and not in this download.`,
    `  - JSON: ${abs('/lexicon.json')}`,
    `  - CSV: ${abs('/lexicon.csv')}`,
    `  - Browse: ${abs('/lexicon/')}`,
    '',
    `- **Classical formulation compositions**: ${n(comp.ingredientRows)} ingredient rows across ${n(comp.formulations)} formulations as printed in the Ayurvedic Formulary of India, ${n(comp.rowsWithQuantity)} of them with the quantity the formulary states, each with the plant part and the formulary entry number it came from.`,
    `  - JSON: ${abs('/composition.json')}`,
    `  - CSV: ${abs('/composition.csv')}`,
    `  - Parquet: ${abs('/parquet/composition.parquet')}`,
    `  - Browse: ${abs('/afi/')}`,
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
