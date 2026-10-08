import review from '../data/review.json';
import { pageDates } from './dates';

/**
 * Which pages a named practitioner has actually read.
 *
 * Review arrives in batches and will keep arriving, so this resolves a page against the
 * recorded scopes rather than against a single flag. The rule that matters: a page gets a
 * credit only if it falls inside a scope someone actually reviewed. Widening a claim to a
 * page the reviewer never opened is the exact dishonesty /reviewers/ exists to prevent, so
 * the scope lives in data and nothing here infers beyond it.
 *
 * Alphabetical ranges are matched on the slug's first character, which is the page's own
 * name reduced to ASCII, so "A to E" means what a reader would take it to mean.
 */
export interface ReviewEntry {
  id: string;
  kinds: string[];
  slugRange?: { from: string; to: string };
  label: string;
  detail: string;
  reviewedOn: string;
  outcome: string;
}

const data = review as any;
export const reviewer = data.reviewer as {
  name: string; qualification: string; affiliation: string; affiliationShort: string;
};
export const reviews: ReviewEntry[] = data.reviews ?? [];

/**
 * A review cannot cover a page that did not exist when it happened.
 *
 * The scopes in review.json are by kind and by slug range, which is the right shape while
 * review is catching up with a fixed corpus. It is the wrong shape as soon as the corpus grows
 * PAST a review: the full-corpus entry is dated 6 October 2026 and claims the kind `choosing`,
 * so a choosing page first published on 8 October inherited the credit, byline, date and
 * `lastReviewed` of a review that could not have read it. The page it happened to was the
 * composition comparison, which names seven companies and is the last page on this site that
 * should carry a credential it has not earned.
 *
 * review.json's own note says a credit on a page nobody read is the exact dishonesty
 * /reviewers/ exists to prevent. So the page's first-published date is part of the match, and an
 * entry older than the page is skipped.
 *
 * The date is resolved HERE rather than threaded in from six call sites, so that the next page
 * kind added to the site cannot forget to pass it. `publishedOn` stays as an explicit override
 * for a caller that already knows, and for tests.
 *
 * On a ledger miss pageDates returns the OLDEST date it knows, which is older than any review,
 * so a miss leaves the credit in place rather than stripping it from every page at once. That is
 * the right direction to fail in: site-audit catches a stamp that disagrees with the ledger.
 */
export function reviewFor(kind: string, slug: string, publishedOn?: string | null): ReviewEntry | null {
  const first = publishedOn ?? pageDates(kind, slug).published;
  for (const r of reviews) {
    if (!r.kinds.includes(kind)) continue;
    if (r.slugRange) {
      const initial = String(slug ?? '').trim().toLowerCase().charAt(0);
      if (!initial || initial < r.slugRange.from || initial > r.slugRange.to) continue;
    }
    // Same-day is allowed: a page published on the day of the review may well have been in it.
    if (first && r.reviewedOn && first > r.reviewedOn) continue;
    return r;
  }
  return null;
}

/**
 * The review as structured data, on the type that actually carries it.
 *
 * `reviewedBy` and `lastReviewed` are both properties of schema.org `WebPage`, not of
 * `Article`. We had `reviewedBy` hanging off the Article node, which is out of domain and,
 * worse, dropped the date entirely: an engine could read who reviewed the page but not when,
 * and the one fresh true date this site has was visible only as prose on /reviewers/.
 *
 * So the page emits a WebPage node alongside the Article and the review lives there, with
 * `mainEntity` pointing back at the Article so the two are one statement rather than two.
 *
 * `lastReviewed` is deliberately the review date, never `dateModified`. Those are different
 * facts and conflating them would be the freshness-faking that scripts/stamp-dates.mjs exists
 * to prevent: review can be recent on a page whose content has not changed since September,
 * and that is exactly what this site wants to be able to say.
 */
export function reviewPageNode(
  kind: string, slug: string, pageUrl: string, articleId: string, reviewersUrl: string,
  publishedOn?: string | null,
) {
  const entry = reviewFor(kind, slug, publishedOn);
  if (!entry) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': pageUrl,
    url: pageUrl,
    mainEntity: { '@id': articleId },
    lastReviewed: entry.reviewedOn,
    reviewedBy: {
      '@type': 'Person',
      name: reviewer.name,
      honorificSuffix: reviewer.qualification,
      // No `affiliation`. The institute's name carries the heritage term that
      // scripts/audit.mjs blocks everywhere but /reviewers/, which is where a reader can
      // check the credential in context. The url points there.
      url: reviewersUrl,
    },
  };
}

/** "18 September 2026", in a fixed zone so the date cannot shift with the builder's locale. */
export const formatReviewDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
