#!/usr/bin/env node
/**
 * Push CHANGED URLs to IndexNow (Bing, Yandex, Naver, Seznam). No account needed.
 *
 * Change detection is not an optimisation, it is the contract. IndexNow's own FAQ
 * says to avoid resubmitting unchanged URLs, to leave at least five minutes between
 * updates, and that unnecessary submissions waste crawl quota. The penalty is 429
 * throttling and host-level deprioritisation. Re-POSTing the whole sitemap on every
 * deploy is exactly the pattern that earns it.
 *
 * So: hash each built page, compare against data/monitor-state.json, submit only what
 * actually changed. The first run after a rebuild-from-scratch will look like a large
 * batch; steady state is a handful of URLs or none at all.
 *
 *   node scripts/indexnow.mjs              # submit changed URLs
 *   node scripts/indexnow.mjs --dry-run    # report what would go, write nothing
 *   node scripts/indexnow.mjs --all        # ignore state and submit everything
 *   node scripts/indexnow.mjs --baseline   # record hashes WITHOUT submitting
 *
 * --baseline is for adopting a site whose URLs were already submitted by hand. It
 * establishes the comparison point so the next real run sends only genuine changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadState, saveState, hash } from './lib/state.mjs';

const KEY = process.env.INDEXNOW_KEY || 'bf9a6ad9a651b9775c941d4fd074a13a';
const SITE = (process.env.ATLAS_SITE || 'https://jairaj1234-dancer.github.io').replace(/\/$/, '');
const HOST = new URL(SITE).host;
const KEY_LOCATION = process.env.INDEXNOW_KEY_LOCATION || `${SITE}/${KEY}.txt`;
const DRY = process.argv.includes('--dry-run');
const ALL = process.argv.includes('--all');
const BASELINE = process.argv.includes('--baseline');

// IndexNow caps a single POST at 10,000 URLs.
const MAX_BATCH = 10000;

const sitemaps = fs.existsSync('dist')
  ? fs.readdirSync('dist').filter((f) => /^sitemap-\d+\.xml$/.test(f)).map((f) => path.join('dist', f))
  : [];

if (!sitemaps.length) {
  console.error('No dist/sitemap-N.xml found. Run the build first.');
  process.exit(1);
}

const urls = [...new Set(
  sitemaps.flatMap((f) => [...fs.readFileSync(f, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])),
)];

/** Map a public URL back to the file that produced it, so we can hash its content. */
function localFileFor(url) {
  const base = (process.env.ATLAS_BASE ?? '/nighantu').replace(/\/$/, '');
  let p = new URL(url).pathname;
  if (base && p.startsWith(base)) p = p.slice(base.length);
  const candidates = [
    path.join('dist', p, 'index.html'),
    path.join('dist', p),
    path.join('dist', `${p.replace(/\/$/, '')}.html`),
  ];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

const state = loadState();
const previous = state.indexnow.hashes ?? {};
const current = {};
const changed = [];

for (const url of urls) {
  const file = localFileFor(url);
  if (!file) continue;
  const h = hash(fs.readFileSync(file, 'utf8'));
  current[url] = h;
  if (ALL || previous[url] !== h) changed.push(url);
}

const missing = urls.length - Object.keys(current).length;
console.log(`host        ${HOST}`);
console.log(`keyLocation ${KEY_LOCATION}`);
console.log(`urls        ${urls.length} in sitemap${missing ? `, ${missing} with no local file` : ''}`);
console.log(`changed     ${changed.length}${ALL ? ' (--all: change detection bypassed)' : ''}`);

if (DRY) {
  changed.slice(0, 10).forEach((u) => console.log(`  ${u}`));
  if (changed.length > 10) console.log(`  ... and ${changed.length - 10} more`);
  process.exit(0);
}

if (BASELINE) {
  state.indexnow.hashes = current;
  state.indexnow.lastSubmittedAt = state.indexnow.lastSubmittedAt ?? new Date().toISOString();
  saveState(state);
  console.log(`baseline recorded for ${Object.keys(current).length} URLs; nothing submitted`);
  process.exit(0);
}

if (!changed.length) {
  // Still record hashes: a first run on an existing site establishes the baseline
  // without submitting, which is correct rather than a missed opportunity.
  state.indexnow.hashes = current;
  saveState(state);
  console.log('nothing changed, nothing submitted');
  process.exit(0);
}

const probe = await fetch(KEY_LOCATION).catch(() => null);
if (!probe?.ok) {
  console.error(`Key file unreachable at ${KEY_LOCATION} (${probe ? `HTTP ${probe.status}` : 'network error'}).`);
  process.exit(1);
}

const ENDPOINTS = ['https://api.indexnow.org/IndexNow', 'https://www.bing.com/IndexNow'];
let anyOk = false;

for (let i = 0; i < changed.length; i += MAX_BATCH) {
  const batch = changed.slice(i, i + MAX_BATCH);
  const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: batch });

  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body,
      });
      const text = (await res.text()).slice(0, 120);
      const ok = res.status === 200 || res.status === 202;
      anyOk ||= ok;
      console.log(`${ok ? 'ok  ' : 'fail'} ${endpoint} -> HTTP ${res.status} ${text}`);
      if (res.status === 429) {
        const retry = res.headers.get('retry-after');
        console.error(`  throttled${retry ? `, retry-after ${retry}s` : ''}. Not retrying in this run.`);
      }
    } catch (e) {
      console.log(`fail ${endpoint} -> ${e.message}`);
    }
  }
}

// Only advance the baseline on success, so a failed submission is retried next run
// rather than silently forgotten.
if (anyOk) {
  state.indexnow.hashes = current;
  state.indexnow.lastSubmittedAt = new Date().toISOString();
  state.indexnow.lastSubmittedCount = changed.length;
  saveState(state);
  console.log(`\nsubmitted ${changed.length} changed URL(s); baseline updated`);
} else {
  console.error('\nNo endpoint accepted the submission. Baseline NOT advanced; will retry next run.');
}
