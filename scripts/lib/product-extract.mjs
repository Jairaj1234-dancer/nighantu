/**
 * Read what a product page states, without interpreting it.
 *
 * This is the deterministic half of the comparison. It answers questions of fact about a page:
 * does it name its ingredients, does it give any of them a quantity, does it state a dose, does
 * it cite the formulary. Judging whether the stated composition MATCHES a formulary entry is a
 * separate step and needs a model; this step must not, because a model reading 209 pages would
 * be both expensive and unaccountable, and the useful findings here are about absence.
 *
 * THE CENTRAL DISTINCTION. "This page publishes no composition" and "this code failed to find
 * the composition" are different claims, and only the first is publishable. So every answer
 * carries how it was reached and the text it was reached from, and a page that this code cannot
 * read at all is reported as unreadable rather than as empty. Three cases are separated:
 *
 *   found        a composition block was located, with the snippet it came from
 *   absent       the page has substantial readable text and no composition block in it
 *   unreadable   the page has almost no text, which on these sites means it renders client-side
 *
 * The third case matters more than it looks. A page whose composition exists only after
 * JavaScript runs is a page no answer engine can cite for its own product, and that is a finding
 * about the company's position rather than a failure of this script.
 */

import { buildMatcher } from './formulation-names.mjs';

/** Characters HTML escapes that have to come back before any text is matched. */
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '\u2013', mdash: '\u2014',
  rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c', hellip: '\u2026',
  frac12: '\u00bd', frac14: '\u00bc', frac34: '\u00be', deg: '\u00b0', middot: '\u00b7',
};

export const decodeEntities = (s) => String(s)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z][a-z0-9]*);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);

/**
 * HTML to text, keeping block boundaries as newlines.
 *
 * Block boundaries are the whole point: a composition is almost always a list or a table, and
 * flattening it to one line destroys the row structure that makes a quantity attributable to an
 * ingredient. Table cells become tab-separated so a row stays one line.
 */
export const htmlToText = (html) => decodeEntities(String(html)
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<\/(td|th)>\s*/gi, '\t')
  .replace(/<\/(tr|li|p|div|h[1-6]|section|article|dd|dt)>/gi, '\n')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, ' '))
  .replace(/\u00a0/g, ' ')
  .replace(/[ \t]*\n[ \t]*/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/[ ]{2,}/g, ' ')
  .trim();

/**
 * Text that a framework shipped inside the HTML but did not render as HTML.
 *
 * Shree Dhootapapeshwar's pages are 72 KB of HTML that render 73 characters of text, so the first
 * pass recorded all 32 of them as client-rendered and therefore unreadable. They are not: the
 * product data is in the HTML, in the React Server Components flight stream, as a sequence of
 * `self.__next_f.push([1, "<json string>"])` calls. It was served to this agent in the response
 * it asked for. Decoding it needs no second request, no JavaScript execution and no change of
 * identity; it is reading the document that was sent.
 *
 * And the content is not marginal. Those pages carry a full composition with a milligram figure
 * for every ingredient, a dose and an indication, which is exactly what the comparison exists to
 * compare and exactly what a survey of the rendered text concluded was absent.
 */
export const frameworkPayload = (html) => {
  let out = '';
  for (const m of String(html).matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try { out += JSON.parse(m[1]); } catch { /* a truncated chunk is not a reason to stop */ }
  }
  return out;
};

/**
 * Values of JSON fields that name a composition or a dose, wherever they sit in the document.
 *
 * Read as FIELDS rather than as prose, because a field name is better evidence than a heading:
 * `"ingredients": "Each 10 ml contains ..."` is the site itself labelling that string as the
 * ingredients, which no amount of layout guessing can match for certainty.
 */
const JSON_FIELD = (name) => new RegExp(`"${name}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`, 'i');
const FIELD_NAMES = {
  composition: ['ingredients', 'composition', 'ingredient', 'keyIngredients'],
  dose: ['dosage', 'dose', 'howToUse', 'directions'],
};

