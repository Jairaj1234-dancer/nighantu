import fs from 'node:fs';
import path from 'node:path';

/**
 * Recognise a classical formulation by the name a manufacturer happens to print.
 *
 * FOR MATCHING ONLY, and deliberately lossy. Never render one of these keys to a reader.
 *
 * WHY IT EXISTS. The comparison work has to find, on eleven companies' sites, the products that
 * correspond to the 101 formulary entries transcribed here. Nobody agrees on the spelling. One
 * formulation reaches the shelf as Hingvastaka, Hingwashtak, Hingvashtak and Hingu Vachadi; one
 * as Chyawanprash, Chyavanaprasha and Chyavanprash; one as Dhanwantaram Thailam, Dhanvantara
 * Taila and Dhanwantharam Kuzhambu. Matching on the literal string finds a fraction of them, and
 * matching on a loose substring finds Triphala inside Triphala Guggulu and calls them the same
 * product, which is worse: it would put one formulation's composition beside another's label.
 *
 * SO THE KEY FOLDS WHAT VARIES AND THE MATCH STAYS WHOLE-TOKEN.
 *
 * What is folded, in each case because two spellings of ONE formulation differ by exactly this:
 *   - diacritics, case, and everything that is not a letter or digit
 *   - aspiration: thailam/tailam, ghrita/grita, churna/curna, khanda/kanda
 *   - sibilants: arishta/arista, kashayam/kasayam
 *   - v and w: chyawanprash/chyavanprash, dhanwantaram/dhanvantaram
 *   - vowel length written by doubling: kashayam/kaashaayam, gulika/goolika
 *   - a doubled consonant: guggulu/gugulu, pippali/pipali
 *   - the final -m and the final vowel: thailam/thaila/tailam, guggulu/guggul, vati/vatika
 *
 * What is NOT folded, because these distinguish DIFFERENT formulations:
 *   - any token that is not the head name. Triphala Churna and Triphala Guggulu share a token
 *     and are different medicines, so a key is a token sequence and a match compares sequences.
 *   - the qualifiers maha, laghu, brihat and the like. Mahasudarshan and Sudarshan are different
 *     formulations, which this project has already had to correct a page for, so `maha` stays in
 *     the key and the two never collide.
 */

/**
 * One token, reduced to its skeleton.
 *
 * Order matters. Aspiration is folded before the doubled-consonant collapse, or `ghrta` from
 * `ghrita` would first see `gh` as a double. Vowel doubling is folded before length is lost.
 */
export const tokenStem = (raw) => {
  const s = String(raw)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!s) return '';
  return s
    .replace(/ksh/g, 'ks')
    .replace(/sh/g, 's')
    .replace(/ch/g, 'c')
    .replace(/kh|gh|jh|th|dh|ph|bh/g, (m) => m[0])
    .replace(/w/g, 'v')
    .replace(/aa/g, 'a').replace(/ee|ii/g, 'i').replace(/oo|uu/g, 'u')
    .replace(/ai/g, 'e').replace(/au/g, 'o')
    .replace(/ri/g, 'r')
    .replace(/([a-z])\1+/g, '$1');
};

/**
 * The stem with its ending removed.
 *
 * The final -m and a final vowel are the two endings that vary freely between a Sanskrit
 * nominative and its Hindi or Malayalam shelf form. Stripped last, once, never in a loop: `vati`
 * must become `vat`, not be whittled down to `v`.
 *
 * This is why `tokenStem` is exported separately. Dropping the ending is right when comparing one
 * word to one word, and wrong in the middle of a compound: `maha` keys as `mah`, so joining it to
 * the next token to recognise `Maha Sudarshan` as `Mahasudarshan` has to join the STEM.
 */
export const tokenKey = (raw) => {
  const s = tokenStem(raw).replace(/m$/, '').replace(/[aeiou]$/, '');
  return FORM_SYNONYMS.get(s) ?? s;
};

/**
 * Dosage-form words whose spelling varies by LANGUAGE rather than by transliteration, which no
 * mechanical fold can reach. Each line is one preparation written as several languages write it.
 *
 * Listed explicitly, and kept short, because the alternative is a letter-level rule that would do
 * real damage: `bati` is `vati` on a Baidyanath pack, but folding b to v everywhere would also
 * merge `bala` into `vala`, and bala is a qualifier that distinguishes formulations. An explicit
 * table of form words is reviewable; a letter rule is not.
 *
 * Only forms that genuinely name the SAME preparation are merged here. Gutika, guḷika and vaṭi
 * are all pills, but the formulary treats gutika as its own form and prints separate entries, so
 * they are not merged. Kuzhambu is not taila either.
 */
