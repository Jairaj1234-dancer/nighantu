import { getCollection } from 'astro:content';
import citations from '../data/citations.json';
import research from '../data/research.json';
import safety from '../data/safety.json';
import composition from '../data/composition.json';

/**
 * Terms from the Drugs and Magic Remedies (Objectionable Advertisements) Act 1954 schedule.
 *
 * Reference text that carries them is exempt under s.14(b) as a bona fide treatise; anything
 * commercial beside it (a product, or a link to a sales channel) is what makes the page an
 * advertisement. See ProductModule.astro for the full reasoning. Every component that puts
 * anything commercial on a page asks scheduledTermsOn() first and renders nothing on a hit.
 *
 * scripts/audit.mjs keeps its own copy of this list, deliberately: the gate should not trust the
 * code it is checking.
 */
export const SCHEDULED_TERMS = [
  // s.3(b), the sexual-pleasure limb, which is the bulk of enforcement.
  'aphrodisiac', 'vajikarana', 'sexual pleasure', 'sexual vigour', 'sexual vigor',
  'libido', 'impotence', 'erectile', 'premature ejaculation', 'spermatogenic',
  // s.3(a) and (c): procurement of miscarriage, and correction of menstrual disorders.
  'abortifacient', 'miscarriage',
];

const cache = new Map<string, any[]>();

/** The scheduled terms found on the `collection` page for `slug`, or an empty list. */
export async function scheduledTermsOn(slug: string, collection: 'herb' | 'formulation' = 'herb'): Promise<string[]> {
  if (!cache.has(collection)) cache.set(collection, (await getCollection(collection).catch(() => [])) as any[]);
  const self = cache.get(collection)!.find((e) => e.data?.slug === slug);
  // The page is more than its markdown: the reference list, the evidence summary, the safety
  // panel and the composition table are rendered from datasets, and a scheduled term in a cited
  // paper's title counts as much as one in the prose. scripts/audit.mjs checks the built HTML
  // and will fail on anything this misses.
  const papers = (research as any).papers.filter((p: any) =>
    (p.subjects ?? []).some((x: any) => x.kind === collection && x.slug === slug));
  const haystack = [
    self?.body ?? '',
    JSON.stringify(self?.data ?? {}),
    JSON.stringify((citations as any).pages?.[`${collection}/${slug}`] ?? ''),
    JSON.stringify(papers),
    JSON.stringify((safety as any).records?.[slug] ?? ''),
    JSON.stringify((composition as any).records?.[slug] ?? ''),
  ].join(' ').toLowerCase();
  return SCHEDULED_TERMS.filter((t) => haystack.includes(t));
}
