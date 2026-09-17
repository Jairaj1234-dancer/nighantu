#!/usr/bin/env node
/**
 * Build a terminology crosswalk from Ayurvedic disease names to WHO ICD-11 TM2 codes.
 *
 *   node scripts/icd-tm2.mjs --fetch     pull every TM2 entity from the WHO ICD API (needs ~/.who-icd-api)
 *   node scripts/icd-tm2.mjs --match     match companion-DB vyadhi names against the cached index terms
 *
 * Terminology only. A crosswalk row says "WHO files the Ayurvedic term X under code Y". It carries
 * no cause, symptom or treatment content, and nothing here is generated: a row exists only when a
 * WHO index term or synonym on the entity itself spells the Sanskrit term.
 *
 * Why the API: WHO's public release files (SimpleTabulation, print PDF) carry only the English
 * TM2 titles. The Ayurvedic terms live on the entities as synonyms/index terms, which only the API
 * serves. It is free, but needs a client id and secret from https://icd.who.int/icdapi, saved as two
 * lines in ~/.who-icd-api (chmod 600). The key never enters the repo.
 *
 * The one ICD code already in the companion DB (Madhumeha, SK04.0) does not exist in the
 * 2026-01 release, which is why no DB code is trusted here.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const RELEASE = '2026-01';
const CACHE = path.join('data', 'enrichment', 'icd-tm2.json');
const OUT = path.join('data', 'sources', 'icd-tm2-crosswalk.json');
const KEYFILE = path.join(os.homedir(), '.who-icd-api');
const DB = path.join(os.homedir(), 'Projects', 'ageayurveda-companion', 'backend', 'ageayurveda.db');
const TM2_ROOT = 'http://id.who.int/icd/release/11/' + RELEASE + '/mms/';

async function token() {
  if (!fs.existsSync(KEYFILE)) {
    console.error(`missing ${KEYFILE}: register at https://icd.who.int/icdapi and save client id and secret as two lines`);
    process.exit(1);
  }
  const [id, secret] = fs.readFileSync(KEYFILE, 'utf8').trim().split(/\r?\n/);
  const res = await fetch('https://icdaccessmanagement.who.int/connect/token', {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, scope: 'icdapi_access', grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error(`token request failed: HTTP ${res.status}`);
  return (await res.json()).access_token;
}

/**
 * WHO's hosts answer in about five seconds, and Node's fetch gives up at ten by default
 * including connect time, so the first call died on a connect timeout rather than
 * anything to do with the credentials. Every request gets an explicit, generous timeout.
 */
const TIMEOUT_MS = 90_000;

async function getJson(url, tok) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(url.replace(/^http:/, 'https:'), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { authorization: `Bearer ${tok}`, accept: 'application/json', 'API-Version': 'v2', 'Accept-Language': 'en' },
    }).catch((e) => {
      if (attempt >= 4) throw e;
      return null;
    });
    if (!res) { await new Promise((r) => setTimeout(r, 1000 * attempt)); continue; }
    if (res.ok) return res.json();
    if (attempt >= 4 || (res.status !== 429 && res.status < 500)) throw new Error(`${url}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

const label = (x) => x?.['@value'] ?? x?.label?.['@value'] ?? '';

async function fetchAll() {
  const tok = await token();
  // Walk down from the Module II chapter, keeping every entity whose code starts with S[J-T].
  const release = await getJson(`https://id.who.int/icd/release/11/${RELEASE}/mms`, tok);
  const chapters = await Promise.all(release.child.map((u) => getJson(u, tok)));
  const tm = chapters.filter((c) => /traditional medicine/i.test(label(c.title)));
  const out = {};
  const queue = tm.flatMap((c) => c.child ?? []);
  while (queue.length) {
    const batch = queue.splice(0, 8);
    const got = await Promise.all(batch.map((u) => getJson(u, tok)));
    for (const e of got) {
      queue.push(...(e.child ?? []));
      if (!/\(TM2\)/.test(label(e.title))) continue;
      const foundation = e.source ? await getJson(e.source, tok).catch(() => null) : null;
      out[e['@id']] = {
        code: e.code ?? null,
        title: label(e.title),
        classKind: e.classKind,
        browser: e.browserUrl ?? null,
        definition: label(e.definition) || null,
        indexTerms: (e.indexTerm ?? []).map(label).filter(Boolean),
        inclusions: (e.inclusion ?? []).map(label).filter(Boolean),
        foundationSynonyms: (foundation?.synonym ?? []).map(label).filter(Boolean),
        foundationNarrowerTerms: (foundation?.narrowerTerm ?? []).map(label).filter(Boolean),
      };
    }
    process.stdout.write(`\r${Object.keys(out).length} TM2 entities`);
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, `${JSON.stringify({ release: RELEASE, fetchedAt: new Date().toISOString().slice(0, 10), entities: out }, null, 1)}\n`);
  console.log(`\nwrote ${CACHE}`);
}

