import { stripMarkup, wordCount } from './lib.mjs';

const sentenceList = (text) => stripMarkup(
  text
    .replace(/^#+.*$/gm, '')
    .replace(/^\|.*$/gm, '')       // tables carry no prose
    .replace(/^[-*]\s+/gm, ''),
)
  .split(/(?<=[.!?])\s+/)
  .map((x) => x.trim())
  .filter((x) => x.length > 30 && x.length < 320 && /[a-z]/.test(x));

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
export function composeAnswer({ title, kind, facts, sections, lead, group }) {
  const bits = [];
  const dg = dravyaguna(sections);
  const text = allText(sections);
  const dosage = boldField(text, 'Standard Dosage') || boldField(text, 'Dose');

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
    if (dosage && wordCount(bits.join(' ')) < 45) {
      bits.push(`The usual dose is ${dosage.replace(/^[A-Z]/, (c) => c.toLowerCase())}.`);
    }
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
    s += cat
      ? ` is classified in Ayurveda as ${stripMarkup(cat)}`
      : (botanical ? ' is a plant used in Ayurveda' : ' is a substance used in the Ayurvedic materia medica');
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
    if (dosage && wordCount(bits.join(' ')) < 40) {
      bits.push(`Usual dose: ${dosage.replace(/^[A-Z]/, (c) => c.toLowerCase())}.`);
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
  if (wordCount(bits.join(' ')) < 24 && dosage) {
    bits.push(`Usual dose: ${dosage.replace(/^[A-Z]/, (c) => c.toLowerCase())}.`);
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
    .join(' ');

  const composed = clean.replace(/\s+/g, ' ').trim();
  return clampWords(composed);
}
