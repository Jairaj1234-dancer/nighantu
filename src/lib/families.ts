/**
 * Group resolved taxa into botanical families.
 *
 * Shared between the family index and the family pages so the two can never disagree
 * about which families exist or which entries are in them.
 *
 * WHICH MATCHES ARE GROUPED, and the distinction this used to miss.
 *
 * This took EXACT matches only, on the reasoning that "a fuzzy or higher-rank match is an
 * approximation, and an approximation silently filed under a family reads to a reader, and
 * to anything parsing the page, as a determination". That is right about FUZZY and it
 * collapses two different things.
 *
 *   FUZZY             GBIF guessed which name was meant, so WHICH ORGANISM is uncertain
 *                     and therefore so is its family. Still excluded.
 *   HIGHERRANK, GENUS the genus matched and the species epithet did not. The genus is
 *                     determined, and family membership is a property of the genus, so
 *                     the family IS determined even though the species is not.
 *
 * The test is not whether the match was exact. It is whether the answer depends on the
 * part that did not match, and a family never depends on the species. "Acacia catechu"
 * resolves to the genus Senegalia because the species was reassigned; Acacia and
 * Senegalia are both Fabaceae either way.
 *
 * WHAT A GENUS-RANK ENTRY SHOWS, which is the part that needed care. A species-rank entry
 * shows the binomial GBIF matched. A genus-rank entry has no binomial to show, so it
 * carries the name the page itself publishes and `genus` is set to what GBIF did resolve.
 * The templates render that difference visibly rather than printing a genus in a column
 * headed "Botanical name" and letting a reader take it for a species.
 */
export interface FamilyPage {
  kind: string; slug: string; title: string; botanical: string;
  /** Set only when GBIF resolved the genus but not the species. */
  genus?: string;
}
export interface FamilyGroup { family: string; slug: string; pages: FamilyPage[]; orders: string[] }

/** A family is determined when the part GBIF matched is enough to fix it. */
export function familyIsDetermined(t: any): boolean {
  if (t?.status !== 'ok' || !t?.family) return false;
  return t.matchType === 'EXACT' || (t.matchType === 'HIGHERRANK' && t.rank === 'GENUS');
}

export function familyGroups(taxonomy: any): FamilyGroup[] {
  const byFamily = new Map<string, FamilyGroup>();

  for (const t of taxonomy.taxa ?? []) {
    if (!familyIsDetermined(t)) continue;
    const genusOnly = t.matchType === 'HIGHERRANK';
    const family = String(t.family);
    const slug = family.toLowerCase();
    if (!byFamily.has(family)) byFamily.set(family, { family, slug, pages: [], orders: [] });
    const g = byFamily.get(family)!;
    if (t.order && !g.orders.includes(t.order)) g.orders.push(t.order);
    for (const p of t.pages ?? []) {
      // One species can be carried by several pages, and one page appears once.
      if (g.pages.some((x) => x.slug === p.slug && x.kind === p.kind)) continue;
      g.pages.push({
        kind: p.kind,
        slug: p.slug,
        title: p.title,
        // For a genus-rank match canonicalName is the GENUS, so it must not go in the
        // binomial column. The queried name is what the page publishes about itself.
        botanical: genusOnly ? (p.asPublished || t.query) : (t.canonicalName || t.query),
        ...(genusOnly ? { genus: String(t.canonicalName || '').trim() } : {}),
      });
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
