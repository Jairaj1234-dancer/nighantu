import { getCollection } from 'astro:content';

export type Kind = 'herb' | 'formulation' | 'device' | 'reference' | 'text';
export const KINDS: Kind[] = ['herb', 'formulation', 'device', 'reference', 'text'];

export const SECTION_META: Record<Kind, { label: string; href: string; blurb: string }> = {
  herb: {
    label: 'Herbs', href: '/herb/',
    blurb: 'Single-herb monographs covering identification, Ayurvedic pharmacology, phytochemistry, classical references and published research.',
  },
  formulation: {
    label: 'Formulations', href: '/formulation/',
    blurb: 'Classical preparations: churnas, vatis, tailas, ghritas, kashayas, arishtas, avalehas, guggulus and rasayanas.',
  },
  device: {
    label: 'Instruments', href: '/device/',
    blurb: 'Panchakarma equipment, therapeutic vessels, diagnostic tools and para-surgical instruments described in the classical texts.',
  },
  reference: {
    label: 'Reference', href: '/reference/',
    blurb: 'Cross-cutting entries: pharmacological actions, compound classes, doshas, plant families and body systems.',
  },
  text: {
    label: 'Classical texts', href: '/text/',
    blurb: 'The Samhitas and Nighantus the monographs draw on.',
  },
};

export async function allPages() {
  const out: { kind: Kind; data: any }[] = [];
  for (const kind of KINDS) {
    for (const e of await getCollection(kind)) out.push({ kind, data: e.data });
  }
  return out;
}

/** First letter bucket, for A-Z indexes. */
export const initial = (title: string) => (title.match(/[a-z0-9]/i)?.[0] ?? '#').toUpperCase();
