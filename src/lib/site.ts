export const SITE_NAME = 'Age Ayurveda Nighantu';
export const PUBLISHER = 'Age Ayurveda';
export const STORE = 'https://ageayurveda.com';

/**
 * Wikidata items for the publisher and for this work, created 18 September 2026.
 *
 * Until they existed, every page's JSON-LD named its publisher as a string, which an
 * answer engine cannot resolve: "Age Ayurveda" is a name, not a thing. Emitting the item
 * as sameAs turns the publisher into an entity that can be looked up and connected to the
 * store, the DOI and this corpus. The slot was empty rather than wrong on purpose: the
 * identifier that used to sit here belonged to Stemonurus cambodianus, a tree.
 */
export const WIKIDATA_PUBLISHER = 'https://www.wikidata.org/wiki/Q141494601';
export const WIKIDATA_WORK = 'https://www.wikidata.org/wiki/Q141494735';
export const TAGLINE = 'A nighantu is the classical Ayurvedic lexicon of medicinal substances. This is a modern one: a referenced encyclopedia of Ayurvedic herbs, classical formulations and instruments.';

/** Absolute URL for a site-relative path, honouring the configured base. */
export function abs(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const site = String(import.meta.env.SITE ?? '').replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${site}${base}${p}`;
}

/** Site-relative URL honouring the configured base. */
export function rel(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export const SECTIONS = [
  { slug: 'herb', label: 'Herbs', plural: 'herbs', blurb: 'Single-herb monographs: identification, Ayurvedic pharmacology, constituents, classical references and published research.' },
  { slug: 'formulation', label: 'Formulations', plural: 'formulations', blurb: 'Classical preparations: churnas, vatis, tailas, ghritas, kashayas, arishtas, avalehas and guggulus.' },
  { slug: 'device', label: 'Instruments', plural: 'instruments', blurb: 'Panchakarma equipment, therapeutic vessels, and diagnostic and para-surgical instruments described in the classical texts.' },
  { slug: 'reference', label: 'Reference', plural: 'reference entries', blurb: 'Cross-cutting entries: pharmacological actions, compound classes, doshas and body systems.' },
  { slug: 'glossary', label: 'Glossary', plural: 'glossary pages', blurb: 'Short definitions for compounds, plant families and pharmacology terms used across the monographs.' },
] as const;

export const CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Googlebot', 'Bingbot', 'Applebot', 'Applebot-Extended',
  'CCBot', 'Amazonbot', 'meta-externalagent', 'DuckAssistBot', 'cohere-ai',
];

/**
 * The project's persistent identifier, and what it actually identifies.
 *
 * This is a Zenodo CONCEPT DOI: it resolves to the deposit titled "Age Ayurveda Nighantu: a
 * referenced encyclopedia of Ayurvedic materia medica", v1.0.0, whose single file is a 7.5 MB
 * archive of the repository. So it identifies the WORK that contains every dataset here, not any
 * one of them, and no dataset on this site has a DOI minted for it alone. That distinction is why
 * `datasetIdentity` below emits the DOI alongside `isPartOf` pointing at the catalogue, rather
 * than letting `identifier` imply a per-dataset mint it has not earned.
 *
 * Google's Dataset documentation names `identifier` as where to "attach any relevant Digital
 * Object identifiers", and its documented consumers are Dataset Search, DataCite Commons and
 * OpenAlex. Nine Dataset nodes on this site carried no identifier at all while the DOI sat on one
 * page, which is the gap this closes.
 */
export const ZENODO_CONCEPT_DOI = '10.5281/zenodo.22805684';
export const DOI_URL = `https://doi.org/${ZENODO_CONCEPT_DOI}`;

/**
 * The identity block every Dataset node on this site should carry.
 *
 * `sameAs` names both the DOI and the Wikidata item, because they answer different questions. The
 * DOI resolves to an archived deposit; the Wikidata item is what lets an engine treat this corpus
 * as an entity it already knows rather than a page it has just met. Q141494735 is verified as this
 * corpus by its own official-website and DOI claims, which match this site exactly.
 */
export function datasetIdentity() {
  return {
    identifier: DOI_URL,
    sameAs: [DOI_URL, WIKIDATA_WORK],
    isPartOf: { '@type': 'DataCatalog', '@id': `${abs('/datasets/')}#catalog` },
  };
}
