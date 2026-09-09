#!/usr/bin/env node
/**
 * The detection sweep. Runs every monitor, dedupes findings against committed state,
 * files GitHub issues for genuinely new ones, and regenerates the dashboard.
 *
 * It detects. It never participates: nothing here posts to any community platform,
 * authenticates to one, or touches the Shopify store.
 *
 *   node scripts/monitor.mjs                 # full run
 *   node scripts/monitor.mjs --dry-run       # report only, no issues, no state written
 *   node scripts/monitor.mjs --only health   # run one monitor
 */
import { loadState, saveState, firstSighting, expireSeen } from './lib/state.mjs';
import { fileFindings } from './lib/issues.mjs';
import { renderDashboard } from './lib/dashboard.mjs';
import { SITE, BASE, SEEN_EXPIRY_DAYS } from './monitors/config.mjs';

import * as health from './monitors/health.mjs';
import * as products from './monitors/products.mjs';
import * as competitors from './monitors/competitors.mjs';
import * as freshness from './monitors/freshness.mjs';
import * as community from './monitors/community.mjs';

const MONITORS = [health, products, competitors, freshness, community];

const DRY = process.argv.includes('--dry-run');
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;

const state = loadState();
const selected = ONLY ? MONITORS.filter((m) => m.id === ONLY) : MONITORS;

if (ONLY && !selected.length) {
  console.error(`Unknown monitor "${ONLY}". Available: ${MONITORS.map((m) => m.id).join(', ')}`);
  process.exit(1);
}

console.log(`site ${SITE}${BASE}`);
console.log(`monitors: ${selected.map((m) => m.id).join(', ')}${DRY ? '  (dry run)' : ''}\n`);

const all = [];
let failed = 0;

for (const m of selected) {
  process.stdout.write(`${m.label.padEnd(28)} `);
  try {
    const { findings, metrics } = await m.run(state);
    all.push(...findings);
    const summary = Object.entries(metrics).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`${summary}  findings=${findings.length}`);
  } catch (e) {
    // One broken monitor must not abort the sweep, or a single dead host takes the
    // whole thing down and the state file never gets committed.
    failed += 1;
    console.log(`ERROR ${e.message}`);
  }
}

// Only surface findings not already reported. The issue filer checks open issues too,
// so a reset state file cannot cause a flood of duplicates.
const fresh = DRY ? all : all.filter((f) => firstSighting(state, f.fingerprint));
const suppressed = all.length - fresh.length;

console.log(`\n${all.length} finding(s), ${fresh.length} new, ${suppressed} already reported`);

const result = fileFindings(fresh, { dryRun: DRY });
if (!DRY) console.log(`issues: ${result.opened} opened, ${result.skipped} skipped`);
result.opened_urls.forEach((u) => console.log(`  ${u}`));

if (!DRY) {
  const expired = expireSeen(state, SEEN_EXPIRY_DAYS);
  if (expired) console.log(`expired ${expired} old fingerprint(s)`);
  const saved = saveState(state);
  const dash = renderDashboard(saved, { site: `${SITE}${BASE}` });
  console.log(`wrote ${dash}`);
}

// A monitoring run that could not complete should be visible in the Actions UI, but
// findings themselves are never a failure: they are the product.
process.exit(failed ? 1 : 0);
