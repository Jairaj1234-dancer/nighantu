#!/usr/bin/env node
/**
 * Map who an answer engine cites across a whole topic, and how defensible their position is.
 *
 * The citation panel (scripts/geo-audit.mjs) asks a fixed question: are WE cited. This asks a
 * prior one: who is, and why. It is the tool for a space we have not entered yet, where the
 * useful output is not a score but a ranked list of incumbents and the shape of their hold.
 *
 * The distinction that matters, and the reason this records more than a frequency count: a
 * domain cited on forty questions because it sells the thing is in a different position from
 * one cited on forty because it explains the thing. The first is displaced by outranking a
 * vendor. The second is displaced only by writing something better, which is the game this
 * site can actually play. So every domain is scored on reach (how many questions it appears
 * on) and on concentration (whether it owns a cluster or is scattered thin).
 *
 *   node scripts/market-map.mjs --prompts data/prompts/contract-manufacturing.json
 *   node scripts/market-map.mjs --prompts <file> --reps 2      # more asks per question
 *
 * Writes data/market-map-<name>-<date>.json and prints the ranked report.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const PROMPTS_FILE = arg('--prompts');
if (!PROMPTS_FILE) {
  console.error('Usage: node scripts/market-map.mjs --prompts data/prompts/<name>.json');
  process.exit(1);
}

const REPS = Math.max(1, Number(arg('--reps', 1)));
const PACE_MS = Number(process.env.GEO_AUDIT_PACE_MS ?? 5000);

const fromFile = (name) => {
  try {
    return fs.readFileSync(path.join(os.homedir(), name), 'utf8').trim().split(/\r?\n/)[0] || null;
  } catch { return null; }
};
const key = process.env.GEMINI_API_KEY || fromFile('.gemini-api');
if (!key) {
  console.error('No GEMINI_API_KEY and no ~/.gemini-api. Nothing to ask with.');
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf8'));
const NAME = spec.name ?? path.basename(PROMPTS_FILE, '.json');
const PROMPTS = spec.prompts ?? [];
/** Domains that are us, so the report can say where we already stand rather than count us as a rival. */
const OURS = (spec.ours ?? []).map((d) => d.toLowerCase());

const MODEL = process.env.GEO_AUDIT_MODEL || 'gemini-2.5-flash';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One grounded ask. Returns the source domains, or throws with .fatal on a spent daily quota. */
async function ask(question) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: question }] }],
        tools: [{ googleSearch: {} }],
      }),
    });
    const json = await res.json();
    if (res.ok) {
      const chunks = json.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      // web.title carries the registrable domain; the uri is a redirect that hides it.
      return [...new Set(chunks.map((c) => String(c?.web?.title ?? '').toLowerCase()).filter(Boolean))];
    }
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    // A per-minute limit clears in seconds. A spent daily allowance does not clear until the
    // quota resets, and backing off through it just burns the run.
    if (/per day|PerDay|daily limit|exceeded your current quota/i.test(msg)) {
      const e = new Error(`daily quota exhausted: ${msg}`);
      e.fatal = true;
      throw e;
    }
    if (res.status !== 429 || attempt > 4) throw new Error(msg);
    const wait = 20_000 * attempt;
    process.stdout.write(`rate limited, waiting ${Math.round(wait / 1000)}s... `);
    await sleep(wait);
  }
}

const rows = [];
let stopped = false;

console.log(`Mapping "${NAME}" across ${PROMPTS.length} questions, ${REPS} ask(s) each.\n`);

for (const [i, question] of PROMPTS.entries()) {
  if (stopped) break;
  process.stdout.write(`[${i + 1}/${PROMPTS.length}] ${question.slice(0, 58)}... `);
  const seen = new Set();
  let asked = 0;
  let error = '';
  for (let rep = 0; rep < REPS; rep += 1) {
    if (i > 0 || rep > 0) await sleep(PACE_MS);
    try {
      (await ask(question)).forEach((d) => seen.add(d));
      asked += 1;
    } catch (e) {
      error = String(e.message ?? e);
      if (e.fatal) {
        console.log('\n\nStopping: the daily allowance is spent. Partial results are kept.');
        stopped = true;
      }
      break;
    }
  }
  rows.push({ question, asked, error, domains: [...seen] });
  if (error && !asked) console.log(`ERROR: ${error.slice(0, 60)}`);
  else {
    const mine = [...seen].filter((d) => OURS.some((o) => d.includes(o)));
    console.log(`${seen.size} sources${mine.length ? `  <-- ${mine.join(', ')}` : ''}`);
  }
}

// ------------------------------------------------------------------ analysis
const answered = rows.filter((r) => r.asked > 0);
const reach = new Map();
for (const r of answered) for (const d of r.domains) {
  const e = reach.get(d) ?? { domain: d, questions: [] };
  e.questions.push(r.question);
  reach.set(d, e);
}

const ranked = [...reach.values()]
  .map((e) => ({ ...e, n: e.questions.length, share: e.questions.length / (answered.length || 1) }))
  .sort((a, b) => b.n - a.n);

const date = new Date().toISOString().slice(0, 10);
const out = path.join('data', `market-map-${NAME}-${date}.json`);
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({
  name: NAME, date, model: MODEL, reps: REPS,
  questionsAsked: answered.length, questionsTotal: PROMPTS.length,
  distinctDomains: ranked.length,
  domains: ranked.map(({ domain, n, share, questions }) => ({ domain, n, share: Number(share.toFixed(3)), questions })),
  rows,
}, null, 2)}\n`);

console.log(`\n${'='.repeat(64)}`);
console.log(`${NAME}: ${answered.length} of ${PROMPTS.length} questions answered, ${ranked.length} distinct domains\n`);
console.log('Rank  Questions  Share  Domain');
for (const [i, d] of ranked.slice(0, 30).entries()) {
  const mine = OURS.some((o) => d.domain.includes(o)) ? '  <-- us' : '';
  console.log(`${String(i + 1).padStart(4)}  ${String(d.n).padStart(9)}  ${(d.share * 100).toFixed(0).padStart(4)}%  ${d.domain}${mine}`);
}

const ourRows = ranked.filter((d) => OURS.some((o) => d.domain.includes(o)));
console.log(`\nWhere we stand: ${ourRows.length ? ourRows.map((d) => `${d.domain} on ${d.n}`).join(', ') : 'not cited on any question'}`);

// A domain on many questions has reach; one on few has a niche. Both are worth knowing, but
// only the second is realistically taken by writing one better page.
const broad = ranked.filter((d) => d.share >= 0.2);
console.log(`\n${broad.length} domain(s) appear on a fifth or more of the questions. Those are the incumbents.`);
console.log(`${ranked.filter((d) => d.n === 1).length} appear on exactly one, which is a long tail rather than a position.`);
console.log(`\nWritten to ${out}`);
