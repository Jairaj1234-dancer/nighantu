#!/usr/bin/env node
/**
 * Extract Ayurvedic pharmacology (Dravyaguna) into queryable structured data.
 *
 * 226 pages carry a rasa / guna / virya / vipaka table, and until now it existed only
 * as a rendered Markdown table: readable by a person on one page, invisible to anyone
 * wanting to ask a question across the corpus. "Which herbs are ushna virya and
 * kashaya rasa" is the natural question about this material and nothing on the web
 * answers it.
 *
 * Values are checked against a fixed classical vocabulary rather than accepted as
 * free text. Anything unrecognised is reported and dropped, not silently stored,
 * because a typo that becomes a filter value is a filter nobody can use. The known
 * failure this guards against is real: the sour taste (amla) and the fruit Amla are
 * the same string, and the wikilink resolver had linked 27 of these cells to the
 * wrong thing entirely.
 *
 *   node scripts/dravyaguna.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, stripMarkup } from './lib.mjs';

const DRY = process.argv.includes('--dry-run');

/** The classical vocabularies. Anything outside these is a parse failure, not a value. */
const RASA = ['Madhura', 'Amla', 'Lavana', 'Katu', 'Tikta', 'Kashaya'];
const VIRYA = ['Ushna', 'Sheeta'];
const VIPAKA = ['Madhura', 'Amla', 'Katu'];
const GUNA = [
  'Laghu', 'Guru', 'Ruksha', 'Snigdha', 'Sheeta', 'Ushna', 'Manda', 'Tikshna',
  'Sthira', 'Sara', 'Mridu', 'Kathina', 'Vishada', 'Picchila', 'Slakshna', 'Khara',
  'Sukshma', 'Sthula', 'Sandra', 'Drava',
];
const EFFECT = {
  decreases: 'decreases', pacifies: 'decreases', reduces: 'decreases',
  increases: 'increases', 'may increase': 'increases',
  'may increase in excess': 'increases-in-excess',
  neutral: 'neutral', balances: 'balances', 'may aggravate': 'increases',
};

const ENGLISH = {
  Madhura: 'sweet', Amla: 'sour', Lavana: 'salty',
  Katu: 'pungent', Tikta: 'bitter', Kashaya: 'astringent',
  Ushna: 'heating', Sheeta: 'cooling',
  Laghu: 'light', Guru: 'heavy', Ruksha: 'dry', Snigdha: 'unctuous',
};

const unknown = new Map();
const note = (field, v) => unknown.set(`${field}: ${v}`, (unknown.get(`${field}: ${v}`) ?? 0) + 1);

/** Case-insensitive match against a vocabulary, returning the canonical spelling. */
const canon = (vocab, v) => vocab.find((x) => x.toLowerCase() === v.toLowerCase()) ?? null;

function splitValues(cell, vocab, field) {
  return stripMarkup(cell)
    .split(/[,/;]| and /i)
    .map((s) => s.replace(/\(.*?\)/g, '').trim())
    .filter(Boolean)
    .map((s) => { const c = canon(vocab, s); if (!c) note(field, s); return c; })
    .filter(Boolean);
}

const ROW = /^\|\s*\*\*([A-Za-z]+)\*\*[^|]*\|([^|]*)\|/;

function parsePage(body) {
  const out = { rasa: [], guna: [], virya: '', vipaka: [], prabhava: '', dosha: {}, doshaNotes: {} };
  let seen = false;
  for (const line of body.split('\n')) {
    const m = ROW.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const cell = m[2].trim();
    if (!cell || cell === '-') continue;
    switch (key) {
      case 'rasa':   out.rasa = splitValues(cell, RASA, 'rasa'); seen = true; break;
      case 'guna':   out.guna = splitValues(cell, GUNA, 'guna'); seen = true; break;
      case 'virya':  { const v = canon(VIRYA, stripMarkup(cell).replace(/\(.*?\)/g, '').trim());
                       if (v) { out.virya = v; seen = true; } else note('virya', cell); break; }
      case 'vipaka': out.vipaka = splitValues(cell, VIPAKA, 'vipaka'); seen = true; break;
      case 'prabhava': out.prabhava = stripMarkup(cell); seen = true; break;
      case 'vata': case 'pitta': case 'kapha': {
        // Some cells qualify the effect ("May Increase (Dry Form Especially)").
        // The qualifier is real editorial information but it is not a filter value,
        // so the effect is stored structured and the qualifier kept as a note.
        const raw = stripMarkup(cell).trim();
        const qualifier = (raw.match(/\((.+)\)/) ?? [])[1] ?? '';
        const base = raw.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
        const e = EFFECT[base];
        if (e) {
          out.dosha[key] = e;
          if (qualifier) (out.doshaNotes ??= {})[key] = qualifier;
          seen = true;
        } else note('dosha', cell);
        break;
      }
      default: break;
    }
  }
  return seen ? out : null;
}

