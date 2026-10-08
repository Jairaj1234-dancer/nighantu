import ledger from '../data/page-dates.json';

type Entry = { hash: string; published: string; modified: string };
const LEDGER = ledger as Record<string, Entry>;

/**
 * Publication and modification dates for a page, from the committed ledger.
 *
 * Never build time. Stamping `new Date()` at build would tell search engines every
 * page was revised on every deploy, which is false, reads as a freshness-spam signal,
 * and contradicts the dated-and-sourced posture the whole site rests on.
 *
 * `scripts/stamp-dates.mjs` maintains the ledger and only advances `modified` when a
 * page's content actually changes.
 */
/**
 * The ledger is keyed by the content DIRECTORY, which is the Astro collection name, and is not
 * always the record's own `kind`. content/reference/*.md declares `kind: "hub"`, so looking up
 * `hub/adaptogenic` missed for all 53 reference pages, and the fallback below then stamped them
 * with today's date, which is the exact defect this whole mechanism exists to prevent. Callers
 * should pass `entry.collection`; `kind` is accepted and resolved for the ones that cannot.
 */
const KIND_TO_COLLECTION: Record<string, string> = { hub: 'reference' };

export function pageDates(kindOrCollection: string, slug: string): { published: string; modified: string } {
  const tried = [kindOrCollection, KIND_TO_COLLECTION[kindOrCollection]].filter(Boolean);
  for (const k of tried) {
    const entry = LEDGER[`${k}/${slug}`];
    if (entry) return { published: entry.published, modified: entry.modified };
  }

  /**
   * A page with no ledger entry at all.
   *
   * The previous fallback was "the most recent date we do know about", with a comment saying it
   * existed so that a missing entry could never manufacture a false "revised today". It did the
   * opposite: the most recent modified date in the ledger IS today as soon as any page is
   * modified today, so every lookup miss stamped today and said so in JSON-LD. 53 pages were
   * doing that in production.
   *
   * The OLDEST date is used instead. An understated date is a boring inaccuracy; an overstated
   * one is a freshness-spam signal on a reference work whose whole posture is dated, sourced
   * material. scripts/site-audit.mjs fails the build if a page's stamp and the ledger disagree,
   * so a miss is now caught rather than absorbed.
   */
  const known = Object.values(LEDGER).map((e) => e.published).sort();
  const fallback = known[0] ?? '2026-09-09';
  return { published: fallback, modified: fallback };
}

/** "9 September 2026" */
export const prettyDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
