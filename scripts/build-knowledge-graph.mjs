#!/usr/bin/env node
/**
 * scripts/build-knowledge-graph.mjs
 *
 * Synthesizes a unified, standards-compliant Linked Data RDF/JSON-LD Knowledge Graph
 * connecting Age Ayurveda commercial SKUs -> Botanical Taxa (GBIF/Wikidata) ->
 * Phytochemical Compounds (PubChem) -> Dravyaguna Energetics.
 *
 * Output: public/knowledge-graph.jsonld
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const taxonomyData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/taxonomy.json'), 'utf8'));
const chemistryData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/chemistry.json'), 'utf8'));
const compoundsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/compounds.json'), 'utf8'));
const productsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/products.json'), 'utf8'));
const dravyagunaData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/dravyaguna.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/manifest.json'), 'utf8'));

const SITE_URL = 'https://nighantu.ageayurveda.com';
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
  'sameAs': [
    'https://www.wikidata.org/wiki/Q111973347',
    'https://www.instagram.com/ageayurveda',
    'https://twitter.com/ageayurveda'
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

// 5. Commercial Products (Age Ayurveda Storefront)
for (const [slug, prod] of Object.entries(productsData.products || {})) {
  const mappedSlugs = productsData.map?.[slug] || [];
  const relatedPlants = [];

  for (const mapSlug of mappedSlugs) {
    const plantId = plantIdByHerbSlug.get(mapSlug);
    if (plantId) {
      relatedPlants.push({ '@id': plantId });
    }
  }

  const productNode = {
    '@type': ['Product', 'DietarySupplement'],
    '@id': `${STORE_URL}/products/${slug}#product`,
    'name': prod.title,
    'description': prod.line,
    'url': `${STORE_URL}/products/${slug}`,
    'image': prod.image,
    'brand': {
      '@id': `${STORE_URL}/#organization`
    },
    'manufacturer': {
      '@id': `${STORE_URL}/#organization`
    },
    'category': 'Ayurvedic Botanical Supplement',
    'isRelatedTo': relatedPlants.length > 0 ? relatedPlants : undefined
  };
  graph.push(productNode);
}

const finalDoc = {
  '@context': 'https://schema.org',
  '@graph': graph
};

const outputPath = path.join(ROOT, 'public', 'knowledge-graph.jsonld');
fs.writeFileSync(outputPath, JSON.stringify(finalDoc, null, 2), 'utf8');

console.log(`Successfully synthesized Knowledge Graph: ${graph.length} nodes written to public/knowledge-graph.jsonld`);
