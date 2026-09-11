#!/usr/bin/env node
/**
 * Build the safety work-list: every herb page that needs a safety record, in the
 * order the risk justifies, with whatever seed data already exists attached.
 *
 * Order matters more than it looks. Bhasma and rasa-shastra pages go first because
 * a metallic preparation with no heavy-metal statement is the worst single page on
 * the site, then the plants that are toxic before processing, then everything else.
 * If the run is interrupted, what got done is the part that mattered.
 *
 * The seed is smaller than it first appeared. The companion database has
 * contraindications on 48 of 171 dravyas, and only 20 of those join to a live page
 * by botanical name. So this is overwhelmingly a research job, not a verification
 * job, and the seed exists to give the researcher a starting point rather than an
 * answer. Every seeded value is `llm-only` provenance upstream and carries no
 * source, so it must earn its citation like anything else.
 *
 *   node scripts/safety-worklist.mjs            # write data/safety-worklist.json
 *   node scripts/safety-worklist.mjs --stats    # just the counts
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseFrontmatter } from './lib.mjs';
import { HEAVY_METAL_REQUIRED } from './lib/safety.mjs';

const OUT = path.join('data', 'safety-worklist.json');
const DB = path.join(os.homedir(), 'Projects/ageayurveda-companion/backend/ageayurveda.db');
const STATS_ONLY = process.argv.includes('--stats');

/** Plants whose unprocessed drug is toxic, or which are scheduled. These get the
 *  same priority as the bhasmas: the page is read by people who may source the raw
 *  herb, and "we had no data" is not an acceptable answer on any of them. */
const HIGH_RISK = [
  /^aconitum/i, /^papaver/i, /^cannabis/i, /^strychnos/i, /^datura/i, /^abrus/i,
  /^croton/i, /^baliospermum/i, /^plumbago/i, /^semecarpus/i, /^calotropis/i,
  /^gloriosa/i, /^nerium/i, /^cerbera/i, /^ricinus/i, /^jatropha/i, /^euphorbia/i,
  /^acorus/i, /^commiphora mukul/i, /^ephedra/i, /^withania somnifera/i,
];

/** Read the companion DB read-only. immutable=1 avoids creating WAL sidecars in
 *  someone else's project, which a plain open has done here before. */
function loadSeed() {
  if (!fs.existsSync(DB)) { console.error(`companion db not found at ${DB}; continuing with no seed`); return new Map(); }
  const q = `SELECT latin_binomial, nama_sanskrit, contraindications, viruddha,
             toxicity_notes, pregnancy_lactation_status
             FROM dravyas WHERE latin_binomial IS NOT NULL AND trim(latin_binomial) <> '';`;
  let rows = '';
  try {
    rows = execFileSync('sqlite3', ['-json', `file:${DB}?immutable=1`, q], { encoding: 'utf8' });
  } catch (e) { console.error(`db read failed (${e.message}); continuing with no seed`); return new Map(); }

  const seed = new Map();
  for (const r of JSON.parse(rows || '[]')) {
    const key = genusSpecies(r.latin_binomial);
    if (!key) continue;
    const parse = (v) => { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } };
    const entry = {
      sanskrit: r.nama_sanskrit || '',
      contraindications: parse(r.contraindications),
      viruddha: parse(r.viruddha),
      toxicityNotes: (r.toxicity_notes || '').trim(),
      pregnancy: (r.pregnancy_lactation_status || '').trim(),
    };
    const any = entry.contraindications.length || entry.viruddha.length || entry.toxicityNotes || entry.pregnancy;
    if (any) seed.set(key, entry);
  }
  return seed;
}

const genusSpecies = (b) => {
  const parts = String(b || '').replace(/[(),]/g, ' ').trim().split(/\s+/);
  return parts.length >= 2 ? `${parts[0]} ${parts[1]}`.toLowerCase() : '';
};

const seed = loadSeed();
const items = [];

for (const file of fs.readdirSync(path.join('content', 'herb')).sort()) {
  if (!file.endsWith('.md')) continue;
  const raw = fs.readFileSync(path.join('content', 'herb', file), 'utf8');
  const { data, body } = parseFrontmatter(raw);
  const slug = data.slug || file.replace(/\.md$/, '');
  const botanical = (data.botanical || '').trim();
  const gs = genusSpecies(botanical);

  const needsHeavyMetals = HEAVY_METAL_REQUIRED.has(data.subcategory || '');
  const highRisk = gs && HIGH_RISK.some((p) => p.test(gs));
  // A page that already carries real safety prose is not skipped, but it is not
  // urgent either: the panel still checks it, just later.
  const hasExisting = /##\s*Safety, contraindications/i.test(body);

  items.push({
    slug,
    title: data.title || slug,
    botanical,
    sanskrit: data.sanskrit || seed.get(gs)?.sanskrit || '',
    subcategory: data.subcategory || '',
    group: data.group || '',
    needsHeavyMetals,
    highRisk: Boolean(highRisk),
    hasExisting,
    seed: seed.get(gs) ?? null,
    priority: needsHeavyMetals ? 0 : highRisk ? 1 : hasExisting ? 3 : 2,
  });
}

items.sort((a, b) => a.priority - b.priority || a.slug.localeCompare(b.slug));

const stats = {
  total: items.length,
  heavyMetalRequired: items.filter((i) => i.needsHeavyMetals).length,
  highRisk: items.filter((i) => i.highRisk).length,
  withSeed: items.filter((i) => i.seed).length,
  withBotanical: items.filter((i) => i.botanical).length,
  alreadyHaveSafety: items.filter((i) => i.hasExisting).length,
};

for (const [k, v] of Object.entries(stats)) console.log(`${k.padEnd(22)} ${v}`);

if (STATS_ONLY) process.exit(0);
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ stats, items }, null, 1));
console.log(`\nwrote ${OUT}`);