export const jsonFields = (text) => {
  const out = {};
  for (const [kind, names] of Object.entries(FIELD_NAMES)) {
    for (const name of names) {
      const m = String(text).match(JSON_FIELD(name));
      if (!m) continue;
      let v;
      try { v = JSON.parse(m[1]); } catch { continue; }
      v = htmlToText(decodeEntities(String(v))).trim();
      // A field that exists and is empty or null is not a composition.
      if (v.length < 8) continue;
      out[kind] = { field: name, text: v.slice(0, 4000) };
      break;
    }
  }
  return out;
};

/** Every JSON-LD block on the page, parsed, with unparseable ones skipped rather than thrown. */
export const jsonLdBlocks = (html) => {
  const out = [];
  for (const m of String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const v = JSON.parse(decodeEntities(m[1]));
      out.push(...(Array.isArray(v) ? v : [v]));
    } catch { /* a broken block is not a reason to abandon the page */ }
  }
  // @graph is how most of these sites wrap their nodes.
  return out.flatMap((n) => (Array.isArray(n?.['@graph']) ? n['@graph'] : [n])).filter(Boolean);
};

const typeOf = (n) => [].concat(n?.['@type'] ?? []).map((t) => String(t).toLowerCase());

/** The Product node, if the page declares one. This is where a name and a price are reliable. */
export const productNode = (html) => jsonLdBlocks(html).find((n) => typeOf(n).includes('product')) ?? null;

/**
 * Labels that introduce a composition.
 *
 * Ordered by how specific they are, because a page can carry several and the most specific is the
 * one that leads a real ingredient table. "Each 10 g contains" is the strongest signal on these
 * sites, and a bare "contains" is the weakest, so a bare one only counts when nothing better was
 * found on the page.
 */
const COMPOSITION_LABELS = [
  // "Each 100 ml prepared from" is how an Indian label states the basis for a decoction or an
  // oil, and it is as strong a signal as "contains". Requiring the word `contains` missed it.
  /each\s+\d+(?:\.\d+)?\s*(?:g|gm|gms|mg|ml|tablet|capsule|caps?ule)s?\b[^\n]{0,40}(?:contains?|prepared\s+from|derived\s+from|composed\s+of|made\s+from)/i,
  /\bkey\s+ingredients?\b/i,
  /\bcomposition\b/i,
  /\bingredients?\b/i,
  /\bformulation\s+contains?\b/i,
  /\bcontents?\s*:/i,
];

/**
 * Lines that carry one of those words and are not a composition heading.
 *
 * "Skip to main content" contains the word `content`, and on a Dabur product page it is the
 * second line of the document. It matched, and three pages were recorded as publishing a
 * composition whose text was "About Us | button". A claim of absence is the whole point of this
 * exercise, so a false claim of PRESENCE is the error that quietly destroys the result.
 */
/**
 * Shop furniture: price, pack selector, rating, stock. Never part of a dose or a composition.
 *
 * Four dose fields came back as price text. One read "Sale price / 261 / Regular price 275 5% off
 * / (4.9)", which is not a dose, and another began correctly with "Use 2-3 drops or as advised by
 * the Vaidya" and then ran on into the pack selector because the block cap swept it up. A price
 * published as a dose on a reference page is the kind of error that is worse than publishing
 * nothing.
 */
const COMMERCE_LINE = /(?:^|\s)(?:sale\s+price|regular\s+price|mrp\b|\d+%\s*off|add\s+to\s+cart|buy\s+it\s+now|sold\s+out|in\s+stock|out\s+of\s+stock|pack\s+of\s+\d|\bsize\b|inclusive\s+of\s+all\s+taxes|₹|\bRs\.?\s*\d)/i;

const NAV_LINE = new RegExp([
  'skip\\s+to\\s+(?:main\\s+)?content',
  'table\\s+of\\s+contents',
  // "Shop by Ingredients" heads a navigation menu of OTHER products. It passed every test the
  // first version had, because a menu of herb names is indistinguishable from an ingredient list
  // by shape alone: short, distinct, no prose. Five of six Maharishi hits were this menu.
  'shop\\s+by\\b',
  'popular\\s+searches',
  'related\\s+products',
  'you\\s+may\\s+also\\s+like',
  'customers\\s+also',
  'frequently\\s+bought',
  '^(?:menu|navigation|breadcrumbs?|search|shop|browse|categories|collections)\\b',
].join('|'), 'i');

