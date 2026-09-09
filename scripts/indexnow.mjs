#!/usr/bin/env node
/**
 * Push every URL in the built sitemap to IndexNow.
 *
 * IndexNow tells Bing, Yandex, Naver and Seznam that pages have changed, with no
 * account and no login. Bing matters more than its search share suggests because
 * it feeds ChatGPT's search results.
 *
 * The key is self-generated per the spec and hosted publicly at the host root,
 * so it is not a secret and does not belong in CI secrets.
 *
 *   node scripts/indexnow.mjs            # submit
 *   node scripts/indexnow.mjs --dry-run  # show what would be submitted
 */
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.INDEXNOW_KEY || 'bf9a6ad9a651b9775c941d4fd074a13a';
const SITE = (process.env.ATLAS_SITE || 'https://jairaj1234-dancer.github.io').replace(/\/$/, '');
const HOST = new URL(SITE).host;
const KEY_LOCATION = process.env.INDEXNOW_KEY_LOCATION || `${SITE}/${KEY}.txt`;
const DRY = process.argv.includes('--dry-run');

const sitemaps = fs
  .readdirSync('dist')
  .filter((f) => /^sitemap-\d+\.xml$/.test(f))
  .map((f) => path.join('dist', f));

if (!sitemaps.length) {
  console.error('No dist/sitemap-N.xml found. Run the build first.');
  process.exit(1);
}

const urls = [...new Set(
  sitemaps.flatMap((f) => [...fs.readFileSync(f, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])),
)];

console.log(`host        ${HOST}`);
console.log(`keyLocation ${KEY_LOCATION}`);
console.log(`urls        ${urls.length}`);

if (DRY) {
  urls.slice(0, 5).forEach((u) => console.log(`  ${u}`));
  if (urls.length > 5) console.log(`  ... and ${urls.length - 5} more`);
  process.exit(0);
}

// The key file must be live before submitting, or the endpoint rejects with
// SiteVerificationNotCompleted.
const probe = await fetch(KEY_LOCATION);
if (!probe.ok) {
  console.error(`Key file is not reachable at ${KEY_LOCATION} (HTTP ${probe.status}).`);
  process.exit(1);
}

const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls });

// api.indexnow.org fans out to the participating engines; www.bing.com is a
// direct fallback for when the aggregator is still verifying the key.
const ENDPOINTS = ['https://api.indexnow.org/IndexNow', 'https://www.bing.com/IndexNow'];

let anyOk = false;
for (const endpoint of ENDPOINTS) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body,
    });
    const text = await res.text();
    const ok = res.status === 200 || res.status === 202;
    anyOk ||= ok;
    console.log(`${ok ? 'ok  ' : 'fail'} ${endpoint} -> HTTP ${res.status} ${text.slice(0, 120)}`);
  } catch (e) {
    console.log(`fail ${endpoint} -> ${e.message}`);
  }
}

// A failed ping is not a reason to fail a deploy that otherwise succeeded.
if (!anyOk) console.error('\nNo endpoint accepted the submission. Not treating this as fatal.');
