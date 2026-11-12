#!/usr/bin/env node
/**
 * Build the Bhavaprakasha Nighantu index: every dravya entry of the text's 24 chapters (varga) with
 * its verse numbers, and, where this site has a page for the same dravya, a link to it.
 *
 * Inputs (kept outside the repository, read locally):
 *   - a contents file read from the e-Nighantu edition of the Bhavaprakasha Nighantu published by
 *     NIIMH, Hyderabad (CCRAS): chapter, entry headword and verse numbers, one row per section;
 *   - a herb map: which site page is the same dravya as which entry, each match proposed and then
 *     independently checked, with doubtful matches dropped rather than kept.
 * Only facts are published: the headword, the chapter and the verse numbers. No verse text is copied.
 *
 *   node scripts/bhavaprakasha.mjs [--toc path] [--map path] [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i < 0 ? d : process.argv[i + 1]; };
const TOC = arg('--toc', path.join('measurement', 'bhavaprakasha', 'toc.json'));
const MAP = arg('--map', path.join('measurement', 'bhavaprakasha', 'map.json'));
const DRY = process.argv.includes('--dry-run');
const SOURCE = 'https://niimh.nic.in/ebooks/e-Nighantu/bhavaprakashanighantu/';

/** The edition's transliteration to IAST, longest keys first. */
const IAST = [
  ['RU', 'ṝ'], ['Ru', 'ṛ'], ['lRu', 'ḷ'], ['~j', 'ñ'], ['~g', 'ṅ'], ['~N', 'ṅ'], ['~n', 'ṅ'], ['Sh', 'ṣ'], ['sh', 'ś'],
  ['A', 'ā'], ['I', 'ī'], ['U', 'ū'], ['T', 'ṭ'], ['D', 'ḍ'], ['N', 'ṇ'], ['M', 'ṃ'], ['H', 'ḥ'],
];
export const toIast = (s) => {
  let out = '';
  for (let i = 0; i < s.length;) {
    if (s[i] === '~' && s[i + 1] === 'a') { out += '’'; i += 2; continue; } // avagraha
    const hit = IAST.find(([k]) => s.startsWith(k, i));
    if (hit) { out += hit[1]; i += hit[0].length; } else { out += s[i]; i += 1; }
  }
  return out.replace(/~/g, '');
};
const cap = (s) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
const slug = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const toc = JSON.parse(fs.readFileSync(TOC, 'utf8'));
const map = fs.existsSync(MAP) ? JSON.parse(fs.readFileSync(MAP, 'utf8')) : [];

const herbTitle = new Map();
for (const f of fs.readdirSync(path.join('content', 'herb'))) {
  const t = fs.readFileSync(path.join('content', 'herb', f), 'utf8').match(/^title: "(.*)"$/m);
  herbTitle.set(f.replace(/\.md$/, ''), t ? t[1] : f);
}

/** Chapter names as the edition gives them. */
const VARGA = ['miSra', 'harItakyAdi', 'karpUrAdi', 'guDUcyAdi', 'puShpa', 'vaTAdi', 'AmrAdiphala',
  'dhAtUpadhAturasoparasaratnoparatnaviShopaviShAdi', 'dhAnya', 'shAka', 'mAMsa', 'kRutAnna', 'vAri', 'dugdha',
  'dadhi', 'takra', 'navanIta', 'ghRuta', 'mUtra', 'taila', 'sandhAna', 'madhu', 'ikShu', 'anekArthanAma'];

const vargas = [];
for (const row of toc) {
  let v = vargas.find((x) => x.number === row.varga);
  if (!v) {
    const name = `${cap(toIast(VARGA[row.varga - 1].replace(/^miS/, 'miś')))} varga`;
    v = { number: row.varga, name, slug: slug(name), entries: [] };
    vargas.push(v);
  }
  const pages = map.filter((m) => m.varga === row.varga && m.entry === row.entry && m.verses === row.verses)
    .filter((m) => herbTitle.has(m.slug))
    .map((m) => ({ slug: m.slug, title: herbTitle.get(m.slug) }));
  v.entries.push({ entry: cap(toIast(row.entry)), verses: row.verses, pages });
}

const herbs = map.filter((m) => herbTitle.has(m.slug)).map((m) => {
  const v = vargas.find((x) => x.number === m.varga);
  return { slug: m.slug, title: herbTitle.get(m.slug), varga: m.varga, vargaName: v?.name ?? '', vargaSlug: v?.slug ?? '', entry: cap(toIast(m.entry)), verses: m.verses };
}).sort((a, b) => a.title.localeCompare(b.title));

const out = {
  updatedAt: new Date().toISOString().slice(0, 10),
  source: SOURCE,
  summary: { vargas: vargas.length, entries: vargas.reduce((n, v) => n + v.entries.length, 0), linked: herbs.length },
  vargas,
  herbs,
};
console.log(`vargas ${out.summary.vargas}, entries ${out.summary.entries}, linked to site pages ${out.summary.linked}`);
if (DRY) process.exit(0);
fs.writeFileSync(path.join('src', 'data', 'bhavaprakasha.json'), `${JSON.stringify(out, null, 2)}\n`);
fs.writeFileSync(path.join('public', 'bhavaprakasha.json'), `${JSON.stringify({ updatedAt: out.updatedAt, source: SOURCE, license: 'https://creativecommons.org/licenses/by/4.0/', vargas: vargas.map((v) => ({ number: v.number, name: v.name, entries: v.entries.map((e) => ({ entry: e.entry, verses: e.verses, pages: e.pages.map((p) => p.slug) })) })) }, null, 1)}\n`);
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
const csv = ['varga_number,varga,entry,verses,site_page'];
for (const v of vargas) for (const e of v.entries) csv.push([v.number, q(v.name), q(e.entry), q(e.verses), q(e.pages.map((p) => `/herb/${p.slug}/`).join(' '))].join(','));
fs.writeFileSync(path.join('public', 'bhavaprakasha.csv'), `${csv.join('\n')}\n`);