const FORM_SYNONYMS = new Map(Object.entries({
  vatik: 'vat', bat: 'vat', batik: 'vat', // vatika / bati / batika, all of them vati
}));

/** Noise words a shelf name carries that say nothing about which formulation it is. */
const NOISE = new Set([
  'the', 'and', 'with', 'of', 'for', 'in', 'ayurvedic', 'ayurveda', 'classical', 'pure', 'premium',
  'special', 'original', 'genuine', 'herbal', 'natural', 'tablet', 'tablets', 'tab', 'tabs',
  'capsule', 'capsules', 'cap', 'caps', 'bottle', 'jar', 'pack', 'box', 'strip', 'ml', 'gm', 'gms',
  'g', 'kg', 'mg', 'litre', 'liter', 'pcs', 'piece', 'pieces', 'no', 'nos', 'size', 'count',
  'buy', 'online', 'price', 'best', 'new', 'offer', 'combo', 'free', 'set',
]);

/**
 * A name reduced to its sequence of significant token keys.
 *
 * Numbers are dropped: `Liv.52` keeps `liv`, and a pack size of 500 contributes nothing. A brand
 * name sitting in the product title is NOT stripped here, because stripping it would need a list
 * of brands and a brand token folds to something harmless anyway; the whole-sequence match below
 * is what keeps `Dabur Chyawanprash` from matching `Chyawanprash Special`.
 */
