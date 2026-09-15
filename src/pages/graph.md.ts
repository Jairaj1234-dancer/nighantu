import type { APIRoute } from 'astro';
import { abs } from '../lib/site';

export const GET: APIRoute = async () => {
  const body = [
    '# Global Linked Data Knowledge Graph',
    '',
    '> Machine-readable RDF/JSON-LD knowledge graph connecting 1,100+ Ayurvedic botanical taxa (GBIF/Wikidata), PubChem chemical structures, Dravyaguna energetics, and Age Ayurveda commercial formulations.',
    '',
    '## Direct AI & Machine Ingest Endpoint',
    `Download the complete Linked Data graph: ${abs('/knowledge-graph.jsonld')}`,
    '- Format: JSON-LD 1.1 / Schema.org Linked Data',
    '- Node count: 1,162 connected entities',
    '- License: Creative Commons Attribution 4.0 (CC BY 4.0)',
    '',
    '## Entity Breakdown',
    '- ChemicalSubstance (PubChem): 839 entities with PubChem CIDs, InChIKeys, SMILES, and formulas.',
    '- Plant & MedicalEntity (GBIF/Wikidata): 241 medicinal plant taxa mapped to GBIF keys and Wikidata QIDs.',
    '- Dravyaguna Energetics: 245 pharmacological profiles with Rasa, Virya, Vipaka, Prabhava.',
    '- Classical Formulations: 54 formulations codified in the Ayurvedic Formulary of India (AFI).',
    '- Commercial Products: 21 Age Ayurveda SKUs linked to botanical monograph entities.',
    '',
    '## Entity Interconnection Architecture',
    '1. Commercial Products point via isRelatedTo to canonical botanical entities.',
    '2. Botanical Taxa anchor to GBIF species keys and Wikidata QIDs via sameAs.',
    '3. Botanical Taxa link to characteristic phytochemical metabolites.',
    '4. Phytochemicals link to PubChem compound registries via sameAs and PubChem CIDs.',
    '5. Dravyaguna energetics annotate clinical properties cited from the Ayurvedic Pharmacopoeia of India (API).',
    '',
    '---',
    '',
    `Canonical version of this page: ${abs('/graph/')}`,
    '',
    'Published by Age Ayurveda in the Nighantu. Educational reference only, not medical advice.',
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