/**
 * English function words. Two or more of them in one item means prose, not an ingredient.
 *
 * An ingredient row is a name, sometimes a botanical binomial, a plant part and a figure. It does
 * not say "not only ... but also". This is the test that separates a composition table from a
 * paragraph of marketing copy with commas in it, and without it the paragraph wins, because by
 * shape alone a comma-separated sentence looks exactly like a list.
 */
const FUNCTION_WORDS = /\b(?:and|the|of|with|for|is|are|was|that|which|to|in|on|not|also|but|from|its|their|your|this|these|helps?|supports?|used|known|made|been|has|have|by|as|it|all|more|most|may|can|will)\b/gi;

/**
 * Is this line a HEADING that introduces a composition, rather than a sentence that mentions the
 * word in passing?
 *
 * Baidyanath's product copy reads "Packed with natural ingredients, Baidyanath Ashwagandharishta
 * not only boosts immunity but also supports balanced energy levels". That line contains the
 * word, and the marketing prose after it is comma-rich enough to have passed the list test, so
 * four products were recorded as publishing a composition that was a paragraph of claims. A
 * heading is short, or it ends in a colon. A sentence of ninety characters is neither.
 */
const headingLike = (line, match) => {
  const t = line.trim();
  // A heading is almost all label. "MODE OF ACTION: (Avipattikar Churna contains the following
  // ingredients)" is 70 characters, so a length test alone passed it, and the paragraph of
  // pharmacology under it split on commas into three short fragments and validated as a list.
  // Counting function words separates the two: a heading has at most one, a sentence has several.
  if ((t.match(FUNCTION_WORDS) ?? []).length > 1) return false;
  return t.length <= 80
    || /:\s*$/.test(t)
    || /[:\u2013-]\s*\S/.test(line.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 3));
};

/**
 * Does this text look like a list of ingredients, rather than prose that happened to follow a
 * matching word?
 *
 * Two ways to qualify, because real labels take two shapes. Either it states a quantity, which
 * settles it, or it reads as a list: at least three distinct short items. Prose fails both:
 * a sentence splits into one or two long fragments, and a block of repeated boilerplate has
 * only one distinct item however many lines it runs to.
 */
export const plausibleItems = (text) => {
  const items = String(text)
    .split(/\n|[;,\u2022\u00b7]/)
    .map((t) => t.replace(/^[\s\d.)\-|*]+/, '').replace(/[\s|]+$/, '').trim())
    .filter((t) => t.length >= 2 && t.length <= 60
      && /[a-z]/i.test(t)
      && !/[.!?]\s+[A-Z]/.test(t)
      && t.split(/\s+/).length <= 8
      && (t.match(FUNCTION_WORDS) ?? []).length < 2);
  return [...new Set(items.map((t) => t.toLowerCase()))].map((k) => items.find((t) => t.toLowerCase() === k));
};

export const looksLikeComposition = (text) => {
  if (quantities(text).some((q) => !isPackSize(q))) return true;
  const items = plausibleItems(text);
  // Short items, because an ingredient name is short. Half the list has to clear that bar, or
  // this is prose with commas in it.
  return items.length >= 3 && items.filter((t) => t.length <= 40).length >= Math.ceil(items.length / 2);
};

/** Labels that introduce a dose. */
const DOSE_LABELS = [
  /\b(?:recommended\s+)?dosage\b/i,
  /\bdose\b/i,
  /\bhow\s+to\s+use\b/i,
  /\bdirections?\s+(?:for\s+use|of\s+use)?\b/i,
  /\bsuggested\s+use\b/i,
];

