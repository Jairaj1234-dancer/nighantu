/**
 * The AFI's own classical-source strings: cleaning them, and knowing when not to publish them.
 *
 * src/data/composition.json records, for 101 formulations, the Ayurvedic Formulary of India's
 * statement of which classical text each formula comes from, with a locator: "Sahasrayoga,
 * Tailaprakarana, 11". It is the only authority this project holds that can confirm or contradict
 * a page's claim about a formula's origin, which makes it load-bearing. It is also OCR of a
 * printed book, so some of it is damaged.
 *
 * This lives in one place because two scripts need the SAME answer. fix-dose-attributions.mjs
 * writes the cleaned string onto a page; dose-provenance.mjs then checks the page against the
 * data. When each had its own copy of the cleaning rules, the checker compared a cleaned page
 * against a raw record and reported three pages as contradicting the AFI when they were simply
 * the fix working: `guloochyadi-kashayam` publishes "Adhyaya 2; 8½" where the record holds
 * "Adhydaya 2; 8%". Two implementations of one rule will always drift, and here the drift showed
 * up as a false accusation of a citation error, which is the exact failure the gate exists to
 * prevent.
 */

/**
 * Clean a source string for display without changing what it says.
 *
 * WHAT IS NOT DAMAGE. `½` is a real half-verse marker and standard in Sanskrit verse citation:
 * "Adhyaya 6; 26-28½" means verses 26 to 28 and a half. Eleven strings carry it correctly and
 * pass through untouched. The corruption is the opposite case, where the OCR read a printed ½ as
 * `%`: "73-74%", "15-19%", "8%". Reversing that is safe because `%` has no meaning in a verse
 * locator at all.
 *
 * The text names carry recognisable OCR damage too, always a spurious or dropped letter in a name
 * that recurs across the file: Sarmngadhara and Sarmgadhara are Sarngadhara, Astanghrdaya is
 * Astangahrdaya, Adhydaya is Adhyaya, Cikisasthana is Cikitsasthana.
 */
export const sanitiseSource = (s) => String(s)
  .replace(/(\d)\s*%/g, '$1½')
  /**
   * A full stop where the separator should be a comma. Every other entry reads
   * "Bhaisajyaratnavali, Jvaradhikara; 690-692"; two read "Bhaisajyaratnavali.
   * Agnimandyadirogadhikara; 37", which is the scanner reading a comma as a period. Worth
   * normalising rather than tolerating, because a sentence-ending period INSIDE a citation makes
   * the string ambiguous to anything that later tries to parse it back out of the page: the
   * provenance gate's own capture stopped at that period and reported the two pages as
   * contradicting the AFI when they agreed with it exactly.
   */
  .replace(/^([A-Za-z]+)\.\s+(?=[A-Z])/, '$1, ')
  .replace(/Sar[mn]+gadharasamhita/gi, 'Sarngadharasamhita')
  .replace(/Sarangadharasamhita/gi, 'Sarngadharasamhita')
  .replace(/Astangh[r̥r]daya/gi, 'Astangahrdaya')
  .replace(/Adhy?d?aya?ya|Adhayaya|Adhydaya/gi, 'Adhyaya')
  .replace(/Cikisasthana/gi, 'Cikitsasthana')
  .replace(/\s+/g, ' ')
  .replace(/\s*;\s*/g, '; ')
  .replace(/\s*,\s*/g, ', ')
  .replace(/\s*:\s*/g, ': ')
  .replace(/[.\s]+$/, '')
  .trim();

/**
 * Refuse a source string that has no business being published, and say why. Returns null when the
 * string is fit to print.
 *
 * Two kinds. An INTERNAL NOTE: a few entries carry the provenance reasoning written while
 * harvesting them, parentheticals about OCR line numbers and Devanagari colophons. Correct and
 * useful in the data file, and not something to put in a sentence on a public page. The check
 * looks for the note anywhere rather than inside brackets, because an earlier version required a
 * well-formed parenthesis and `triphala-guggulu` walked through it: its note begins after an
 * unbalanced bracket. These strings are OCR, where malformed punctuation is the normal case.
 *
 * An UNUSABLE LOCATOR: `aragvadhadi-kwath` reads "Adhayaya 15517", a chapter and verse run
 * together by the scanner into a number that cannot be a verse. Guessing where the boundary falls
 * is the kind of invention this project refuses everywhere else, so it goes to a human.
 */
export const refuseSource = (s) => {
  const raw = String(s);
  if (/\bOCR|printed thus|printed exactly|colophon|\blines?\s*\d{3,}/i.test(raw)) {
    return 'the AFI source string carries internal harvesting notes, which must not be published verbatim';
  }
  // Four-digit-plus numbers are never verse locators here; real years are excluded first.
  if (/\b\d{4,}\b/.test(raw.replace(/\b1[89]\d\d\b/g, ''))) {
    return 'the AFI source string has an unusable locator (a run-together chapter and verse); guessing the boundary is not acceptable';
  }
  return null;
};

/** Compare two source strings for equality after cleaning, for gates rather than for display. */
export const sameSource = (a, b) => {
  const key = (x) => sanitiseSource(x).toLowerCase().replace(/[^a-z0-9½]/g, '');
  return key(a) === key(b);
};
