/**
 * What may not appear in an answer block.
 *
 * The answer block is 40-60 words at the top of every page. It is what a reader sees first,
 * what the JSON-LD carries, and the passage an answer engine is most likely to quote whole.
 * That makes it the riskiest sentence on the site, so two classes of statement are barred
 * from it that are perfectly acceptable in the body, where they keep their framing.
 *
 * DOSE. 492 of the herb blocks read "Usual dose: 3-6 g powder twice daily". The classical
 * dose is legitimate reference material, but stated in the opening sentence by a company
 * that sells the substance it reads as prescribing rather than describing. It stays on the
 * page, in the body, under the heading that frames it as what the literature says.
 *
 * DISEASE CLAIM. The composer's last-resort branch scrapes prose from anywhere on the page,
 * including cited research sections, which is how one bhasma page's block came to assert
 * cytotoxicity "in breast cancer cell lines". True of the study; a cancer claim on the page.
 *
 * The disease test is a CONJUNCTION of a disease word and a word asserting an effect. That
 * is deliberate: naming a pharmacological class ("adaptogenic agents", "antidiabetic
 * activity" as a heading) is not claiming a cure, and a bare disease-word test would strip
 * the answer block off every reference hub on the site.
 *
 * Both are used twice over: answer.mjs filters them out of the sentence pool before the
 * block is composed, and audit.mjs fails the build if one reaches a page anyway. The
 * composer filtered them last at first, which left 22 pages with a two-word answer because
 * the word-count fallbacks had already spent their budget on dosage prose.
 */

export const DISEASE_WORD = /\b(cancer|carcinoma|tumours?|tumors?|diabet\w*|arthrit\w*|asthma|depress\w*|anxiety|insomnia|hypertens\w*|infertil\w*|epilep\w*|alzheimer\w*|parkinson\w*|psorias\w*|eczema|colitis|ulcers?|dementia|obesity)\b/i;

export const EFFICACY_WORD = /\b(cures?|treats?|heals?|reverses?|prevents?|eliminates?|manages?|management|therapy|therapeutic|efficacy|effective|inhibit\w*|reduc\w*|improv\w*|ameliorat\w*|cytotox\w*|apoptosis|activity against|used for|indicated (?:in|for))\b/i;

export const DOSE_PATTERNS = [
  // The labels as the vault prints them, each followed by a colon. The colon matters: a
  // page may legitimately discuss "the dosage form" as a category, which an unanchored
  // "dosage form" pattern read as a dose and refused.
  /\b(standard dosage\s*:?|dosage forms?\s*:|usual dose|dose\s*:|dosage\s*:)/i,
  // "3-6 g powder twice daily", "500mg-1g extract capsule twice daily"
  /\b\d+(?:\.\d+)?\s*(?:-|to|–)?\s*\d*\s*(?:mg|g|gm|ml|tsp|tablets?|capsules?)\b[^.]{0,40}\b(?:daily|twice|thrice|per day|bd|tds)\b/i,
];

export const isDose = (sentence) => DOSE_PATTERNS.some((r) => r.test(String(sentence)));

export const isDiseaseClaim = (sentence) => DISEASE_WORD.test(String(sentence)) && EFFICACY_WORD.test(String(sentence));

/** Every barred sentence in a composed block, for the audit's error message. */
export function answerViolations(answer) {
  const out = [];
  for (const sentence of String(answer).split(/(?<=[.!?])\s+/)) {
    if (isDose(sentence)) out.push({ kind: 'dose', sentence });
    else if (isDiseaseClaim(sentence)) out.push({ kind: 'claim', sentence });
  }
  return out;
}