/**
 * WHY A DOSE IS SCORED IN TWO TIERS AND NOT ONE.
 *
 * The first version of this asked one question, "is there text here", and answered it by looking
 * for a figure or a verb. That counted ".", "Coming Soon", "STEP 1" and "Pack sizes" as a company
 * publishing its dose, and the published comparison inherited the error on 793 pages.
 *
 * Tightening the single test was the wrong repair, and three successive attempts at it each
 * produced a number that needed correcting, because "is this text a dose" is a judgement and a
 * pattern list is not a judge. Worse, each list failed on plurals: `tablet` with a word boundary
 * does not match "tablets", `gm` does not match "gms", `teaspoon` does not match "teaspoonfuls",
 * so every version quietly undercounted the real doses while overcounting the junk.
 *
 * So the measure is split, and neither half needs a judgement:
 *
 *   QUANTITY is a figure beside a unit of measure. "12 to 24 ml", "1-2 tablets", "2-3 drops".
 *   Mechanically checkable, and it is what a reader can actually act on.
 *
 *   INSTRUCTION is a direction to do something with the product, with no amount given. "Apply on
 *   the affected area", "As directed by the physician". That is a real thing a page can say and
 *   it is not a dose, so it is reported as its own class rather than folded into one total.
 *
 * Both are published per page, so the site states how many pages give an amount and how many give
 * only a direction, and the stronger claim never rests on the weaker class.
 *
 * Devanagari units are matched because these are Indian manufacturers and some state the dose only
 * in Hindi: Patanjali's cattle-medicine pages say "100 मि.ली. से 200 मि.ली.", which a Latin-only
 * pattern scores as no quantity on a page that plainly states one.
 */
const DOSE_UNIT = String.raw`ml|mls|millilitres?|milliliters?|g|gm|gms|grams?|mg|mgs|milligrams?|l|litres?|liters?`
  + String.raw`|tsp|tsps|tsf|teaspoons?|teaspoonfuls?|tbsp|tbsps|tablespoons?|tablespoonfuls?|spoons?|spoonfuls?`
  + String.raw`|drops?|tabs?|tablets?|capsules?|caps|vatis?|pills?|gutikas?|sachets?|cups?|glass|glasses|pinch|pinches`
  + String.raw`|मि\.?ली\.?|ग्राम|मि\.?ग्रा\.?|बूंदे?|चम्मच|गोली(?:याँ|यां)?`;
const QUANTITY = new RegExp(
  String.raw`(?:\d+(?:[.,]\d+)?|[०-९]+|one|two|three|four|five|six|ten|half|quarter)`
  + String.raw`\s*(?:[-–—]|to|or|se|से)?\s*(?:\d+(?:[.,]\d+)?|[०-९]+)?\s*(?:${DOSE_UNIT})\b`, 'i');
const INSTRUCTION = /\b(?:take|use|used|apply|applied|consume|ingest|administer|massage|rub|dab|anoint|instil|instill|sip|chew|swallow|dissolve|gargle|rinse|inhale|lather|sprinkle|brush|wash|as\s+(?:directed|advised|specified|prescribed|per\s+the\s+advice)|under\s+medical\s+supervision|consult\s+(?:your|a|an)\s+(?:physician|doctor|vaidya))\b/i;

/**
 * Markup reaches these values on hosts that put HTML inside a JSON field: 176 of the pages counted
 * as stating a dose carried tags, and Kerala Ayurveda's carried a literal `ttt` sentinel and a
 * leading `?` from the same template. Left in, a public comparison table would print `? <ul><li>`
 * as a manufacturer's stated dose. Stripped here so every consumer of this record sees the text
 * the page shows a reader.
 */
const doseText = (t) => String(t ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/\bttt\b/g, ' ')
  .replace(/^[\s?]+/, '')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * The block of text a label introduces.
 *
 * Takes the lines after the label up to a blank line or the next label-looking line, capped. The
 * cap is what stops a page with no structure from returning its whole body and calling it a
 * composition, which would turn every page into a false positive.
 */
