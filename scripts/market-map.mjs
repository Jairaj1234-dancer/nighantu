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
 *   node scripts/market-map.mjs --prompts <file> --engine claude   # Claude with web search
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
const ENGINE = arg('--engine', 'gemini');
if (!['gemini', 'claude'].includes(ENGINE)) {
  console.error('--engine is gemini or claude.');
  process.exit(1);
}
const key = ENGINE === 'claude'
  ? process.env.ANTHROPIC_API_KEY || fromFile('.anthropic-api')
  : process.env.GEMINI_API_KEY || fromFile('.gemini-api');
if (!key) {
  console.error(ENGINE === 'claude'
    ? 'No ANTHROPIC_API_KEY and no ~/.anthropic-api. Nothing to ask with.'
    : 'No GEMINI_API_KEY and no ~/.gemini-api. Nothing to ask with.');
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf8'));
const BASE_NAME = spec.name ?? path.basename(PROMPTS_FILE, '.json');
// A separate name per engine, so the two readings never overwrite or shadow each other.
const NAME = ENGINE === 'claude' ? `${BASE_NAME}-claude` : BASE_NAME;
const PROMPTS = spec.prompts ?? [];
/** Domains that are us, so the report can say where we already stand rather than count us as a rival. */
const OURS = (spec.ours ?? []).map((d) => d.toLowerCase());

const MODEL = ENGINE === 'claude'
  ? process.env.CLAUDE_PROBE_MODEL || 'claude-sonnet-5-5'
  : process.env.GEO_AUDIT_MODEL || 'gemini-2.5-flash';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A request that has not answered in this long is abandoned. fetch has no timeout of its own, so a
 *  connection dropped mid-request (a laptop going to sleep, say) would otherwise hold the run forever. */
const REQUEST_TIMEOUT_MS = 120_000;
/** Claude's token and search counts, summed over the run, so each reading records what it used. */
const usage = { inputTokens: 0, outputTokens: 0, searches: 0 };
const hostOf = (u) => { try { return new globalThis.URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

/**
 * One ask to Claude with its web search tool. Unlike Gemini's grounding, the results carry real
 * URLs, so the full hostname is kept (nighantu.ageayurveda.com and ageayurveda.com stay apart).
 * Two lists come back: every host the search returned, and the hosts the answer actually cites.
 * `domains` is the cited list, which is the one comparable to a citation.
 */
async function askClaude(question) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: 'user', content: question }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      }),
    });
    const json = await res.json();
    if (res.ok) {
      usage.inputTokens += json.usage?.input_tokens ?? 0;
      usage.outputTokens += json.usage?.output_tokens ?? 0;
      usage.searches += json.usage?.server_tool_use?.web_search_requests ?? 0;
      const blocks = json.content ?? [];
      const searched = blocks.filter((b) => b.type === 'web_search_tool_result' && Array.isArray(b.content))
        .flatMap((b) => b.content.map((r) => r.url));
      const cited = blocks.filter((b) => b.type === 'text')
        .flatMap((b) => (b.citations ?? []).map((c) => c.url));
      return {
        domains: [...new Set(cited.map(hostOf).filter(Boolean))],
        searched: [...new Set(searched.map(hostOf).filter(Boolean))],
        urls: [...new Set(cited)],
      };
    }
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403 || /credit balance/i.test(msg)) {
      const e = new Error(msg);
      e.fatal = true;
      throw e;
    }
    if (![429, 529].includes(res.status) || attempt > 4) throw new Error(msg);
    const wait = 20_000 * attempt;
    process.stdout.write(`rate limited, waiting ${Math.round(wait / 1000)}s... `);
    await sleep(wait);
  }
}

/** One grounded ask. Returns the source domains, or throws with .fatal on a refused key or a spent daily quota. */
async function askGemini(question) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
    if (res.status === 401 || res.status === 403 || /API key not valid|API_KEY_INVALID/i.test(msg)) {
      const e = new Error(`key refused: ${msg}`);
      e.fatal = true;
      throw e;
    }
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
  const searched = new Set();
  const urls = new Set();
  let asked = 0;
  let error = '';
  for (let rep = 0; rep < REPS; rep += 1) {
    if (i > 0 || rep > 0) await sleep(PACE_MS);
    try {
      if (ENGINE === 'claude') {
        const r = await askClaude(question);
        r.domains.forEach((d) => seen.add(d));
        r.searched.forEach((d) => searched.add(d));
        r.urls.forEach((u) => urls.add(u));
      } else {
        (await askGemini(question)).forEach((d) => seen.add(d));
      }
      asked += 1;
    } catch (e) {
      error = String(e.message ?? e);
      if (e.fatal) {
        console.log(`\n\nStopping: ${ENGINE === 'claude' ? 'the key or the credit balance was refused' : 'the key was refused or the daily allowance is spent'}. Partial results are kept.`);
        stopped = true;
      }
      break;
    }
  }
  rows.push(ENGINE === 'claude'
    ? { question, asked, error, domains: [...seen], searched: [...searched], urls: [...urls] }
    : { question, asked, error, domains: [...seen] });
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
// --out keeps a reading out of the public repo: infra/index-probe-weekly.sh writes to measurement/.
const OUT_DIR = arg('--out', 'data');
const out = path.join(OUT_DIR, `market-map-${NAME}-${date}.json`);
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({
  name: NAME, engine: ENGINE, date, model: MODEL, reps: REPS,
  questionsAsked: answered.length, questionsTotal: PROMPTS.length,
  distinctDomains: ranked.length,
  ...(ENGINE === 'claude' ? { usage } : {}),
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
if (ENGINE === 'claude') console.log(`\nUsage: ${usage.inputTokens} input tokens, ${usage.outputTokens} output tokens, ${usage.searches} searches`);
console.log(`\nWritten to ${out}`);
