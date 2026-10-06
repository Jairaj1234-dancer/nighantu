/** Evidence tiers, strongest first. Matches the companion project's scheme. */
export const TIER_ORDER = ['A', 'B', 'C', 'D'] as const;

export const TIER_LABEL: Record<string, string> = {
  A: 'Systematic reviews and meta-analyses',
  B: 'Randomised controlled trials',
  C: 'Other clinical studies and reviews',
  D: 'Laboratory and animal studies',
};

/** Plain-language note per tier, for readers who do not read evidence hierarchies. */
export const TIER_NOTE: Record<string, string> = {
  A: 'Pooled analyses of multiple studies. The strongest form of evidence listed here.',
  B: 'Controlled trials in people.',
  C: 'Individual clinical studies, observational work and narrative reviews.',
  D: 'Cell-culture and animal work. Does not show an effect in people.',
};

/**
 * Papers per page on a research tier listing.
 *
 * Lives here rather than in the route because Astro hoists getStaticPaths into its own
 * scope, where component-level constants are not visible; the route needs the same number in
 * both places. Tier D held 1,587 papers on one URL, which built to 1,036 KB of HTML and
 * 6,441 links, and Bing flags the page as too long.
 */
export const PAPERS_PER_PAGE = 150;
