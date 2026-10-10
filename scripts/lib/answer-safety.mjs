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

/**
 * A QUANTITY WITH A UNIT, with no frequency word required.
 *
 * DOSE_PATTERNS' second rule needs "daily", "twice", "per day" or similar within 40 characters of
 * the figure, and nine answer blocks stated a dose without one, so the gate passed them:
 *
 *   herb/camphor      "INTERNAL: 60-125mg purified camphor (Ayurvedic Pharmacopoeia); CAUTION: ..."
 *   herb/kalonji      "Listed in the Pharmacopoeia of India at recommended dose of 0.5-4 g ..."
 *   herb/menthol      "Oral (lozenges): 5-10 mg per lozenge. Inhalation: 2-5 drops in steam."
 *
 * A quantity in a milligram or millilitre is a dose whether or not the sentence says how often, and
 * on camphor the omission made it worse, not better: the figure shipped and the "under expert
 * supervision" that qualified it sat past the 155 characters a search result displays.
 *
 * WHY IT IS NOT SIMPLY ADDED TO DOSE_PATTERNS. /practice/matra-basti/ reads "Mātrā Basti is a
 * small-dose oil enema. The record gives 30 to 60 ml of warm medicated oil, given by a therapist
 * or, once taught, self-administered." The quantity IS the definition there, it is attributed to
 * the record, and the page describes a procedure rather than offering a substance. The house rule's
 * reason, stated above, is that a dose from a company that sells the substance reads as
 * prescribing; a procedure in `practice/` is not that, and this file already distinguishes what is
 * barred from an answer from what is fine in a body. So the caller says which collection it is
 * asking about, and nothing is exempted by name.
 */
export const QUANTITY = /\b\d+(?:\.\d+)?\s*(?:-|to|–|and)?\s*\d*(?:\.\d+)?\s*(?:mg|mcg|µg|g|gm|kg|ml|mL|l|tsp|tbsp|drops?|tablets?|capsules?|lozenges?)\b/i;

/** Collections where a bare quantity in the answer block is a dose. */
export const DOSED_KINDS = new Set(['herb', 'formulation', 'device', 'product']);

export const DOSE_PATTERNS = [
  // The labels as the vault prints them, each followed by a colon. The colon matters: a
  // page may legitimately discuss "the dosage form" as a category, which an unanchored
  // "dosage form" pattern read as a dose and refused.
  /\b(standard dosage\s*:?|dosage forms?\s*:|usual dose|dose\s*:|dosage\s*:)/i,
  // "3-6 g powder twice daily", "500mg-1g extract capsule twice daily"
  /\b\d+(?:\.\d+)?\s*(?:-|to|–)?\s*\d*\s*(?:mg|g|gm|ml|tsp|tablets?|capsules?)\b[^.]{0,40}\b(?:daily|twice|thrice|per day|bd|tds)\b/i,
];

/**
 * A LEAKED DATA STRUCTURE, which is a fault whatever it says.
 *
 * Four pages carried a raw Python dict in the answer block, and therefore in the meta description a
 * searcher is shown: vatsanabha (aconite), bhanga (cannabis), jayapala (croton) and ahiphena
 * (opium). The four most hazardous substances in this corpus, reading
 * `{'use': 'Analgesic and pain management', 'validation': 'Morphine remains the gold standard...'`.
 *
 * NONE OF THEM TRIPPED isDiseaseClaim, because that test is a conjunction of a disease word and an
 * efficacy word and the disease list has no "pain", "fever", "constipation" or "spasticity". The
 * conjunction is the right design and widening the word lists is the riskier fix, so this is the
 * orthogonal one: a serialised dict or list has no business in a sentence meant for a reader, and
 * testing for it cannot produce a false positive on legitimate prose.
 *
 * It also catches the class of fault rather than these four instances. An answer composed from a
 * field that was never meant to be prose is wrong even when the prose inside it is harmless.
 */
/**
 * Only unambiguous serialisations. The first version also matched any sentence beginning with "["
 * and I recorded that it had "flagged 61 legitimate markdown links", a 94% false-positive rate, so
 * I narrowed it.
 *
 * THOSE LINKS WERE NOT LEGITIMATE. They were 60 pages whose answer block, and therefore whose meta
 * description, carried a raw `[Study title](https://pubmed...)` where a sentence about the drug
 * belonged, including a COVID prophylaxis claim on /formulation/chyawanprash/. The check had found
 * a real defect on its first run and I taught it to stop reporting it, because I read a 94% false
 * positive rate off the wrong denominator: the links were not false positives, they were the
 * finding. A narrowed check and a fixed defect look identical in the output.
 *
 * The narrowing itself was still right, for the reason given: a sentence may legitimately open with
 * a bracket. What was wrong was narrowing it INSTEAD of looking at what it caught. Markdown in an
 * answer block now has its own test below, which cannot be satisfied by prose.
 */
