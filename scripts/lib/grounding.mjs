/**
 * Deterministic checks for generated prose.
 *
 * The judge panels catch a lot, but they are models auditing models, and this project has
 * already watched that fail: a four-lens safety panel passed 25 records and an independent
 * auditor then rejected the first three it sampled. Anything that can be checked without
 * judgement should be, because those checks do not have a bad day.
 *
 * These are narrow on purpose. They cannot tell whether a sentence is true. They can tell
 * whether a number in the prose appears anywhere in the source it was supposedly written
 * from, and whether a plant it names exists in the corpus. Both are strong hallucination
 * signals precisely because a model writing fluently does not notice inventing them:
 * an earlier record in this project asserted a test article was "sourced as a single
 * commercial batch", a detail its cited paper never contained.
 */

/** Quantities carry the most risk and are the easiest to check, so they get their own pass. */
const NUMBER = /\b\d+(?:[.,]\d+)?\s*(?:%|ml|l|mg|g|kg|cm|mm|min(?:ute)?s?|hours?|hrs?|days?|weeks?|months?|years?|times?|°?\s*[CF]\b)?/gi;

const normaliseNumber = (s) => s.toLowerCase()
  .replace(/\s+/g, '')
  .replace(/,/g, '.')
  .replace(/minutes?|mins?/, 'min')
  .replace(/hours?|hrs?/, 'hour')
  .replace(/°/, '');

/**
 * Numbers that appear in the prose but nowhere in the source it was written from.
 *
 * A bare integer under 4 is ignored: "three doshas", "the first step", "two weeks" as an
 * ordinal are ordinary prose rather than invented measurements, and flagging them would
 * bury the real finds.
 */
export function ungroundedNumbers(body, sourceText) {
  const src = normaliseNumber(String(sourceText ?? ''));
  const found = new Map();
  for (const m of String(body ?? '').matchAll(NUMBER)) {
    const raw = m[0].trim();
    const n = normaliseNumber(raw);
    if (/^\d{1,3}$/.test(n) && Number(n) <= 3) continue;   // ordinals and small counts
    if (src.includes(n)) continue;
    // A range in the source ("3-6 g") covers its endpoints written separately.
    const bare = n.replace(/[a-z%]+$/i, '');
    if (bare && src.includes(bare)) continue;
    found.set(raw, (found.get(raw) ?? 0) + 1);
  }
  return [...found.keys()];
}

/** Named plants that do not exist anywhere in the corpus. */
export function unknownDravyas(names = [], knownNames) {
  const known = knownNames instanceof Set ? knownNames : new Set(knownNames ?? []);
  const norm = (s) => String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')      // strip IAST diacritics
    .replace(/[^a-z ]/g, '').trim();
  const knownNorm = new Set([...known].map(norm));
  return names.filter((n) => {
    const k = norm(n);
    if (!k) return false;
    if (knownNorm.has(k)) return false;
    // A multi-word name counts as known if any word matches a known drug: "tila taila"
    // is sesame oil and tila is on the site.
    return !k.split(' ').some((w) => w.length > 3 && knownNorm.has(w));
  });
}

/** Every claim in the body should appear in the grounding list. */
export function unlistedClaims(body, grounding = []) {
  const listed = grounding.map((g) => String(g.claim ?? '').toLowerCase());
  const sentences = String(body ?? '')
    .replace(/^#{1,6}\s.*$/gm, '')                          // headings are not claims
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/[*_`>-]/g, '').trim())
    .filter((s) => s.length > 40);

  // A sentence counts as grounded if a grounding entry shares a distinctive run of it.
  return sentences.filter((s) => {
    const key = s.toLowerCase().slice(0, 45);
    return !listed.some((l) => l.includes(key.slice(0, 30)) || key.includes(l.slice(0, 30)));
  });
}
