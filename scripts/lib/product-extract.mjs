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
  /each\s+\d+(?:\.\d+)?\s*(?:g|gm|gms|mg|ml|tablet|capsule|caps?ule)s?\b[^\n]{0,40}contains?/i,
  /\bkey\s+ingredients?\b/i,
  /\bcomposition\b/i,
  /\bingredients?\b/i,
  /\bcontents?\b/i,
  /\bformulation\s+contains?\b/i,
  /\bcontains?\b/i,
];

/** Labels that introduce a dose. */
const DOSE_LABELS = [
  /\b(?:recommended\s+)?dosage\b/i,
  /\bdose\b/i,
  /\bhow\s+to\s+use\b/i,
  /\bdirections?\s+(?:for\s+use|of\s+use)?\b/i,
  /\bsuggested\s+use\b/i,
];

/**
 * The block of text a label introduces.
 *
 * Takes the lines after the label up to a blank line or the next label-looking line, capped. The
 * cap is what stops a page with no structure from returning its whole body and calling it a
 * composition, which would turn every page into a false positive.
 */
const blockAfter = (text, re, { maxLines = 40, maxChars = 4000 } = {}) => {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(re);
    if (!m) continue;
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
    for (const m of line.matchAll(QTY)) {
      // The ingredient is whatever precedes the figure on the line, trimmed of table padding.
      const before = line.slice(0, m.index).replace(/[\t|:\u2013\u2014-]+$/, '').trim();
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
export const isPackSize = (q) => !q.attachedTo || PACK_WORDS.test(q.raw);

/** Does the page say where the formula comes from? Separated by what kind of authority it names. */
const AUTHORITIES = [
  { id: 'afi', re: /\bayurvedic\s+formulary\s+of\s+india\b|\bA\.?F\.?I\.?\b(?!\w)/i, what: 'the Ayurvedic Formulary of India' },
  { id: 'api', re: /\bayurvedic\s+pharmacopo?eia\s+of\s+india\b|\bA\.?P\.?I\.?\b(?!\w)/i, what: 'the Ayurvedic Pharmacopoeia of India' },
  { id: 'classical', re: /\b(?:bhai?sh?ajya\s*ratnavali|shara?ngadhara?\s*samhita|sarngadhara|charaka?\s*samhita|sushruta\s*samhita|ashtanga\s*h[ r]idaya|astangahrdaya|yogaratnakara|bhava\s*prakash|chakradatta|sahasrayoga)\b/i, what: 'a classical text' },
];

export const authorities = (text) => AUTHORITIES
  .map(({ id, re, what }) => {
    const m = String(text).match(re);
    return m ? { id, what, quote: String(text).slice(Math.max(0, m.index - 60), m.index + m[0].length + 80).replace(/\n/g, ' ').trim() } : null;
  })
  .filter(Boolean);

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

  const readable = haystack.replace(/\s/g, '').length >= minReadableChars;
  // The tells for a page whose content arrives only with JavaScript.
  const loadingShell = /^\s*(?:loading|please wait)\b/i.test(haystack) || /\bloading\.\.\./i.test(haystack.slice(0, 400));

  let composition = null;
  let via = null;
  for (const re of COMPOSITION_LABELS) {
    composition = blockAfter(haystack, re);
    if (composition) { via = re.source.slice(0, 48); break; }
  }

  const qtyAll = composition ? quantities(composition.text) : [];
  const qty = qtyAll.filter((q) => !isPackSize(q));

  return {
    productName: node?.name ? String(node.name).trim() : (html.match(/<title[^>]*>([^<]+)</i)?.[1]?.trim() ?? null),
    sku: node?.sku ?? null,
    jsonLdProduct: Boolean(node),
    readableChars: haystack.replace(/\s/g, '').length,
    composition: {
      state: composition ? 'found' : (readable && !loadingShell ? 'absent' : 'unreadable'),
      via,
      label: composition?.label ?? null,
      // The snippet is kept so a claim about this page can be checked against what the page said,
      // and so a later correction has something to argue with.
      text: composition?.text ?? null,
    },
    quantities: qty,
    quantityCount: qty.length,
    packSizesIgnored: qtyAll.length - qty.length,
    dose: (() => {
      for (const re of DOSE_LABELS) {
        const d = blockAfter(haystack, re, { maxLines: 8, maxChars: 600 });
        if (d) return { state: 'found', label: d.label, text: d.text };
      }
      return { state: readable && !loadingShell ? 'absent' : 'unreadable', label: null, text: null };
    })(),
    authorities: authorities(haystack),
  };
};
