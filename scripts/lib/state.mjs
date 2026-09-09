/**
 * Durable state for the monitors, committed to the repo.
 *
 * Two reasons it lives in git rather than in a cache:
 *   1. GitHub Actions cron is best-effort. Runs are delayed and sometimes dropped,
 *      so nothing may reason about "time since last run". State is absolute.
 *   2. Scheduled workflows in a public repo are auto-disabled after 60 days with no
 *      repository activity, and only new commits reliably reset that timer. A job
 *      that commits its own state keeps itself alive.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const STATE_PATH = path.join('data', 'monitor-state.json');

const EMPTY = {
  version: 1,
  updatedAt: null,
  indexnow: { hashes: {}, lastSubmittedAt: null, lastSubmittedCount: 0 },
  competitors: {},
  seen: {},
  health: {},
  search: {},
};

export function loadState() {
  if (!fs.existsSync(STATE_PATH)) return structuredClone(EMPTY);
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return { ...structuredClone(EMPTY), ...raw };
  } catch (e) {
    console.error(`state file unreadable (${e.message}); starting fresh`);
    return structuredClone(EMPTY);
  }
}

export function saveState(state, now = new Date().toISOString()) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  const out = { ...state, updatedAt: now };
  // Stable key order keeps the committed diff readable and avoids noise commits.
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(out, sortKeys, 2)}\n`);
  return out;
}

function sortKeys(_key, value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  }
  return value;
}

export const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

/**
 * Record that a finding was seen. Returns true the first time only, so callers can
 * open exactly one issue per distinct problem however often the monitor runs.
 */
export function firstSighting(state, fingerprint, now = new Date().toISOString()) {
  if (state.seen[fingerprint]) {
    state.seen[fingerprint].lastSeen = now;
    state.seen[fingerprint].count += 1;
    return false;
  }
  state.seen[fingerprint] = { firstSeen: now, lastSeen: now, count: 1 };
  return true;
}

/** Forget fingerprints not seen for `days`, so a resolved problem can alert again. */
export function expireSeen(state, days = 30, now = Date.now()) {
  const cutoff = now - days * 864e5;
  let dropped = 0;
  for (const [k, v] of Object.entries(state.seen)) {
    if (Date.parse(v.lastSeen) < cutoff) { delete state.seen[k]; dropped += 1; }
  }
  return dropped;
}