const blockAfter = (text, re, { maxLines = 40, maxChars = 4000, from = 0 } = {}) => {
  const lines = text.split('\n');
  for (let i = from; i < lines.length; i += 1) {
    const m = lines[i].match(re);
    if (!m) continue;
    if (NAV_LINE.test(lines[i])) continue;
    if (!headingLike(lines[i], m)) continue;
    // A label may sit on the same line as its content ("Ingredients: A, B, C").
    const tail = lines[i].slice((m.index ?? 0) + m[0].length).replace(/^[\s:\u2013\u2014-]+/, '');
    const body = tail ? [tail] : [];
    // A SINGLE blank line does not end the block. An HTML table whose source has a newline
    // between its rows comes through here as row, blank, row, blank, row, and breaking on the
    // first blank returned one ingredient out of sixteen. Two consecutive blanks end it.
    let blanks = 0;
    for (let j = i + 1; j < lines.length && body.length < maxLines; j += 1) {
      const line = lines[j];
      if (!line.trim()) { blanks += 1; if (body.length && blanks >= 2) break; continue; }
      blanks = 0;
      // Shop furniture ends the block rather than joining it.
      if (COMMERCE_LINE.test(line)) { if (body.length) break; continue; }
      // Stop at the next section heading, which on these pages is a short line with no digits
      // and no comma, immediately after content has been collected.
      if (body.length >= 1 && line.length < 40 && !/[\d,]/.test(line) && /^[A-Z]/.test(line)) break;
      body.push(line);
    }
    const out = body.join('\n').trim().slice(0, maxChars);
    if (out) return { label: lines[i].trim().slice(0, 120), text: out, atLine: i };
  }
  return null;
};

/**
 * Find the composition, trying every label and accepting only a block that reads as a list.
 *
 * Two layouts have to be handled, and the second is why this is not a single blockAfter call.
 *
 * THE ORDINARY LAYOUT is one heading followed by the list. Taking the first block after the most
 * specific matching label gets it.
 *
 * THE REPEATED-HEADING LAYOUT puts the word before EVERY ingredient, so a Dabur page reads
 * "INGREDIENTS / Amla / <a paragraph about amla> / INGREDIENTS / Bilva / ...". Reading the first
 * block alone returns one ingredient out of five and makes the page look almost bare. When a
 * label occurs three or more times, the first line after each occurrence is taken as one item.
 *
 * A label that matched but produced nothing list-shaped is recorded rather than silently
 * dropped, because "a heading said ingredients and what followed was prose" is a different fact
 * from "the page never mentions ingredients", and the difference is worth being able to review.
 */
const findComposition = (text) => {
  const lines = text.split('\n');
  const nextNonEmpty = (i) => {
    for (let j = i + 1; j < lines.length && j < i + 4; j += 1) if (lines[j].trim()) return lines[j].trim();
    return null;
  };
  let labelSeen = null;

  for (const re of COMPOSITION_LABELS) {
    const occ = lines
      .map((l, i) => {
        const m = l.match(re);
        return m && !NAV_LINE.test(l) && headingLike(l, m) ? i : -1;
      })
      .filter((i) => i >= 0);
    if (!occ.length) continue;
    labelSeen ??= lines[occ[0]].trim().slice(0, 120);

    if (occ.length >= 3) {
      const items = occ.map((i) => nextNonEmpty(i)).filter(Boolean);
      const joined = [...new Set(items)].join('\n');
      if (looksLikeComposition(joined)) {
        return { label: lines[occ[0]].trim().slice(0, 120), text: joined, via: re.source.slice(0, 48), layout: 'repeated-heading' };
      }
    }
    // Every occurrence is tried, not just the first: a page can carry the word in its marketing
    // copy above the real table.
    for (const at of occ) {
      const b = blockAfter(text, re, { from: at });
      if (b && looksLikeComposition(b.text)) {
        return { ...b, via: re.source.slice(0, 48), layout: 'block' };
      }
    }
  }
  return { label: null, text: null, via: null, layout: null, labelSeen };
};

/**
 * Quantities, as printed, with whatever they are attached to.
 *
 * Units are the ones these labels actually use. `part` and `ratti` are in the list because
 * classical formulations are sometimes stated in parts or in traditional weights rather than in
 * grams, and reporting those as "no quantity given" would be wrong: the page did state a
 * proportion, it simply did not state it in metric.
 */
const UNIT = '(?:mg|mcg|g|gm|gms|gram|grams|kg|ml|mL|l|litre|liter|%|parts?|ratti|rattis|tola|masha|pala|karsha)';
const QTY = new RegExp(`(\\d+(?:[.,]\\d+)?(?:\\s*[-\u2013]\\s*\\d+(?:[.,]\\d+)?)?)\\s*(${UNIT})(?![a-z])`, 'gi');