const words = (raw) => String(raw)
  .replace(/[._/]+/g, ' ')
  .split(/[\s\-–—,:;()[\]{}'"|]+/)
  .map((t) => t.trim())
  .filter(Boolean)
  .filter((t) => !NOISE.has(t.toLowerCase()))
  .filter((t) => !/^\d+(?:\.\d+)?[a-z]{0,3}$/i.test(t));

export const nameTokens = (raw) => words(raw).map(tokenKey).filter(Boolean);

/** The same sequence, un-stripped, so a compound can be rejoined. Index-aligned with nameTokens. */
export const nameStems = (raw) => words(raw).map((w) => [w, tokenStem(w)])
  .filter(([, s]) => tokenKey(s))
  .map(([, s]) => s);

/** The whole name as one comparable string. */
export const nameKey = (raw) => nameTokens(raw).join('-');

/**
 * Does `candidate` name the formulation whose own tokens are `targetTokens`?
 *
 * The rule is CONTAINMENT OF THE WHOLE SEQUENCE, in order, with no gaps: every target token must
 * appear consecutively in the candidate. That is what lets `Baidyanath Abhayarishta 450ml` match
 * `abhayarishta` while refusing `Triphala Guggulu` for `triphala-churna` (the target's second
 * token is absent).
 *
 * ONE RELAXATION: a target token may also be spelled across two adjacent candidate tokens, so
 * `Maha Sudarshan Churna` matches a target written `Mahasudarshan Churna`. Word breaks in these
 * names are not conventional and the same pack prints both. It is capped at two tokens, so the
 * relaxation can never swallow an arbitrary span.
 *
 * Returns `{ at, len }` in CANDIDATE positions, or null. The caller needs the span, not just the
 * offset: a target that matched positions 0 to 2 has consumed `Maha Sudarshan Churna` entirely,
 * and that is what stops the shorter `Sudarshan Churna` from also matching inside it.
 */
/**
 * Consonants only, for the one remaining class of variation a letter fold cannot reach: an
 * internal vowel that one spelling writes and another drops. Kanchnar and Kanchanara are the same
 * tree; Hingwashtak and Hingvashtaka the same powder.
 *
 * Guarded hard, because a consonant skeleton is a blunt instrument. It applies only to a
 * whole-token comparison, never inside the two-token join, and only when BOTH tokens are at
 * least six characters, where an accidental collision between two different Sanskrit words with
 * the same consonants in the same order is no longer a realistic worry.
 */
const consonants = (s) => s.replace(/[aeiou0-9]/g, '');
const sameSkeleton = (a, b) => a.length >= 6 && b.length >= 6 && consonants(a) === consonants(b)
  && consonants(a).length >= 4;

export const findRun = (candidateTokens, targetTokens, candidateStems = candidateTokens) => {
  if (!targetTokens.length) return null;
  for (let i = 0; i < candidateTokens.length; i += 1) {
    let c = i;
    let ok = true;
    for (const want of targetTokens) {
      if (candidateTokens[c] === want) { c += 1; continue; }
      if (candidateTokens[c] && sameSkeleton(candidateTokens[c], want)) { c += 1; continue; }
      // The join uses the first token's STEM, because its ending was stripped as if it were a
      // whole word and inside a compound it is not: `mah` + `sudarsan` is not `mahasudarsan`.
      if (c + 1 < candidateTokens.length
        && (candidateStems[c] + candidateTokens[c + 1] === want
          || candidateTokens[c] + candidateTokens[c + 1] === want)) { c += 2; continue; }
      ok = false;
      break;
    }
    if (ok) return { at: i, len: c - i };
  }
  return null;
};

/**
 * Build a matcher over a set of formulations, each `{ slug, names: [...] }`.
 *
 * Two rules keep a product off the wrong formulation's page.
 *
 * LONGEST TARGET FIRST, so `mahasudarshan-churna` is tried before `sudarshan-churna`.
 *
 * AND NO OVERLAPPING MATCHES: once a target has claimed a span of the candidate's tokens, no
 * other target may match inside that span. Without this, `Maha Sudarshan Churna` matches
 * mahasudarshan-churna across positions 0 to 2 and then ALSO matches sudarshan-churna at
 * position 1, and the product would appear on two pages with two different compositions, one of
 * them wrong. This project has already had to correct a page for exactly that confusion.
 */
/**
 * The 101 formulary slugs with every name each is known by, which is what buildMatcher consumes.
 *
 * MOVED HERE from scripts/brand-catalogue.mjs. It lived in the collector, which now refuses to run
 * from an import because importing it to reach a constant starts a crawl. That guard is right, and
 * the consequence is that anything two scripts both need belongs in this directory instead. A
 * second script needed exactly this loader and the matcher it feeds, and duplicating it would have
 * given the two callers different ideas of what counts as a formulary name.
 */
export const loadFormulations = () => {
  const comp = JSON.parse(fs.readFileSync(path.join('src', 'data', 'composition.json'), 'utf8'));
  const out = [];
  for (const slug of Object.keys(comp.records ?? {})) {
    const file = path.join('content', 'formulation', `${slug}.md`);
    const names = new Set();
    if (fs.existsSync(file)) {
      const fm = fs.readFileSync(file, 'utf8');
      const title = fm.match(/^title:\s*"([^"]+)"/m)?.[1];
      if (title) names.add(title);
      const aliases = fm.match(/^aliases:\s*(\[[^\]]*\])/m)?.[1];
      if (aliases) { try { for (const a of JSON.parse(aliases)) names.add(a); } catch { /* ignore */ } }
    }
    // The slug is a name too, and sometimes the only one that carries the regional spelling.
    names.add(slug.replace(/-/g, ' '));
    out.push({ slug, names: [...names] });
  }
  return out;
};

export const buildMatcher = (formulations) => {
  const targets = [];
  for (const f of formulations) {
    const seen = new Set();
    for (const n of f.names) {
      const toks = nameTokens(n);
      if (!toks.length) continue;
      const k = toks.join('-');
      if (seen.has(k)) continue;
      seen.add(k);
      targets.push({ slug: f.slug, tokens: toks, from: n });
    }
  }
  // By target length first, then by the length of the text, so the more specific name is tried
  // first whether its specificity is extra words or a longer single word.
  targets.sort((a, b) => b.tokens.length - a.tokens.length || b.tokens.join('').length - a.tokens.join('').length);

  return (candidate) => {
    const toks = nameTokens(candidate);
    const stems = nameStems(candidate);
    const hits = [];
    const claimed = new Set();
    const consumed = new Set();
    for (const t of targets) {
      if (claimed.has(t.slug)) continue;
      const run = findRun(toks, t.tokens, stems);
      if (!run) continue;
      let overlaps = false;
      for (let k = run.at; k < run.at + run.len; k += 1) if (consumed.has(k)) overlaps = true;
      if (overlaps) continue;
      for (let k = run.at; k < run.at + run.len; k += 1) consumed.add(k);
      claimed.add(t.slug);
      hits.push({ slug: t.slug, matched: t.from, tokens: t.tokens.length, at: run.at, len: run.len });
    }
    return hits;
  };
};
