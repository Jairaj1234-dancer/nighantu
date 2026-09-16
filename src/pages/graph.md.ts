/**
 * Markdown twin of /graph/.
 *
 * Every figure is counted from the graph file at build time. The first version of this
 * page typed its counts in, and they were wrong by the next build: it claimed 1,162
 * nodes, 54 AFI formulations that are not in the graph at all, and 21 storefront SKUs
 * that no longer belong in it.
 */
import type { APIRoute } from 'astro';
import fs from 'node:fs';
import { abs } from '../lib/site';

export const GET: APIRoute = async () => {
  const doc = JSON.parse(fs.readFileSync(new URL('../../public/knowledge-graph.jsonld', import.meta.url), 'utf8'));
  const nodes = doc['@graph'] ?? [];
  const typed = (t: string) => nodes.filter((n: any) => (Array.isArray(n['@type']) ? n['@type'] : [n['@type']]).includes(t)).length;
  const withProps = nodes.filter((n: any) => Array.isArray(n.additionalProperty) && n.additionalProperty.length).length;
  const fmt = (n: number) => n.toLocaleString('en-GB');

  const body = [
    '# Linked Data Knowledge Graph',
    '',
    '> A machine-readable JSON-LD graph of the botanical taxa, PubChem constituents and',
    '> Dravyaguna properties published on this site. Generated from the published data on',
    '> every build, so it cannot state anything the pages do not.',
    '',
    '## Machine ingest endpoint',
    `Download the graph: ${abs('/knowledge-graph.jsonld')}`,
    '- Format: JSON-LD, Schema.org vocabulary',
    `- Nodes: ${fmt(nodes.length)}`,
    '- Licence: Creative Commons Attribution 4.0 (CC BY 4.0)',
    '',
    '## What is in it',
    `- ChemicalSubstance: ${fmt(typed('ChemicalSubstance'))} constituents resolved to PubChem, with InChIKey, SMILES and formula where PubChem returned them.`,
    `- Plant: ${fmt(typed('Plant'))} herb pages whose botanical name is an exact GBIF backbone match, with Wikidata QIDs where they exist.`,
    `- Dravyaguna properties: ${fmt(withProps)} plants carry rasa, virya, vipaka or prabhava as PropertyValue annotations, parsed from the monographs here.`,
    '',
    '## How the nodes connect',
    '1. Plant entities anchor to GBIF species keys and Wikidata QIDs through sameAs.',
    '2. Constituent entities anchor to PubChem compound records through sameAs.',
    '3. Dravyaguna values annotate the plant they were parsed from, and each one is checkable against that monograph.',
    '',
    'Storefront products are deliberately not in the graph. This is a reference surface,',
    'and the product link on each monograph is the only commercial element.',
    '',
    '---',
    '',
    `Canonical version of this page: ${abs('/graph/')}`,
    '',
    'Published by Age Ayurveda in the Nighantu. Educational reference only, not medical advice.',
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
