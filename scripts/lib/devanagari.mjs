/**
 * Devanagari to IAST transliteration.
 *
 * Why this is mechanical and therefore safe to generate, when the names themselves are not.
 * A Devanagari string already encodes which sounds are present; rendering it in IAST is a
 * character mapping, not a claim about the world. So `बिल्व` becomes `bilva` deterministically
 * and nothing is asserted that was not already in the source string.
 *
 * What it does NOT do is decide whether `बिल्व` is a real Hindi name for Aegle marmelos. That
 * is a claim about usage, it cannot be derived from the characters, and it is what the
 * verification pass exists to settle.
 *
 * IAST rather than ISO 15919 because IAST is what Ayurvedic and Indological sources use, so a
 * reader comparing our page against the Ayurvedic Pharmacopoeia sees the same spelling.
 */

const VOWELS = {
  'अ': 'a', 'आ': 'ā', 'इ': 'i', 'ई': 'ī', 'उ': 'u', 'ऊ': 'ū',
  'ऋ': 'ṛ', 'ॠ': 'ṝ', 'ऌ': 'ḷ', 'ॡ': 'ḹ',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
  // Dravidian short e and o, present in Devanagari for loanwords and in Marathi.
  'ऎ': 'e', 'ऒ': 'o',
};

const MATRAS = {
  'ा': 'ā', 'ि': 'i', 'ी': 'ī', 'ु': 'u', 'ू': 'ū',
  'ृ': 'ṛ', 'ॄ': 'ṝ', 'ॢ': 'ḷ', 'ॣ': 'ḹ',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
  'ॆ': 'e', 'ॊ': 'o',
};

const CONSONANTS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ṅ',
  'च': 'c', 'छ': 'ch', 'ज': 'j', 'झ': 'jh', 'ञ': 'ñ',
  'ट': 'ṭ', 'ठ': 'ṭh', 'ड': 'ḍ', 'ढ': 'ḍh', 'ण': 'ṇ',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'ऩ': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ऱ': 'r', 'ल': 'l', 'ळ': 'ḷ', 'ऴ': 'ḻ', 'व': 'v',
  'श': 'ś', 'ष': 'ṣ', 'स': 's', 'ह': 'h',
  // Nukta consonants. Perso-Arabic sounds in Hindi plant names: क़ in qulfa, ज़ in zafran.
  'क़': 'q', 'ख़': 'ḳh', 'ग़': 'ġ', 'ज़': 'z', 'ड़': 'ṛ', 'ढ़': 'ṛh', 'फ़': 'f', 'य़': 'y',
};

const SIGNS = {
  'ं': 'ṃ',   // anusvara
  'ँ': 'ṁ',   // candrabindu, flattened to anusvara: the nasal is what a searcher types
  'ः': 'ḥ',   // visarga
  'ऽ': "'",   // avagraha
  '्': '',    // virama, handled in the loop
  '़': '',    // bare nukta, handled by composition below
};

const DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };

const VIRAMA = '्';
const NUKTA = '़';

/**
 * Returns the IAST form of a Devanagari string, or '' if there is nothing to transliterate.
 * Characters outside Devanagari (spaces, Latin letters, parentheses in Wikidata labels like
 * "बबूल (वृक्ष)") are passed through, because dropping them would silently mangle a name.
 */
export function toIAST(input) {
  if (!input || !/[ऀ-ॿ]/.test(input)) return '';
  // Normalise so precomposed nukta letters (क़ as one codepoint) and decomposed (क + ़) both work.
  const s = String(input).normalize('NFC');
  let out = '';

  for (let i = 0; i < s.length; i += 1) {
    let ch = s[i];

    // Fold a following nukta into the consonant so क + ़ is treated as क़.
    if (s[i + 1] === NUKTA && CONSONANTS[ch + NUKTA] !== undefined) {
      ch += NUKTA;
      i += 1;
    }

    if (CONSONANTS[ch] !== undefined) {
      out += CONSONANTS[ch];
      const next = s[i + 1];
      // The inherent 'a' is present unless a virama kills it or a matra replaces it.
      if (next === VIRAMA) {
        i += 1;
      } else if (MATRAS[next] !== undefined) {
        out += MATRAS[next];
        i += 1;
      } else {
        out += 'a';
      }
      continue;
    }

    if (VOWELS[ch] !== undefined) { out += VOWELS[ch]; continue; }
    if (MATRAS[ch] !== undefined) { out += MATRAS[ch]; continue; }   // stray matra, keep the sound
    if (SIGNS[ch] !== undefined) { out += SIGNS[ch]; continue; }
    if (DIGITS[ch] !== undefined) { out += DIGITS[ch]; continue; }
    if (ch === NUKTA) continue;

    out += ch;
  }

  return out.trim();
}

/**
 * A loose ASCII key for matching a name against a search query or an existing alias.
 *
 * Diacritics come off and the long and short vowels collapse, because that is what a person
 * types: someone looking for `bilva` will not type `bilvá`, and someone who heard "churna"
 * types churna, choorna or churn. Used only for deduplication and matching, never displayed.
 */
/**
 * A consonant-skeleton key, for recognising two romanisations of ONE name.
 *
 * The Pharmacopoeia prints every romanisation it has: Adhaki's Tamil row is "Tovarai,
 * Thovary, Adagi Tuvari, Thuvarai, Tuvarai, Thovarai", which is one name spelled five ways
 * and a second name. Showing all of them is noise, and a reader scanning for the Tamil name
 * cannot tell which of six to use.
 *
 * Vowels and aspiration are exactly what varies between transliterators, so dropping both
 * leaves the part that identifies the name: thovarai, tovarai, thuvarai and tuvarai all
 * reduce to tvr, while adagi tuvari reduces to dgtvr and stays separate.
 *
 * Only safe WITHIN one language's list for one drug. Two entries there that share a skeleton
 * are spelling variants; across drugs the same collapse would merge unrelated names, which is
 * why page-level matching uses the stricter asciiKey.
 */
export function skeletonKey(s) {
  return asciiKey(s)
    .replace(/([kgtdpbcjs])h/g, '$1')
    .replace(/w/g, 'v')
    .replace(/[aeiou]/g, '')
    .replace(/(.)\1+/g, '$1');
}

export function asciiKey(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ऀ-ॿ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}
