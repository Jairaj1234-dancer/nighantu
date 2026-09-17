import { stripMarkup, wordCount } from './lib.mjs';

// What may never enter an answer block, and why: scripts/lib/answer-safety.mjs.
import { isDose, isDiseaseClaim } from './lib/answer-safety.mjs';

const sentenceList = (text) => stripMarkup(
  text
    .replace(/^#+.*$/gm, '')
    .replace(/^\|.*$/gm, '')       // tables carry no prose
    .replace(/^[-*]\s+/gm, ''),
)
  .split(/(?<=[.!?])\s+/)
  .map((x) => x.trim())
  .filter((x) => x.length > 30 && x.length < 320 && /[a-z]/.test(x))
  .filter((x) => !isDose(x) && !isDiseaseClaim(x));

const sentences = (text, n = 1) => sentenceList(text).slice(0, n).join(' ');

/** Enough leading sentences to reach `target` words, without overshooting badly. */
const sentencesToWords = (text, target) => {
  const out = [];
  for (const s of sentenceList(text)) {
    out.push(s);
    if (wordCount(out.join(' ')) >= target) break;
  }
  return out.join(' ');
};

const sectionText = (sections, names) => {
  for (const n of names) {
    const s = sections.find((x) => x.heading === n);
    if (s?.content.trim()) return s.content;
  }
  return '';
};

const allText = (sections) => sections.map((s) => s.content).join('\n');

/** "**Standard Dosage:** 3-6 g twice daily ..." */
const boldField = (text, label) => {
  const m = new RegExp(`\\*\\*${label}:?\\*\\*\\s*(.+)`, 'i').exec(text);
  return m ? stripMarkup(m[1]).replace(/\s*[.;]\s*$/, '') : '';
};

/** Rasa / Guna / Virya / Vipaka out of the Dravyaguna table. */
function dravyaguna(sections) {
  // stripMarkup first: a wikilink's internal pipe ("[[Amla|Amla]]") otherwise
  // terminates the table cell and leaks brackets into the answer block.
  const t = stripMarkup(
    sectionText(sections, ['Ayurvedic pharmacology (Dravyaguna)', 'Ayurvedic Pharmacology (Dravyaguna)'])
      .replace(/\n/g, '\u0000'),
  ).replace(/\u0000/g, '\n');
  const out = {};
  for (const m of t.matchAll(/^\|\s*\*\*([A-Za-z]+)\*\*[^|]*\|\s*([^|]+?)\s*\|/gm)) {
    const v = stripMarkup(m[2]);
    if (v && v !== '-' && !/^Primary|^Physical|^Heating|^Post-/i.test(v)) out[m[1]] = v;
  }
  return out;
}

/** Bulleted list under a heading, e.g. Parts Used. */
function bullets(sections, names, max = 4) {
  const t = sectionText(sections, names);
  return [...t.matchAll(/^[-*]\s+(.+)$/gm)]
    .map((m) => stripMarkup(m[1]).replace(/\(.*?\)/g, '').trim())
    .filter(Boolean)
    .slice(0, max);
}

// Dosage-form vocabulary, keyed by the vault's formulation folder names.
const FORM_WORDS = new Map(Object.entries({
  'Churnas-Powders': 'churna, a fine herbal powder',
  'Vatis-Tablets': 'vati, a herbal tablet or pill',
  'Tailas-Medicated-Oils': 'taila, a medicated oil',
  'Ghritams-Medicated-Ghee': 'ghrita, a medicated ghee',
  'Kashayams-Decoctions': 'kashaya, a water decoction',
  'Arishtas-Asavas-Fermented': 'fermented arishta or asava',
  'Lehams-Avalehas-Pastes': 'avaleha, a semi-solid herbal confection',
  'Guggulus-Resin-Based': 'guggulu, a resin-based preparation',
  'Arkas-Distillates': 'arka, a herbal distillate',
  'Svarasas-Fresh-Juices': 'svarasa, a fresh plant juice',
  'Rasayanas-Rejuvenatives': 'rasayana, a rejuvenative preparation',
}));

const clampWords = (text, max = 62) => {
  if (wordCount(text) <= max) return text;
  const parts = text.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const s of parts) {
    if (out && wordCount(`${out} ${s}`) > max) break;
    out = out ? `${out} ${s}` : s;
  }
  return out || parts[0];
};

/**
 * Compose a 40-60 word definitional answer placed directly under the H1. This is
 * the passage an answer engine is most likely to lift verbatim, so it is built
 * only from facts already stated on the page, never inferred.
 */
/**
 * How a page describes itself when the vault gave it no Ayurvedic category. The identity
 * pass established these, and they are more informative than "a substance used in the
 * Ayurvedic materia medica", which is what a bhasma page was left with.
 */
const CLASS_PHRASE = {
  mineral: 'is a bhasma, a mineral or metal preparation reduced to ash by repeated calcination',
  'rasa-preparation': 'is a rasa preparation, a herbo-mineral formulation of the rasa shastra tradition',
  salt: 'is a salt or alkali preparation used in Ayurveda',
  animal: 'is an animal-derived substance used in the Ayurvedic materia medica',
  'compound-or-isolate': 'is an isolated compound rather than a whole plant drug',
  'plant-product-mixture': 'is a preparation made from plant material',
  formulation: 'is a compound formulation of several ingredients',
};