const entries = [];
for (const kind of fs.readdirSync('content')) {
  const dir = path.join('content', kind);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const { data, body } = parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
    const dg = parsePage(body);
    if (!dg) continue;
    entries.push({
      kind, slug: data.slug || f.replace(/\.md$/, ''), title: data.title || '',
      botanical: data.botanical || '', sanskrit: data.sanskrit || '',
      ...dg,
    });
  }
}

entries.sort((a, b) => a.title.localeCompare(b.title));

const tally = (fn) => {
  const m = {};
  for (const e of entries) for (const v of [fn(e)].flat().filter(Boolean)) m[v] = (m[v] ?? 0) + 1;
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
};

const summary = {
  entries: entries.length,
  withRasa: entries.filter((e) => e.rasa.length).length,
  withVirya: entries.filter((e) => e.virya).length,
  withVipaka: entries.filter((e) => e.vipaka.length).length,
  withGuna: entries.filter((e) => e.guna.length).length,
  withDosha: entries.filter((e) => Object.keys(e.dosha).length).length,
  byRasa: tally((e) => e.rasa),
  byVirya: tally((e) => e.virya),
  byVipaka: tally((e) => e.vipaka),
  byGuna: tally((e) => e.guna),
};

console.log(`entries        ${summary.entries}`);
console.log(`with rasa      ${summary.withRasa}`);
console.log(`with virya     ${summary.withVirya}`);
console.log(`with vipaka    ${summary.withVipaka}`);
console.log(`with guna      ${summary.withGuna}`);
console.log(`with dosha     ${summary.withDosha}`);
console.log(`byVirya        ${JSON.stringify(summary.byVirya)}`);
console.log(`byRasa         ${JSON.stringify(summary.byRasa)}`);
if (unknown.size) {
  console.log(`\nunrecognised values (dropped, not stored): ${unknown.size} distinct`);
  [...unknown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .forEach(([k, n]) => console.log(`  ${n}x  ${k}`));
}

if (DRY) { console.log('\nDry run: nothing written.'); process.exit(0); }

const payload = { updatedAt: new Date().toISOString().slice(0, 10), english: ENGLISH, summary, entries };
fs.mkdirSync(path.join('src', 'data'), { recursive: true });
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync(path.join('src', 'data', 'dravyaguna.json'), JSON.stringify(payload, null, 1));
fs.writeFileSync(path.join('public', 'dravyaguna.json'), JSON.stringify({
  name: 'Age Ayurveda Nighantu Dravyaguna dataset',
  description: 'Classical Ayurvedic pharmacology (rasa, guna, virya, vipaka, prabhava and dosha effect) '
    + 'for the entries in this reference that state it, as structured values against a fixed vocabulary.',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  ...payload,
}, null, 1));

const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
fs.writeFileSync(path.join('public', 'dravyaguna.csv'), `${[
  'slug,kind,title,botanical,sanskrit,rasa,guna,virya,vipaka,prabhava,vata,pitta,kapha',
  ...entries.map((e) => [
    e.slug, e.kind, e.title, e.botanical, e.sanskrit,
    e.rasa.join('; '), e.guna.join('; '), e.virya, e.vipaka.join('; '), e.prabhava,
    e.dosha.vata ?? '', e.dosha.pitta ?? '', e.dosha.kapha ?? '',
  ].map(esc).join(',')),
].join('\n')}\n`);

console.log('\nwrote src/data/dravyaguna.json, public/dravyaguna.json, public/dravyaguna.csv');