export const quantities = (text) => {
  const out = [];
  for (const line of String(text).split('\n')) {
    // Where the previous figure on this line ended. A composition is often written as one long
    // comma-separated line, and measuring "what precedes the figure" from the START of the line
    // attributed 325.866 mg of Draksha to a run of twenty earlier ingredients.
    let cursor = 0;
    for (const m of line.matchAll(QTY)) {
      const before = line.slice(cursor, m.index)
        .replace(/^[\s,;.\u2013\u2014-]+/, '')
        .replace(/[\t|:\u2013\u2014-]+$/, '')
        .replace(/^(?:and|each|of)\s+/i, '')
        .trim();
      cursor = m.index + m[0].length;
      out.push({
        amount: m[1].replace(/,/g, '.'),
        unit: m[2].toLowerCase().replace(/^gms?$|^grams?$/, 'g').replace(/^litre$|^liter$/, 'l'),
        attachedTo: before.slice(-80) || null,
        raw: line.trim().slice(0, 160),
      });
    }
  }
  return out;
};

/**
 * A pack size is not a composition.
 *
 * "450 ml" on an arishta page is the bottle, and counting it as an ingredient quantity would let
 * every page in the set claim to publish quantities. A figure counts only when something on the
 * line precedes it, and that something is not a pack, price or net-weight word.
 */
const PACK_WORDS = /\b(?:net\s*(?:wt|weight|qty|quantity)|pack|packing|bottle|jar|size|contents?\s*:|mrp|price|each\s+pack|per\s+pack|volume|weight)\b/i;

/**
 * The BASIS figure is not an ingredient quantity either.
 *
 * "Each 10 ml contains ..." states what the quantities that follow are quantities OF. It is
 * essential context and it is not a component, so it is reported separately rather than counted
 * as the first ingredient, which is what "Each = 10 ml" was.
 */
const BASIS = /^(?:each|per|every|contains?|prepared\s+from|derived\s+from|extract\s+derived\s+from)?$/i;
export const isBasis = (q) => BASIS.test(String(q.attachedTo ?? '').trim());

/**
 * A dose is not a component either.
 *
 * Several labels print the dose inside the same block as the ingredients, and "Dosage: 3 g" was
 * being counted as the composition's only quantity, which made four Baidyanath churnas look as
 * though they published a quantified formula when what they published was how much to take.
 */
const DOSE_WORDS = /\b(?:dosage|dose|anupana|sevan|take|twice|thrice|daily|tsf|teaspoon)\b/i;
export const isDoseFigure = (q) => DOSE_WORDS.test(String(q.attachedTo ?? ''));

export const isPackSize = (q) => !q.attachedTo || isBasis(q) || isDoseFigure(q) || PACK_WORDS.test(q.raw);

/** Does the page say where the formula comes from? Separated by what kind of authority it names. */
const AUTHORITIES = [
  { id: 'afi', re: /\bayurvedic\s+formulary\s+of\s+india\b/i, what: 'the Ayurvedic Formulary of India' },
  { id: 'api', re: /\bayurvedic\s+pharmacopo?eia\s+of\s+india\b/i, what: 'the Ayurvedic Pharmacopoeia of India' },
];

/**
 * The acronyms, kept SEPARATE from the full names.
 *
 * "as per A.F.I." is a real label phrase and worth catching, but a bare three-letter acronym on
 * a commercial page is not evidence on its own: API is also an application programming
 * interface. So an acronym hit is recorded under its own id and the headline claim rests on the
 * full name, which cannot be anything else.
 */
const ACRONYMS = [
  { id: 'afi-acronym', re: /\b(?:as\s+per\s+|per\s+|conforms?\s+to\s+|standard\s+of\s+)A\.?\s?F\.?\s?I\.?\b/i, what: 'A.F.I. by acronym' },
  { id: 'api-acronym', re: /\b(?:as\s+per\s+|per\s+|conforms?\s+to\s+|standard\s+of\s+)A\.?\s?P\.?\s?I\.?\b/i, what: 'A.P.I. by acronym' },
];