export function composeAnswer({ title, kind, facts, sections, lead, group, substanceClass }) {
  const bits = [];
  const dg = dravyaguna(sections);
  const text = allText(sections);
  /**
   * Dosage is deliberately NOT composed into the answer block.
   *
   * It used to be, and it reached 492 of the herb blocks as "Usual dose: 3-6 g powder
   * twice daily". The answer block is the passage a reader sees first and the one an
   * answer engine is most likely to quote whole, and a dose in it, published by a
   * company that sells the substance, reads as prescribing rather than reference. The
   * classical dose stays on the page, in the body, where it is framed as what the
   * literature describes. It is read here only so the composer can avoid repeating it.
   */
  const dosage = '';

  const dgSentence = () => {
    const parts = [];
    if (dg.Rasa) parts.push(`${dg.Rasa} rasa`);
    if (dg.Guna) parts.push(`${dg.Guna} guna`);
    if (dg.Virya) parts.push(`${dg.Virya} virya`);
    if (dg.Vipaka) parts.push(`${dg.Vipaka} vipaka`);
    return parts.length >= 2 ? `Its Ayurvedic pharmacology is ${parts.join(', ')}.` : '';
  };

  if (kind === 'device') {
    const sanskrit = facts['Sanskrit Name'] ? ` (Sanskrit: ${stripMarkup(facts['Sanskrit Name'])})` : '';
    const cat = facts['Category'] ? stripMarkup(facts['Category']).toLowerCase() : 'Ayurvedic';
    bits.push(`${title}${sanskrit} is an instrument used in ${cat}.`);
    const opening = sentences(lead, 2) || sentences(sectionText(sections, ['How is it used traditionally?']), 1);
    if (opening) bits.push(opening);
    const materials = bullets(sections, ['Traditional materials', 'Traditional Materials'], 4);
    if (materials.length && wordCount(bits.join(' ')) < 42) {
      bits.push(`Traditionally made from ${materials.join(', ').toLowerCase()}.`);
    }
  } else if (kind === 'formulation') {
    const form = FORM_WORDS.get(group);
    bits.push(`${title} is a classical Ayurvedic ${form ?? 'preparation'}.`);
    const opening = sentences(lead, 1);
    if (opening) bits.push(opening);
    const dgs = dgSentence();
    if (dgs) bits.push(dgs);
  } else if (kind === 'hub') {
    bits.push(`${title} is a reference entry in the Nighantu.`);
    const opening = sentences(lead, 2) || sentences(text, 2);
    if (opening) bits.push(opening);
  } else {
    let s = title;
    const botanical = facts['Botanical Name'];
    if (botanical) s += ` (${stripMarkup(botanical)})`;
    const cat = facts['Ayurvedic Category'] || facts['Category'];
    // "plant" is wrong for the mineral, dairy and animal-origin dravyas.
    const classPhrase = CLASS_PHRASE[substanceClass ?? ''];
    if (cat) s += ` is classified in Ayurveda as ${stripMarkup(cat)}`;
    else if (botanical) s += ' is a plant used in Ayurveda';
    else if (classPhrase) s += ` ${classPhrase}`;
    else s += ' is a substance used in the Ayurvedic materia medica';
    const family = facts['Family'];
    if (family) s += `, from the ${stripMarkup(family)} family`;
    bits.push(s + '.');

    const parts = bullets(sections, ['Parts Used'], 4);
    if (parts.length) bits.push(`Parts used: ${parts.join(', ').toLowerCase()}.`);

    const trad = sentences(
      sectionText(sections, [
        'How is it used traditionally?', 'Traditional / Classical Uses',
        'Which traditional uses are supported by research?',
      ]),
      1,
    );
    if (trad) bits.push(trad);
    else {
      const dgs = dgSentence();
      if (dgs) bits.push(dgs);
    }
  }

  const who = facts['WHO/Pharmacopeia Status'];
  if (who && wordCount(bits.join(' ')) < 44) {
    const first = stripMarkup(who).split(/(?<=[.!?])\s+/)[0];
    if (first && first.length < 220) bits.push(first.endsWith('.') ? first : `${first}.`);
  }

  // Last resort for sparse pages: the first substantive prose anywhere on the
  // page, then the Dravyaguna profile. An answer block that says nothing is
  // worse than no answer block, so nothing ships under ~12 words.
  if (wordCount(bits.join(' ')) < 26) {
    const have = bits.join(' ');
    const extra = sentencesToWords(text, 32 - wordCount(have));
    if (extra && !have.includes(extra.slice(0, 40))) bits.push(extra);
  }
  if (wordCount(bits.join(' ')) < 24) {
    const dgs = dgSentence();
    if (dgs && !bits.includes(dgs)) bits.push(dgs);
  }

  // Nothing resembling markup may reach the answer block: it is the passage most
  // likely to be quoted verbatim, and it also ships inside the JSON-LD.
  //
  // Nor may placeholder text. The last-resort branch above scrapes whatever prose it
  // can find, and on one page that produced an answer telling the reader that
  // Holoptelea integrifolia, a tree, is a "Mineral-derived preparation ... Analytical
  // Methods: XRD, ICP-OES, SEM-EDS". Placeholders are stripped from the body elsewhere,
  // but the answer is assembled from the raw text, so it needs its own guard, and it
  // needs it more: the answer block is the first thing a reader sees and the passage an
  // AI is most likely to lift whole.


  const PLACEHOLDER_SENTENCE = [
    /Mineral-derived preparation/i,
    /Composition varies by specific preparation method/i,
    /No .{0,24}data (currently )?available/i,
    /not yet catalogued/i,
    /Analytical Methods:\s*(XRD|ICP-OES|SEM-EDS)/i,
    /Further research recommended/i,
  ];
  const clean = stripMarkup(bits.join(' '))
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !PLACEHOLDER_SENTENCE.some((p) => p.test(sentence)))
    .filter((sentence) => !isDiseaseClaim(sentence))
    .filter((sentence) => !isDose(sentence))
    .join(' ');

  const composed = clean.replace(/\s+/g, ' ').trim();
  return clampWords(composed);
}
