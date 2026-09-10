#!/usr/bin/env node
/**
 * No-login distribution actions.
 *
 * Every route here works with no account, no API key and no OAuth. That constraint is
 * the point: it is what remains available when search-console-style verification is off
 * the table.
 *
 *   node scripts/distribute.mjs --dry-run
 *   node scripts/distribute.mjs --wayback      # archive key pages
 *   node scripts/distribute.mjs --swh          # request a Software Heritage save
 *   node scripts/distribute.mjs --all
 *
 * Deliberately NOT here, each checked rather than assumed:
 *   Zenodo, figshare, OSF, Dryad, Dataverse   every deposit path needs an account
 *   DataCite, Crossref                        paid membership, not a signup
 *   Wikidata                                  technically possible anonymously, but its
 *                                             self-promotion and notability policies both
 *                                             fail here and a deleted item is worse than none
 *   Kagi Small Web                            personal blogs only; we are ineligible
 */
import fs from 'node:fs';
import path from 'node:path';
import { get } from './lib/fetch.mjs';
import { loadState, saveState } from './lib/state.mjs';
import { SITE, BASE } from './monitors/config.mjs';

const DRY = process.argv.includes('--dry-run');
const ALL = process.argv.includes('--all');
const want = (flag) => ALL || process.argv.includes(flag);

const REPO = 'https://github.com/Jairaj1234-dancer/nighantu';

/**
 * The Wayback save endpoint is aggressively rate limited and returns 429 within seconds
 * of a burst, so this archives a curated set rather than all 784 URLs. Archiving the
 * pages that matter is worth more than a slow crawl that gets throttled halfway.
 */
const KEY_PAGES = [
  '/',
  '/about/',
  '/how-we-source/',
  '/editorial-standards/',
  '/reviewers/',
  '/cite/',
  '/research/',
  '/shirodhara/',
  '/shirodhara/choosing-equipment/',
  '/shirodhara/temperature-and-duration/',
  '/shirodhara/session-protocol/',
  '/shirodhara/cautions/',
  '/herb/',
  '/formulation/',
  '/device/',
  '/glossary/',
  '/herb/ashwagandha/',
  '/herb/shatavari/',
  '/herb/brahmi/',
  '/herb/haridra/',
  '/device/shirodhara-pot-apparatus/',
];

const PAUSE_MS = 12000;   // single-digit requests a minute
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = loadState();
state.distribute ??= {};

async function wayback() {
  console.log(`\nWayback Machine: ${KEY_PAGES.length} key pages, one every ${PAUSE_MS / 1000}s`);
  if (DRY) { KEY_PAGES.forEach((p) => console.log(`  would save ${SITE}${BASE}${p}`)); return; }

  const done = new Set(state.distribute.waybackSaved ?? []);
  let saved = 0;
  let throttled = 0;

  for (const [i, p] of KEY_PAGES.entries()) {
    const url = `${SITE}${BASE}${p}`;
    if (i) await sleep(PAUSE_MS);
    const res = await get(`https://web.archive.org/save/${url}`, { retries: 0, timeoutMs: 60000 });
    if (res.status === 429) {
      throttled += 1;
      console.log(`  throttled at ${p}; stopping rather than hammering`);
      break;
    }
    if (res.ok || res.status === 302) { done.add(p); saved += 1; console.log(`  ok ${p}`); }
    else console.log(`  ${res.status || 'err'} ${p}`);
  }

  state.distribute.waybackSaved = [...done];
  state.distribute.waybackAt = new Date().toISOString();
  console.log(`  saved ${saved}, throttled ${throttled}`);
}

async function softwareHeritage() {
  console.log('\nSoftware Heritage: requesting a save');
  if (DRY) { console.log(`  would POST save for ${REPO}`); return; }
  const res = await get(`https://archive.softwareheritage.org/api/1/origin/save/git/url/${REPO}/`,
    { method: 'POST', retries: 1 });
  try {
    const d = JSON.parse(res.text);
    console.log(`  ${d.save_request_status ?? '?'} / ${d.save_task_status ?? '?'}`);
    if (d.snapshot_swhid) {
      state.distribute.swhid = d.snapshot_swhid;
      console.log(`  swhid ${d.snapshot_swhid}`);
    }
  } catch {
    console.log(`  HTTP ${res.status}`);
  }
}

if (want('--wayback')) await wayback();
if (want('--swh')) await softwareHeritage();
if (!ALL && !process.argv.some((a) => a.startsWith('--w') || a.startsWith('--s'))) {
  console.log('Nothing selected. Use --wayback, --swh, --all, or --dry-run with one of them.');
}

if (!DRY) {
  saveState(state);
  console.log('\nstate updated');
}