export const LEAKED_STRUCTURE = /\{\s*['"][a-z_]+['"]\s*:|\[\s*\{\s*['"]|^\s*\{/;
export const isLeakedStructure = (sentence) => LEAKED_STRUCTURE.test(String(sentence));

/**
 * MARKUP, which an answer block may never contain whatever it says.
 *
 * answer.mjs composes the block partly from the body, including the section lib/claims.mjs fills
 * with `[Title](url). *Journal*. PMID [id](url)`, and it strips markup through lib.mjs stripMarkup,
 * which knew about Obsidian wikilinks, bold, italic and code but not about a standard markdown
 * link. So the one markup form the body uses most often was the one form that survived.
 *
 * This is the orthogonal test, as the leaked-structure one is: it says nothing about whether the
 * text is safe, only that a link is not a sentence, and prose cannot trip it by accident. It also
 * catches the claim class that isDiseaseClaim is built to miss, because a study title asserts by
 * naming rather than predicating: "Antitumor Activity of the Ethanolic Extract from Syzygium
 * aromaticum in Colorectal Cancer Xenograft Mice" carries the disease word and no efficacy verb.
 */
export const MARKUP = /\[[^\]]*\]\(\s*https?:\/\/[^)]*\)|\[\[|\]\]|\bPMID \[|\]\(\s*https?:/;
export const isMarkup = (sentence) => MARKUP.test(String(sentence));

/**
 * A BIBLIOGRAPHIC LINE, for the composer rather than for the gate.
 *
 * lib/claims.mjs renders one cited finding as
 *   - Kataria D, Singh G 2024. [Title](url). *Journal of Ayurveda ...*. PMID [id](url) · [doi:x](u)
 * and shortfallNote appends an italic note about untraceable claims. answer.mjs draws candidate
 * sentences from that very section, so every one of those pieces has been a candidate for the
 * opening sentence of a page.
 *
 * This is deliberately WIDER than the `markup` gate and used only to disqualify candidates, never
 * to fail a build. The asymmetry is the existing design in this file: the composer filters first,
 * where a false positive costs one candidate sentence, and the audit fails second, where a false
 * positive costs a deploy. So the three tests here may be slightly greedy, and each must match a
 * WHOLE sentence to fire.
 */
const AUTHOR_YEAR = /^(?:[A-Z][A-Za-z'’-]+(?: [A-Z]{1,3})?, )*[A-Z][A-Za-z'’-]+(?: [A-Z]{1,3})?(?: and others)? (?:19|20)\d{2}\.?$/;
const WHOLLY_EMPHASISED = /^\*[^*]+\*\.?$/;

export function isBibliographic(sentence) {
  const s = String(sentence).trim();
  return isMarkup(s) || AUTHOR_YEAR.test(s) || WHOLLY_EMPHASISED.test(s);
}

export const isDose = (sentence) => DOSE_PATTERNS.some((r) => r.test(String(sentence)));

export const isDiseaseClaim = (sentence) => DISEASE_WORD.test(String(sentence)) && EFFICACY_WORD.test(String(sentence));

/**
 * Every barred sentence in a composed block, for the audit's error message.
 *
 * `kind` is the collection the answer belongs to, and it only ever widens the dose test: omit it
 * and the behaviour is exactly what it was before QUANTITY existed, so every existing caller keeps
 * working. Pass it from the audit, where the collection is known, so a herb page's bare milligram
 * figure is caught and a procedure page's defining volume is not.
 */
export function answerViolations(answer, { kind } = {}) {
  const out = [];
  const quantityCounts = kind === undefined ? false : DOSED_KINDS.has(kind);
  for (const sentence of String(answer).split(/(?<=[.!?])\s+/)) {
    if (isDose(sentence)) out.push({ kind: 'dose', sentence });
    /**
     * `quantity`, NOT `dose`. The bare-figure rule catches three different things and only one of
     * them is a dose: herb/godanti-bhasma's "LD50 in Class IV (>2000 mcg/kg)" is a toxicology
     * figure and herb/kalmegh's "limited aqueous solubility (50 μg/mL)" is a physical property.
     * All three are wrong in the sentence a search result shows, for different reasons, and
     * reporting a solubility as a dose would send a reader looking for a prescription that is not
     * there. audit.mjs used to collapse every non-dose kind into "claims an effect on a disease"
     * for exactly this sort of reason, and the fix was to stop guessing at the caller.
     */
    else if (quantityCounts && QUANTITY.test(sentence)) out.push({ kind: 'quantity', sentence });
    else if (isLeakedStructure(sentence)) out.push({ kind: 'structure', sentence });
    else if (isMarkup(sentence)) out.push({ kind: 'markup', sentence });
    else if (isDiseaseClaim(sentence)) out.push({ kind: 'claim', sentence });
  }
  return out;
}