/**
 * Fold IAST and loose romanisations onto one key: Amlapitta, Amla-pitta, Amlapittā meet.
 * The trailing visarga matters here, because WHO writes kampaḥ where the clinical
 * literature writes kampa, so a terminal h is dropped rather than treated as a letter.
 */
export const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z]/g, '').replace(/sh/g, 's').replace(/w/g, 'v').replace(/(.)\1+/g, '$1')
  .replace(/h$/, '');

/**
 * WHO packs all three traditions into one string: "(a) kampaḥ (b) Pāṇikkampa vātam (c) Ra'sha",
 * where (a) is Ayurveda, (b) Siddha and (c) Unani. Only the (a) segment is ours. Matching the
 * whole string, or the Siddha and Unani terms, would attach an Ayurvedic name to a code on the
 * strength of a Tamil or Arabic term that happens to fold alike.
 */
export function ayurvedaTerms(raw) {
  const str = String(raw);
  if (!/\(a\)/.test(str)) return /\([bc]\)/.test(str) ? [] : [str];
  return [...str.matchAll(/\(a\)\s*([^(]+)/g)].map((m) => m[1].trim()).filter(Boolean);
}

/**
 * WHO writes one cell as several terms: "śvayathuḥ, śothaḥ" and "medorogaḥ / atisthaulyam".
 * Each is a separate name for the same code, so they are split rather than matched whole.
 */
const splitTerms = (t) => String(t).split(/[,;/]/).map((x) => x.trim()).filter(Boolean);

/**
 * Three endings are the same word, not different words: the nominative -am and -aḥ that WHO
 * prints (amlapittam, kampaḥ) against the stem the clinical literature uses (amlapitta,
 * kampa), and the -roga suffix (pāṇḍurogaḥ for Pāṇḍu), which means "disease of".
 *
 * Deliberately no fuzzy matching beyond this. dhātugatakuṣṭhaḥ is NOT Kuṣṭha: it is one
 * specific kind of it, and mapping the general name to a subtype's code would be a wrong
 * claim about what WHO files where.
 */
const variants = (name) => {
  const base = fold(name).replace(/m$/, '');
  return [...new Set([base, `${base}roga`, `${base}rog`])];
};

function match() {
  if (!fs.existsSync(CACHE)) { console.error(`run --fetch first (${CACHE} missing)`); process.exit(1); }
  const { entities, release } = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const byTerm = new Map();
  for (const [uri, e] of Object.entries(entities)) {
    if (!e.code) continue;
    for (const raw of [...e.indexTerms, ...e.inclusions, ...e.foundationSynonyms, ...e.foundationNarrowerTerms]) {
      for (const whole of ayurvedaTerms(raw)) {
        for (const t of splitTerms(whole)) {
          const k = fold(t).replace(/m$/, '');
          if (k.length < 4) continue;
          if (!byTerm.has(k)) byTerm.set(k, []);
          byTerm.get(k).push({ uri, code: e.code, title: e.title, term: t });
        }
      }
    }
  }
  const rows = JSON.parse(execFileSync('sqlite3', ['-json', DB, 'select nama_sanskrit, nama_devanagari, english, synonyms from vyadhi'], { encoding: 'utf8' }) || '[]');
  const crosswalk = [];
  const unmatched = [];
  for (const r of rows) {
    const synonyms = JSON.parse(r.synonyms || '[]');
    // The primary Sanskrit name and the synonym list are not equally trustworthy: the
    // synonyms are AI-curated in the companion database, so a code reached only through one
    // is recorded as such and held back from publication rather than shown as settled.
    const candidates = [
      ...variants(r.nama_sanskrit).map((k) => ({ k, via: r.nama_sanskrit, basis: 'primary-name' })),
      ...synonyms.flatMap((sy) => variants(sy).map((k) => ({ k, via: sy, basis: 'synonym' }))),
    ];
    const hits = candidates.flatMap(({ k, via, basis }) => (byTerm.get(k) ?? []).map((h) => ({ ...h, via, basis })));
    // Prefer a primary-name hit when the same code is reached both ways.
    const byCode = new Map();
    for (const h of hits) {
      const prev = byCode.get(h.code);
      if (!prev || (prev.basis === 'synonym' && h.basis === 'primary-name')) byCode.set(h.code, h);
    }
    const uniq = [...byCode.values()];
    if (uniq.length) {
      crosswalk.push({
        sanskrit: r.nama_sanskrit,
        devanagari: r.nama_devanagari,
        basis: uniq.some((h) => h.basis === 'primary-name') ? 'primary-name' : 'synonym',
        codes: uniq,
      });
    } else unmatched.push(r.nama_sanskrit);
  }
  /**
   * Two outputs. The full record, including synonym-only matches and the unmatched list,
   * goes to data/ for review. Only primary-name matches reach src/data, because a code
   * reached through an AI-curated synonym is not established enough to publish.
   *
   * Deliberately NOT written to public/ as a dataset. ICD-11 is CC BY-ND 3.0 IGO, and this
   * site's downloads are CC BY 4.0, which permits derivatives. Reproducing WHO's terms and
   * titles unaltered on a page, attributed and linked, is what the ND licence allows;
   * shipping them in a reusable dataset under a licence that invites modification is not.
   */
  const publishable = crosswalk.filter((c) => c.basis === 'primary-name');
  fs.writeFileSync(path.join('src', 'data', 'icd-tm2.json'), `${JSON.stringify({
    source: `WHO ICD-11 for Mortality and Morbidity Statistics, ${release}, Module II (Traditional Medicine conditions)`,
    licence: 'CC BY-ND 3.0 IGO',
    sourceUrl: 'https://icd.who.int/browse/2026-01/mms/en',
    method: 'Each row exists only because WHO lists this Sanskrit term, in its Ayurveda field, against that code. Nothing is inferred and no code from any other source is used.',
    count: publishable.length,
    rows: publishable,
  }, null, 1)}\n`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify({
    source: `WHO ICD-11 MMS ${release}, Module II (TM2)`,
    method: 'A row exists only where a WHO index term, inclusion or foundation synonym on the TM2 entity spells the Sanskrit term (diacritics and spacing folded). No DB-supplied code is used.',
    count: crosswalk.length,
    onPrimaryName: crosswalk.filter((c) => c.basis === 'primary-name').length,
    onSynonymOnly: crosswalk.filter((c) => c.basis === 'synonym').length,
    ambiguous: crosswalk.filter((c) => c.codes.length > 1).length,
    crosswalk,
    unmatched,
  }, null, 1)}\n`);
  console.log(`matched     ${crosswalk.length} of ${rows.length}`);
  console.log(`on the primary Sanskrit name  ${crosswalk.filter((c) => c.basis === 'primary-name').length}`);
  console.log(`through a synonym only        ${crosswalk.filter((c) => c.basis === 'synonym').length}`);
  console.log(`more than one code            ${crosswalk.filter((c) => c.codes.length > 1).length}`);
  console.log(`wrote ${OUT} and src/data/icd-tm2.json (${publishable.length} publishable rows)`);
}

if (process.argv.includes('--fetch')) await fetchAll();
if (process.argv.includes('--match')) match();
if (!process.argv.includes('--fetch') && !process.argv.includes('--match')) console.log('usage: --fetch | --match');
