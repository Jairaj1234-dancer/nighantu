/**
 * Group resolved taxa into botanical families.
 *
 * Shared between the family index and the family pages so the two can never disagree
 * about which families exist or which entries are in them.
 *
 * Only EXACT GBIF matches are grouped. A fuzzy or higher-rank match is an
 * approximation, and an approximation silently filed under a family reads to a reader,
 * and to anything parsing the page, as a determination.
 */
export interface FamilyPage { kind: string; slug: string; title: string; botanical: string; }
export interface FamilyGroup { family: string; slug: string; pages: FamilyPage[]; orders: string[]; }

export function familyGroups(taxonomy: any): FamilyGroup[] {
  const byFamily = new Map<string, FamilyGroup>();

  for (const t of taxonomy.taxa ?? []) {
    if (t.status !== 'ok' || t.matchType !== 'EXACT' || !t.family) continue;
    const family = String(t.family);
    const slug = family.toLowerCase();
    if (!byFamily.has(family)) byFamily.set(family, { family, slug, pages: [], orders: [] });
    const g = byFamily.get(family)!;
    if (t.order && !g.orders.includes(t.order)) g.orders.push(t.order);
    for (const p of t.pages ?? []) {
      // One species can be carried by several pages, and one page appears once.
      if (g.pages.some((x) => x.slug === p.slug && x.kind === p.kind)) continue;
      g.pages.push({ kind: p.kind, slug: p.slug, title: p.title, botanical: t.canonicalName || t.query });
    }
  }

  for (const g of byFamily.values()) g.pages.sort((a, b) => a.title.localeCompare(b.title));
  return [...byFamily.values()].sort((a, b) => b.pages.length - a.pages.length || a.family.localeCompare(b.family));
}

/**
 * The floor for giving a family its own page. Exported rather than repeated, because a
 * page linking to a family that never got built is a broken link, and that is exactly
 * what happened when the threshold lived in two places.
 */
export const FAMILY_PAGE_MIN = 3;

/** Families that actually have a page, for anything that wants to link to one. */
export function familiesWithPages(taxonomy: any): Set<string> {
  return new Set(
    familyGroups(taxonomy).filter((g) => g.pages.length >= FAMILY_PAGE_MIN).map((g) => g.family),
  );
}
