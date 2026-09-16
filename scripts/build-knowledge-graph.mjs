#!/usr/bin/env node
/**
 * scripts/build-knowledge-graph.mjs
 *
 * Builds a JSON-LD linked-data graph of what this site publishes: botanical taxa
 * (GBIF/Wikidata), phytochemical compounds (PubChem) and Dravyaguna properties.
 * Every node is generated from src/data, so the graph cannot state anything the pages
 * do not. Storefront SKUs are deliberately absent; see section 5.
 *
 * Output: public/knowledge-graph.jsonld
 */

import fs from 'node:fs';
import path from 'node:path';
import { SITE, BASE } from './config.mjs';

const ROOT = process.cwd();
const taxonomyData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/taxonomy.json'), 'utf8'));
const chemistryData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/chemistry.json'), 'utf8'));
const compoundsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/compounds.json'), 'utf8'));
const dravyagunaData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/dravyaguna.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/manifest.json'), 'utf8'));

// The graph must address the site where it is actually served. A hardcoded
// nighantu.ageayurveda.com published node ids on a domain that does not resolve yet,
// so every @id in the graph pointed at nothing. This follows the same ATLAS_SITE and
// ATLAS_BASE the rest of the build uses, and moves with scripts/use-subdomain.sh.
const SITE_URL = `${SITE}${BASE}`;
const STORE_URL = 'https://ageayurveda.com';

const graph = [];

// 1. Root Organization Node
graph.push({
  '@type': 'Organization',
  '@id': `${STORE_URL}/#organization`,
  'name': 'Age Ayurveda',
  'url': STORE_URL,
  'logo': `${STORE_URL}/cdn/shop/files/age-logo.png`,
  'description': 'Pioneering classical and evidence-based Ayurvedic formulations, sustainable botanical sourcing, and the open-access Nighantu knowledge graph.',
  // sameAs carried a Wikidata QID that belongs to Stemonurus cambodianus, a tree, not
  // to this publisher. A wrong sameAs is worse than none: it merges two entities in
  // every consumer that reads the graph. Only profiles confirmed to resolve are listed,
  // and a Wikidata item goes back here when one actually exists for Age Ayurveda.
  'sameAs': [
    'https://www.instagram.com/ageayurveda'
  ],
  'knowsAbout': [
    'Ayurvedic Medicine',
    'Dravyaguna Vijnana',
    'Phytochemistry',
    'Pharmacognosy',
    'Ayurvedic Pharmacopoeia of India (API)',
    'Ayurvedic Formulary of India (AFI)'
  ],
  'publishes': {
    '@id': `${SITE_URL}/#catalog`
  }
});

// 2. DataCatalog & Knowledge Graph Node
graph.push({
  '@type': 'DataCatalog',
  '@id': `${SITE_URL}/#catalog`,
  'name': 'Nighantu: Ayurvedic Pharmacopoeia & Phytochemical Knowledge Graph',
  'url': SITE_URL,
  'description': 'Comprehensive open linked-data catalog mapping 800+ Ayurvedic herbs, classical formulations, GBIF taxonomic keys, PubChem chemical structures, and peer-reviewed clinical research.',
  'license': 'https://creativecommons.org/licenses/by/4.0/',
  'publisher': {
    '@id': `${STORE_URL}/#organization`
  },
  'dataset': [
    { '@id': `${SITE_URL}/datasets/#dravyaguna-parquet` },
    { '@id': `${SITE_URL}/datasets/#compounds-parquet` },
    { '@id': `${SITE_URL}/datasets/#research-parquet` },
    { '@id': `${SITE_URL}/datasets/#taxonomy-parquet` }
  ]
});

// Build lookup maps
const compoundBySlug = new Map();
for (const comp of chemistryData.compounds || []) {
  compoundBySlug.set(comp.slug, comp);
}

const dravyaBySlug = new Map();
for (const item of dravyagunaData.herbs || []) {
  dravyaBySlug.set(item.slug, item);
}

// 3. Chemical Substance Entities
const addedCompoundIds = new Set();
for (const comp of chemistryData.compounds || []) {
  const entityId = `${SITE_URL}/compounds/${comp.slug}/#entity`;
  addedCompoundIds.add(entityId);

  const chemicalNode = {
    '@type': 'ChemicalSubstance',
    '@id': entityId,
    'name': comp.name,
    'url': `${SITE_URL}/reference/${comp.slug}/`,
    'inChIKey': comp.inchikey,
    'molecularFormula': comp.formula,
    'molecularWeight': comp.weight ? `${comp.weight} g/mol` : undefined,
    'smiles': comp.smiles,
    'iupacName': comp.iupacName,
    'sameAs': comp.cid ? `https://pubchem.ncbi.nlm.nih.gov/compound/${comp.cid}` : undefined
  };
  graph.push(chemicalNode);
}

// 4. Botanical Plant Entities
const plantIdByHerbSlug = new Map();
for (const taxon of taxonomyData.taxa || []) {
  for (const page of taxon.pages || []) {
    if (page.kind !== 'herb') continue;
    const plantId = `${SITE_URL}/herb/${page.slug}/#entity`;
    plantIdByHerbSlug.set(page.slug, plantId);

    const dravya = dravyaBySlug.get(page.slug);
    const sameAsList = [];
    if (taxon.wikidata) sameAsList.push(`https://www.wikidata.org/wiki/${taxon.wikidata}`);
    if (taxon.gbifKey) sameAsList.push(`https://www.gbif.org/species/${taxon.gbifKey}`);

    const properties = [];
    if (dravya) {
      if (dravya.rasa) properties.push({ '@type': 'PropertyValue', 'name': 'Rasa', 'value': dravya.rasa });
      if (dravya.virya) properties.push({ '@type': 'PropertyValue', 'name': 'Virya', 'value': dravya.virya });
      if (dravya.vipaka) properties.push({ '@type': 'PropertyValue', 'name': 'Vipaka', 'value': dravya.vipaka });
      if (dravya.prabhava) properties.push({ '@type': 'PropertyValue', 'name': 'Prabhava', 'value': dravya.prabhava });
    }

    const plantNode = {
      '@type': ['Plant', 'MedicalEntity'],
      '@id': plantId,
      'name': page.title,
      'scientificName': taxon.scientificName || page.asPublished,
      'url': `${SITE_URL}/herb/${page.slug}/`,
      'family': taxon.family,
      'order': taxon.order,
      'genus': taxon.genus,
      'sameAs': sameAsList.length > 0 ? sameAsList : undefined,
      'additionalProperty': properties.length > 0 ? properties : undefined,
      'isContainedIn': {
        '@id': `${SITE_URL}/#catalog`
      }
    };
    graph.push(plantNode);
  }
}

// 5. No commercial nodes.
//
// An earlier version emitted a Product/DietarySupplement node per SKU, linked to the
// botanical entities. That inverts what this site is for. The reference surface is
// deliberately separate from the storefront: answer engines cite reference material and
// discount marketing, and each page already carries exactly one soft product module.
// A dataset that ships the catalogue inside the pharmacology graph turns the whole
// corpus into a commercial surface, and a DietarySupplement node adjacent to a
// pharmacology claim is also the shape regulators read as a health claim.
// Products belong on ageayurveda.com, which has its own markup.

const finalDoc = {
  '@context': 'https://schema.org',
  '@graph': graph
};

const outputPath = path.join(ROOT, 'public', 'knowledge-graph.jsonld');
fs.writeFileSync(outputPath, JSON.stringify(finalDoc, null, 2), 'utf8');

console.log(`Successfully synthesized Knowledge Graph: ${graph.length} nodes written to public/knowledge-graph.jsonld`);
