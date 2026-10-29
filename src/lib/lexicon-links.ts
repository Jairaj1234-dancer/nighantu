/**
 * Links between lexicon entries, from the entries' own fields.
 *
 * Most term pages were reachable only from the lexicon index: 269 of 278 had two internal links or
 * fewer pointing at them. Each entry already names the terms it must not be confused with and the
 * family it is filed under, so both can link without reading any prose.
 *
 * A "not to be confused with" term links only when its IAST spelling, diacritics included, is the
 * spelling of exactly one other entry. A shared or near spelling gets no link: as with the concept
 * links, a wrong link costs more than a missing one. Both the page and its Markdown twin read from
 * here so the two cannot disagree.
 */
import lexicon from '../data/lexicon.json';

type Rec = { slug: string; iast?: string; family?: string | null };
const records = (lexicon as any).records as Rec[];
const key = (s: string) => s.normalize('NFC').trim().toLowerCase();

const bySpelling = new Map<string, string[]>();
for (const r of records) {
  const k = key(r.iast ?? r.slug);
  bySpelling.set(k, [...(bySpelling.get(k) ?? []), r.slug]);
}

/** The slug of the one other entry spelled exactly `term`, or null. */
export function termSlug(term: string, self: string): string | null {
  const hits = (bySpelling.get(key(term)) ?? []).filter((s) => s !== self);
  return hits.length === 1 && (bySpelling.get(key(term)) ?? []).length === 1 ? hits[0] : null;
}

/** The other entries filed under the same family, by spelling. */
export function familyMembers(self: Rec): { slug: string; name: string }[] {
  if (!self.family) return [];
  return records
    .filter((r) => r.family === self.family && r.slug !== self.slug)
    .map((r) => ({ slug: r.slug, name: r.iast ?? r.slug }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
