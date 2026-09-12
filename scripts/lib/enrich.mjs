/**
 * Shared machinery for deterministic enrichment against public identifier APIs.
 *
 * The safety work established what expensive data costs here: four passes of agent
 * research and adversarial audit produced five records. That is the right price for
 * claims about whether something is harmful, and the wrong price for facts that are
 * simply looked up. A PubChem CID or a GBIF taxon key is not a judgement. The name
 * either resolves or it does not, the answer is the same every time, and it can be
 * checked by anyone in one request.
 *
 * So everything here is:
 *   deterministic  no model in the loop, no verdict to audit
 *   cached on disk  a resolved lookup is never repeated, including in CI
 *   resumable       an interrupted run loses only the request in flight
 *   honest about misses  an unresolved name is recorded as unresolved, never guessed
 *
 * The cache is committed. That is deliberate: it makes the numbers on the site
 * reproducible from a clean clone without hitting anyone's API, and it means a
 * rebuild costs nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { get } from './fetch.mjs';

const DIR = path.join('data', 'enrichment');

/** Politeness limits, from each provider's own published guidance. */
export const RATE = {
  pubchem: 220,   // PubChem asks for no more than 5 requests a second
  gbif: 120,      // GBIF publishes no hard limit; this is well inside courteous use
  ncbi: 350,      // NCBI E-utilities: 3 a second without an API key
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function loadCache(name) {
  const f = path.join(DIR, `${name}.json`);
  if (!fs.existsSync(f)) return { entries: {} };
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { console.error(`cache ${name} unreadable (${e.message}); starting fresh`); return { entries: {} }; }
}

export function saveCache(name, cache) {
  fs.mkdirSync(DIR, { recursive: true });
  // Sorted keys so a re-run produces a byte-identical file when nothing changed,
  // which keeps the diff honest and stops the date ledger churning.
  const sorted = {};
  for (const k of Object.keys(cache.entries).sort()) sorted[k] = cache.entries[k];
  fs.writeFileSync(path.join(DIR, `${name}.json`),
    JSON.stringify({ updatedAt: cache.updatedAt ?? null, count: Object.keys(sorted).length, entries: sorted }, null, 1));
}

/**
 * Resolve a list of keys through `lookup`, consulting the cache first.
 *
 * A cached miss counts as resolved: re-asking an API a question it has already
 * answered with "no" is how a polite script turns into an impolite one. Pass
 * `retryMisses` when a provider has genuinely gained coverage.
 */
export async function resolveAll(name, keys, lookup, {
  rateMs = 250, retryMisses = false, label = name, limit = Infinity,
} = {}) {
  const cache = loadCache(name);
  cache.entries ??= {};

  const todo = [...new Set(keys)].filter((k) => {
    const hit = cache.entries[k];
    if (!hit) return true;
    return retryMisses && hit.status === 'not-found';
  }).slice(0, limit);

  let done = 0;
  let found = 0;
  let missing = 0;
  let failed = 0;

  for (const key of todo) {
    if (done) await sleep(rateMs);
    let entry;
    try {
      entry = await lookup(key);
    } catch (e) {
      entry = { status: 'error', error: String(e.message ?? e).slice(0, 200) };
    }
    entry.checkedAt = new Date().toISOString().slice(0, 10);
    cache.entries[key] = entry;
    done += 1;
    if (entry.status === 'ok') found += 1;
    else if (entry.status === 'not-found') missing += 1;
    else failed += 1;

    if (done % 25 === 0 || done === todo.length) {
      process.stdout.write(`\r  ${label}: ${done}/${todo.length} resolved (${found} found, ${missing} not found, ${failed} error)   `);
    }
    // A transient failure should not poison the cache permanently.
    if (entry.status === 'error') delete cache.entries[key];
  }
  if (todo.length) process.stdout.write('\n');
  else console.log(`  ${label}: nothing new to resolve (${Object.keys(cache.entries).length} cached)`);

  cache.updatedAt = new Date().toISOString().slice(0, 10);
  return { cache, stats: { requested: keys.length, fetched: done, found, missing, failed } };
}

/** JSON GET that returns null rather than throwing, so a 404 is data not an exception. */
export async function getJson(url, opts = {}) {
  const res = await get(url, { retries: 1, timeoutMs: 20000, ...opts });
  if (!res.ok) return { ok: false, status: res.status, error: res.error };
  try { return { ok: true, data: JSON.parse(res.text) }; }
  catch { return { ok: false, status: res.status, error: 'unparseable json' }; }
}
