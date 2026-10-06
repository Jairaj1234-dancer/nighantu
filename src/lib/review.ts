import review from '../data/review.json';

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

export function reviewFor(kind: string, slug: string): ReviewEntry | null {
  for (const r of reviews) {
    if (!r.kinds.includes(kind)) continue;
    if (r.slugRange) {
      const first = String(slug ?? '').trim().toLowerCase().charAt(0);
      if (!first || first < r.slugRange.from || first > r.slugRange.to) continue;
    }
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
) {
  const entry = reviewFor(kind, slug);
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
