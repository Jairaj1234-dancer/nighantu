/**
 * The WHO 2022 entry for a lexicon term, read out of the renderings already on the record.
 *
 * A lexicon page should open by saying what the term means, and the most citable statement of
 * that is the WHO International Standard Terminologies on Ayurveda (2022). Most records already
 * carry a WHO rendering; this finds it and, where the locator holds the WHO description in quotes,
 * lifts that description out so the page can lead with it.
 *
 * It is deliberately strict, because the WHO text is licensed NoDerivs: it may be quoted unaltered
 * and attributed, never trimmed or reworded. So a description is used only when it is clearly
 * labelled as the entry's description (or follows the entry number directly), is a whole sentence,
 * and is short enough to stand as an opener without being cut. Anything doubtful falls back to the
 * entry number and the WHO English term, which are facts about the standard, and where there is no
 * ITA entry at all the page keeps its older opener.
 *
 * Only entries with an ITA number count. Codes such as DG0230 or SK0134 come from the earlier
 * NIA / WHO-APW draft list, which is a different document, and are not presented as WHO 2022.
 */
export type WhoLead = { ita: string; term: string; description: string | null };

const WHO = 'WHO International Standard Terminologies on Ayurveda';
const ITA = /ITA[-.](\d+(?:\.\d+)+)/;
const O = `['"‘“]`;
const C = `['"’”]`;
const END = `(?=\\s*$|\\s*[;,)]|\\.\\s|\\s+(?:Also|also|p\\.|\\())`;
const LABELLED = new RegExp(`description(?: given as)?\\s*:?\\s*${O}(.+?)${C}${END}`);
const DIRECT = new RegExp(`^\\s*ITA[-.][\\d.]+([^'"‘“]*?):\\s*${O}(.+?)${C}${END}`);
const MAX_WORDS = 60;
const MIN_WORDS = 5;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function whoLead(r: any): WhoLead | null {
  const all = (r.renderings ?? []).filter((y: any) =>
    String(y.sourceName ?? '').startsWith(WHO) && ITA.test(String(y.locator ?? '')));
  // Where we found that WHO has no entry for the term itself, only for narrower terms, none of
  // those narrower entries may stand as its meaning.
  if (all.some((y: any) => /has no (generic|separate)|no generic|no separate entry/i.test(String(y.assessment ?? '')))) return null;
  // A WHO entry recorded for a neighbouring sense (the disorder, the substance, the root organ)
  // is a comparator on the page, not the meaning of this term, so it is passed over.
  const x = all.find((y: any) =>
    !/\bnot\b|for the |disorder|separate|indirect|draft/i.test(String(y.sourceKind ?? ''))
    && !/^(vitiation|derangement|diminution|disorders? (of|due)|increase|decrease|depletion|aggravation)\b/i.test(String(y.english ?? '').trim()));
  if (!x) return null;
  // The entry that represents the term must itself be clean: verbatim, the WHO term as printed
  // (capitalised, with none of our notes, quotations or cross-references carried in it). A list
  // item inside a larger entry ("tongue (domain 4 of ...)") fails, and then the page keeps its
  // older opener rather than reaching for a later entry that may be a different sense.
  const en = String(x.english ?? '').trim();
  if (x.verbatim !== true
    || !/^[A-Z]/.test(en)
    || /^\(|no separate entry|not found|no entry|\bitem\b/i.test(en)
    || /\s['‘“"]|['’”"](\s|$)|^['‘“"]|—|ITA[-.]|description|;/.test(en)) return null;

  const loc = String(x.locator);
  let d: string | null = null;
  const m = loc.match(LABELLED);
  if (m) d = m[1];
  else {
    const n = loc.match(DIRECT);
    if (n && !/section|also|item/i.test(n[1])) d = n[2];
  }
  if (d) {
    // A locator sometimes runs on past the description into notes of our own
    // ("...code of conduct.' Sub-types ITA-9.2.72 ..."); keep only the quoted sentence.
    d = d.split(/(?<=[.!?])['’](?=\s)/)[0].trim();
    if (/\.\.\.|…/.test(d) || /['’]\s/.test(d.replace(/\w['’]\w/g, '')) || words(d) < MIN_WORDS || words(d) > MAX_WORDS) d = null;
  }
  return { ita: `ITA-${loc.match(ITA)![1]}`, term: String(x.english).trim(), description: d };
}
