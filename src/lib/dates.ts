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
export function pageDates(kind: string, slug: string): { published: string; modified: string } {
  const entry = LEDGER[`${kind}/${slug}`];
  if (entry) return { published: entry.published, modified: entry.modified };
  // A page with no ledger entry is new since the last stamp. Fall back to the most
  // recent date we do know about rather than to today, so a missing entry can never
  // manufacture a false "revised today".
  const known = Object.values(LEDGER).map((e) => e.modified).sort();
  const fallback = known[known.length - 1] ?? '2026-09-09';
  return { published: fallback, modified: fallback };
}

/** "9 September 2026" */
export const prettyDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