/**
 * The classical texts the formulary itself cites, matched through the same fold the product
 * names use.
 *
 * A literal pattern does not survive contact with these pages. Dabur publishes a product called
 * "Chyawanprash Sharangdhar Samhita"; a pattern written for `Sharngadhara Samhita` requires a
 * vowel between the g and the dh that Dabur does not print, so the page that names its source in
 * its own title was recorded as citing nothing. The fold in lib/formulation-names.mjs already
 * solves exactly this and is tested on it, so it is reused rather than reinvented here.
 */
const CLASSICAL_TEXTS = [
  'Bhaishajya Ratnavali', 'Sharngadhara Samhita', 'Charaka Samhita', 'Sushruta Samhita',
  'Ashtanga Hridaya', 'Yogaratnakara', 'Bhavaprakasha', 'Chakradatta', 'Sahasrayoga',
  'Vangasena', 'Gadanigraha', 'Chikitsa Sara Sangraha', 'Rasaratna Samucchaya',
  'Rasatarangini', 'Bharata Bhaishajya Ratnakara', 'Siddha Yoga Sangraha',
].map((n) => ({ slug: n, names: [n] }));
const matchText = buildMatcher(CLASSICAL_TEXTS);

/**
 * Where the page says its formula comes from, with the line it says it on.
 *
 * Matched line by line rather than over the whole document, so the evidence is the sentence the
 * claim sits in rather than an arbitrary window of characters around a match.
 */
export const authorities = (text) => {
  const out = [];
  const lines = String(text).split('\n');
  const add = (id, what, quote) => {
    if (out.some((o) => o.id === id)) return;
    out.push({ id, what, quote: quote.replace(/\s+/g, ' ').trim().slice(0, 200) });
  };
  for (const line of lines) {
    for (const { id, re, what } of AUTHORITIES) if (re.test(line)) add(id, what, line);
    for (const { id, re, what } of ACRONYMS) if (re.test(line)) add(id, what, line);
    // A long line is split on sentence boundaries first: a whole paragraph is not a quote.
    for (const frag of line.split(/(?<=[.;])\s+/)) {
      for (const hit of matchText(frag)) add('classical', hit.slug, frag);
    }
  }
  return out;
};

/**
 * Everything this page states, as facts about the page.
 *
 * `composition.state` is the field the comparison turns on, and the three values it can take are
 * the three cases in the note at the top of this file.
 */
