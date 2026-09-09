export const SITE_NAME = 'Ayurveda Atlas';
export const PUBLISHER = 'Age Ayurveda';
export const STORE = 'https://ageayurveda.com';
export const TAGLINE = 'A referenced encyclopedia of Ayurvedic herbs, classical formulations and instruments.';

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
