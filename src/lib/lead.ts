/**
 * What a monograph leads with: its <title> and the formulary sentence that follows its answer.
 *
 * A bare name tells a reader, and a search result, nothing about what the page holds, and an answer
 * block that names the thing without stating the fact makes the reader dig for it. A formulation
 * page answered "what is in Sitopaladi Churna" with "Sitopaladi Churna is a classical churna", and
 * the formulary recipe sat 400 words further down.
 *
 * NOTHING HERE STATES A FACT THE PAGE DOES NOT ALREADY HOLD. The title lists only what the page
 * contains, and the sentence is generated from the committed formulary transcription, cited to
 * part and entry number, with quantities exactly as the book prints them, and it never states a dose.
 */
import compositions from '../data/composition.json';
import names from '../data/names.json';
import dravyaguna from '../data/dravyaguna.json';

const records = (compositions as any).records ?? {};
const namePages = (names as any).pages ?? {};
const properties = new Set(((dravyaguna as any).entries ?? []).map((e: any) => `${e.kind}/${e.slug}`));

/** Genus and species only, for a title. "Malaxis muscifera (Lindl.) Kuntze" reads as "Malaxis muscifera". */
const binomial = (b: string) => {
  const w = String(b ?? '').replace(/\(.*?\)/g, ' ').trim().split(/\s+/);
  return w.length >= 2 && /^[A-Z][a-z]+$/.test(w[0]) && /^[a-z-]+$/.test(w[1]) ? `${w[0]} ${w[1]}` : '';
};

const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The page <title>, naming what the page actually holds. */
export function pageTitle(d: any, body = ''): string {
  if (d.kind === 'formulation' && records[d.slug]) {
    const r = records[d.slug];
    return `${d.title}: ${r.dose ? 'ingredients, quantities and dose' : 'ingredients and quantities'} (Ayurvedic Formulary of India)`;
  }
  const b = binomial(d.botanical);
  if (d.kind === 'herb' && b) {
    const held = ['botanical identity'];
    if (namePages[`herb/${d.slug}`]) held.push('names');
    if (properties.has(`herb/${d.slug}`)) held.push('properties');
    if (/\bdos(e|age)\b/i.test(body)) held.push('dose');
    return `${d.title} (${b}): ${list(held)}`;
  }
  return d.title;
}

const qty = (q: string) => String(q ?? '').replace(/\s*\.\s*$/, '').replace(/\b(g|kg|ml|l)\.$/i, '$1').trim();
const clean = (q: any) => q != null && String(q).trim() !== '' && !/^\[illegible/i.test(String(q));

/**
 * One sentence from the formulary record, or '' when there is none.
 *
 * Up to ten ingredients are listed with their quantities as printed. Longer recipes are named by
 * count with their first ingredients, because a 48-row Chyawanprash list is not a sentence; the
 * table on the page holds every row.
 */
export function formularySentence(d: any): string {
  if (d.kind !== 'formulation') return '';
  const r = records[d.slug];
  if (!r) return '';
  // Counted the way the rest of the site counts a recipe (every non-structural row, water included),
  // so this sentence and the composition table never disagree; water is only left out of the names.
  const rows = (r.rows ?? []).filter((x: any) => !x.structural && x.name);
  const named = rows.filter((x: any) => !/^water\b/i.test(x.name));
  if (!named.length) return '';
  const where = `The Ayurvedic Formulary of India (Part ${r.afiPart}, entry ${r.entryNumber})`;
  const items = rows.length <= 10
    ? `${rows.length} ingredients: ${list(rows.map((x: any) => (clean(x.quantity) ? `${x.name} ${qty(x.quantity)}` : x.name)))}`
    : `${rows.length} ingredients, beginning with ${list(named.slice(0, 4).map((x: any) => x.name))}`;
  // No dose. The house rule (scripts/lib/answer-safety.mjs) bars a dose from the answer block: from a
  // company that sells the substance, a dose in the opening sentence reads as prescribing. The
  // formulary dose stays in the body and the composition table, where it is framed as the book's.
  return `${where} lists ${items}.`;
}
