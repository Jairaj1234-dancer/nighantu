/**
 * How a lexicon term reaches the concept records that use it.
 *
 * The concept pages already link forward: each names the terms it is built from and links every one
 * that resolved to a lexicon entry. Nothing pointed back, so the richer page was reachable from a
 * term only by guessing the URL. This computes the reverse, and both the term page and its markdown
 * twin read it from here so the two cannot disagree.
 *
 * TWO DIFFERENT RELATIONS, kept apart because they say different things.
 *
 *   subject    The concept record is ABOUT this term. Established by the slug: exact, or the
 *              concept slug is the term slug plus a suffix, so `agni` is the subject of
 *              `agni-and-digestion` and `tridosha` of `tridosha-theory`. The longest matching term
 *              wins, so `dosha-dushya-sammurchana` is the subject of its own record and `dosha` is
 *              not, which is the one case where a shorter term would otherwise claim it.
 *
 *   component  The concept names this term as one of the parts it is built from, and the concept
 *              export resolved that name to this slug. This carries the concept's own gloss of the
 *              term, which is the interesting part: two concepts gloss the same term differently.
 *
 * Nothing here matches on prose or on a term's English renderings. A wrong link between two corpora
 * that both claim to be checked costs more than a missing one, and slug identity is the only
 * evidence available at build time that is not a guess.
 */

export type ConceptSubjectLink = { slug: string; title: string; summary: string | null };
export type ConceptComponentLink = { slug: string; title: string; term: string; gloss: string | null };

type ConceptRecord = {
  slug: string;
  title: string;
  summary?: string | null;
  components?: { term?: string; gloss?: string | null; lexicon?: string | null }[];
};

/** The term slug a concept record is about, or null. The longest candidate wins. */
export function subjectTermOf(conceptSlug: string, termSlugs: Set<string>): string | null {
  if (termSlugs.has(conceptSlug)) return conceptSlug;
  let best: string | null = null;
  for (const t of termSlugs) {
    if (!conceptSlug.startsWith(`${t}-`)) continue;
    if (!best || t.length > best.length) best = t;
  }
  return best;
}

export function conceptLinksFor(
  termSlug: string,
  concepts: ConceptRecord[],
  termSlugs: Set<string>,
): { subject: ConceptSubjectLink[]; components: ConceptComponentLink[] } {
  const subject: ConceptSubjectLink[] = [];
  const components: ConceptComponentLink[] = [];

  for (const c of concepts) {
    if (subjectTermOf(c.slug, termSlugs) === termSlug) {
      subject.push({ slug: c.slug, title: c.title, summary: c.summary ?? null });
      // A record that is ABOUT the term does not also need listing as one that merely uses it.
      continue;
    }
    for (const x of c.components ?? []) {
      if (x.lexicon !== termSlug) continue;
      components.push({ slug: c.slug, title: c.title, term: x.term ?? termSlug, gloss: x.gloss ?? null });
    }
  }

  const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);
  return { subject: subject.sort(byTitle), components: components.sort(byTitle) };
}
