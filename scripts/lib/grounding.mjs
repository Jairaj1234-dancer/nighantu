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

/**
 * Quantities carry the most risk and are the easiest to check, so they get their own pass.
 *
 * The unit is REQUIRED, and that is the whole design. A bare integer in Ayurvedic prose is
 * almost never a measurement: "107 marma points" is a classical enumeration and "Cikitsā
 * 2.1-4" is a chapter and its pādas. An earlier version matched bare numbers and held two
 * correct pages for exactly those two strings. What actually needs checking is an invented
 * dose, duration or temperature, and those all carry a unit.
 */
const NUMBER = /\b\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:%|ml|mg|kg|g|cm|mm|min(?:ute)?s?|hours?|hrs?|days?|weeks?|months?|°?\s*[CF]|degrees?)\b/gi;

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

/**
 * Fold an Ayurvedic drug name to a comparable key.
 *
 * Stripping diacritics alone is not enough, and the first version of this check failed
 * loudly because of it: it flagged Vacā, Yavakṣāra and Snuhī as invented plants when all
 * three are on the site, spelled Vacha, Yavakshara and Snuhi. IAST and the anglicised
 * spellings the corpus uses disagree about the retroflex and sibilant series, so the two
 * have to be folded onto the same skeleton before they can be compared. Over-rejecting
 * here is not a safe failure: it hides real content behind a gate that looks principled.
 */
function foldName(s) {
  return String(s).toLowerCase()
    .replace(/[śṣ]/g, 'sh')
    .replace(/ṛ/g, 'ri').replace(/ḷ/g, 'li')
    .replace(/[ṭḍ]/g, (c) => (c === 'ṭ' ? 't' : 'd'))
    .replace(/[ṇñṅṃ]/g, 'n').replace(/ḥ/g, 'h')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, ' ')
    // The corpus writes the same sound both ways: vacha and vaca, ghrita and ghrta.
    .replace(/ch/g, 'c').replace(/sh/g, 's')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Named plants that do not exist anywhere in the corpus.
 *
 * `knownNames` should include formulations as well as herbs: a procedure legitimately
 * names medicated oils such as Aṇu Taila, which are formulations rather than single
 * drugs, and treating those as invented would be wrong.
 */
export function unknownDravyas(names = [], knownNames) {
  const known = knownNames instanceof Set ? knownNames : new Set(knownNames ?? []);
  const knownNorm = new Set();
  for (const n of known) { const f = foldName(n); knownNorm.add(f); knownNorm.add(f.replace(/ /g, '')); }
  // Generic substance words that are not drugs with their own page.
  // Written in the folded form this function produces, not in IAST, because comparing
  // an unfolded list against folded input is how the first version let ghrita through.
  const GENERIC = new Set(['ghrita', 'ghrta', 'taila', 'jala', 'ksira', 'ksirabala', 'dugdha',
    'madhu', 'lavana', 'curna', 'kvatha', 'svarasa', 'kalka', 'paka', 'vati', 'arka',
    'water', 'oil', 'ghee', 'milk', 'honey', 'salt', 'powder', 'paste', 'decoction']);

  return names.filter((n) => {
    const k = foldName(n).replace(/\(.*?\)/g, '').trim();
    if (!k) return false;
    if (knownNorm.has(k)) return false;
    if (knownNorm.has(k.replace(/ /g, ''))) return false;   // Śveta-marica vs Svetamarica
    if (GENERIC.has(k)) return false;
    const words = k.split(' ').filter(Boolean);
    // Known if any meaningful word matches a known drug: "tila taila" is sesame oil,
    // "Anu Taila" is a named formulation, "Saindhava (rock salt)" is saindhava-lavana.
    return !words.some((w) => w.length > 2 && !GENERIC.has(w) && [...knownNorm].some(
      (kn) => kn === w || kn.split(' ').includes(w),
    ));
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