export const extractProduct = (html, { minReadableChars = 600 } = {}) => {
  const text = htmlToText(html);
  const node = productNode(html);
  // A product's own structured description is part of the page's text for matching purposes:
  // several of these sites put the ingredient list only in the JSON-LD description.
  const ldText = node ? htmlToText(String(node.description ?? '')) : '';
  const haystack = ldText && !text.includes(ldText.slice(0, 60)) ? `${text}\n\n${ldText}` : text;

  // Decoded last and kept separate, so a field read from it is attributed to the field rather
  // than to a heading that happens to sit nearby in a JSON blob.
  const payload = frameworkPayload(html);
  const fields = jsonFields(payload || html);
  const haystackPlus = payload ? `${haystack}\n\n${payload}` : haystack;

  const readable = haystack.replace(/\s/g, '').length >= minReadableChars
    || Boolean(fields.composition) || Boolean(fields.dose);
  // The tells for a page whose content arrives only with JavaScript.
  const loadingShell = /^\s*(?:loading|please wait)\b/i.test(haystack) || /\bloading\.\.\./i.test(haystack.slice(0, 400));

  // A labelled field beats a heading, because the site named the string itself.
  const composition = fields.composition
    ? { label: fields.composition.field, text: fields.composition.text, via: `json field "${fields.composition.field}"`, layout: 'json-field' }
    : findComposition(haystack);
  const found = Boolean(composition.text);

  const qtyAll = found ? quantities(composition.text) : [];
  const qty = qtyAll.filter((q) => !isPackSize(q));
  // Kept, because "each 10 ml contains" tells a reader what the figures are proportions of, and
  // a composition quoted without its basis is not checkable.
  const basis = qtyAll.find((q) => isBasis(q)) ?? null;

  return {
    productName: node?.name ? String(node.name).trim() : (html.match(/<title[^>]*>([^<]+)</i)?.[1]?.trim() ?? null),
    sku: node?.sku ?? null,
    jsonLdProduct: Boolean(node),
    readableChars: haystack.replace(/\s/g, '').length,
    composition: {
      state: found ? 'found' : (readable && !loadingShell ? 'absent' : 'unreadable'),
      via: composition.via,
      layout: composition.layout,
      label: composition.label,
      // The snippet is kept so a claim about this page can be checked against what the page said,
      // and so a later correction has something to argue with.
      text: composition.text,
      // Set when a heading matched and what followed was not a list. Reviewable rather than
      // silently folded into "the page never mentions its ingredients".
      labelSeenButNoList: found ? undefined : (composition.labelSeen ?? undefined),
    },
    quantities: qty,
    quantityCount: qty.length,
    basis: basis ? `${basis.amount} ${basis.unit}` : null,
    packSizesIgnored: qtyAll.length - qty.length,
    dose: (() => {
      /**
       * A DOSE MUST LOOK LIKE AN INSTRUCTION, on both paths.
       *
       * The heading path below already drops a block that is nothing but shop furniture. The JSON
       * field path above it had no such check and trusted any value of a field named `dose`,
       * `dosage`, `howToUse` or `directions`, so a field whose value was "." came back as a stated
       * dose. 533 of 3,792 pages, 14%, were in that state: ".", "Coming Soon", "STEP 1",
       * "Pack sizes", "(4.9)", "Drip it". It was not evenly spread either, 239 on one company's
       * pages, 129 on another's, so it moved per-company figures and not just a total.
       *
       * The bar is deliberately low, because the question this answers is only whether the page
       * says anything about how much to take, not whether the instruction is good: real text, and
       * either a figure or an instruction verb in it. "Use 2-3 drops or as advised by the Vaidya"
       * passes. "Drip it" does not, and should not.
       */
      const plausibleDose = (t) => {
        const s = doseText(t);
        if (s.length < 12) return false;
        if (/^[\s.,;:!?()\[\]{}<>\/\\|_-]*$/.test(s)) return false;
        if (/^(coming soon|n\/?a|tbd|step\s*\d|pack sizes?|select|loading)\b/i.test(s)) return false;
        // Three classes that carry a figure or a verb and are still not about taking anything.
        // Each was found by reading the values rather than counting them, and each was being
        // counted as disclosure: a shelf-life line, a statutory address block, and marketing copy.
        if (/\b(?:before \d+ months|date of manufactur|best before|use by|expir)/i.test(s)) return false;
        if (/\b(?:manufactured|marketed|packed) (?:by|for|at)\b/i.test(s) && !QUANTITY.test(s)) return false;
        if (!QUANTITY.test(s) && !INSTRUCTION.test(s)) return false;
        return QUANTITY.test(s) || INSTRUCTION.test(s);
      };

      // `states` is the field a count should use. 'quantity' means an amount a reader can act on;
      // 'instruction' means a direction with no amount. Both are 'found', because the page did
      // say something under its own dose heading, and the distinction is what gets reported.
      const scored = (via, label, raw) => {
        const text = doseText(raw);
        return {
          state: 'found', via, label, text,
          states: QUANTITY.test(text) ? 'quantity' : 'instruction',
        };
      };

      if (fields.dose && plausibleDose(fields.dose.text)) {
        return scored(`json field "${fields.dose.field}"`, fields.dose.field, fields.dose.text);
      }
      for (const re of DOSE_LABELS) {
        const d = blockAfter(haystack, re, { maxLines: 8, maxChars: 600 });
        // A block with no instruction left in it once the shop furniture is gone was never a
        // dose. The label matched something that happened to sit above a price.
        if (d && d.text.split('\n').some((l) => l.trim() && !COMMERCE_LINE.test(l))
          && plausibleDose(d.text)) {
          return scored('heading', d.label, d.text);
        }
      }
      return { state: readable && !loadingShell ? 'absent' : 'unreadable', via: null, label: null, text: null };
    })(),
    // Searched across the decoded payload too: a site that names its classical source only in
    // data the browser renders has still named it, and an answer engine reading the HTML sees it.
    authorities: authorities(haystackPlus),
  };
};
