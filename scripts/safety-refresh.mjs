#!/usr/bin/env node
/**
 * Re-check every published safety record against the sources it cites.
 *
 * Safety sources move. LiverTox adds and revises entries, the FDA issues and
 * withdraws warnings, WHO reorganises IRIS, and PMC articles get retracted. A record
 * that was accurate when four judges passed it can become wrong without anyone
 * touching this repository, and nothing else in the pipeline would notice: the audit
 * checks that a record is well formed, not that the world still agrees with it.
 *
 * This does not re-judge the claims; that is the panel's job and it needs agents.
 * It answers the cheaper question that catches most decay: does every cited source
 * still exist, still resolve to the same place, and still contain the text we quoted?
 *
 *   node scripts/safety-refresh.mjs --dry-run    # report, open no issues
 *   node scripts/safety-refresh.mjs              # report and file findings
 */
import fs from 'node:fs';
import path from 'node:path';
import { get, visibleText } from './lib/fetch.mjs';
import { loadState, saveState, hash } from './lib/state.mjs';
import { fileFindings } from './lib/issues.mjs';
import { resolveSource } from './lib/sources.mjs';

const DRY = process.argv.includes('--dry-run');
const SAFETY = path.join('data', 'safety.json');
const PAUSE_MS = 1500;          // these are public research hosts; do not hammer them
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(SAFETY)) {
  console.log('no data/safety.json; nothing published to re-check');
  process.exit(0);
}

const { records } = JSON.parse(fs.readFileSync(SAFETY, 'utf8'));
const state = loadState();
state.safetyRefresh ??= {};
const seen = state.safetyRefresh.sources ?? {};

const findings = [];
let checked = 0;
let changed = 0;
let dead = 0;

for (const [slug, rec] of Object.entries(records)) {
  for (const src of rec.sources ?? []) {
    if (!src.url) continue;
    checked += 1;
    if (checked > 1) await sleep(PAUSE_MS);

    const res = await get(src.url, { retries: 1, timeoutMs: 25000 });

    // A source that has gone means the claim resting on it is now uncited.
    if (!res.ok) {
      dead += 1;
      findings.push({
        id: `safety-source-dead:${slug}:${src.id}`,
        severity: 'high',
        title: `Safety source unreachable: ${rec.title ?? slug}`,
        body: `${src.title || src.id} returned ${res.status || res.error} at ${src.url}\n\n`
          + `This source backs a published safety statement on /herb/${slug}/. `
          + `Until it resolves, that statement is uncited. Re-check the URL, and if the `
          + `source has genuinely moved or been withdrawn, the record needs re-judging `
          + `rather than a URL swap.`,
      });
      console.log(`  DEAD  ${slug} / ${src.id} -> ${res.status || res.error}`);
      continue;
    }

    // The allowlist is re-checked on the RESOLVED url, because a redirect can
    // silently carry a citation off an approved host.
    const resolved = res.url || src.url;
    if (!resolveSource(resolved)) {
      findings.push({
        id: `safety-source-offlist:${slug}:${src.id}`,
        severity: 'high',
        title: `Safety source now redirects off the allowlist: ${rec.title ?? slug}`,
        body: `${src.url}\n  now resolves to ${resolved}, which is not an allowlisted host.`,
      });
      console.log(`  OFFLIST ${slug} / ${src.id} -> ${resolved}`);
      continue;
    }

    // Content drift. Hashing the whole page would fire on every nav tweak, so this
    // hashes only the visible text, and reports rather than fails: a revised LiverTox
    // entry is exactly the case a human should look at.
    const key = `${slug}:${src.id}`;
    const h = hash(visibleText(res.text).slice(0, 20000));
    const before = seen[key];
    seen[key] = { hash: h, checkedAt: new Date().toISOString(), url: resolved };

    if (before && before.hash !== h) {
      changed += 1;
      findings.push({
        id: `safety-source-changed:${key}:${h}`,
        severity: 'medium',
        title: `Safety source changed: ${rec.title ?? slug}`,
        body: `${src.title || src.id}\n  ${resolved}\n\n`
          + `The visible text of this source has changed since it was last checked. `
          + `It backs a published safety statement on /herb/${slug}/. Read the source and `
          + `confirm the statement still reflects it; if the source has been revised in `
          + `substance, the record needs re-judging.`,
      });
      console.log(`  CHANGED ${slug} / ${src.id}`);
    } else {
      console.log(`  ok      ${slug} / ${src.id}`);
    }
  }
}

state.safetyRefresh.sources = seen;
state.safetyRefresh.lastRunAt = new Date().toISOString();

console.log(`\nrecords ${Object.keys(records).length}  sources ${checked}  changed ${changed}  dead ${dead}`);

if (findings.length) {
  console.log(`${findings.length} finding(s)`);
  fileFindings(findings, { dryRun: DRY });
} else {
  console.log('no findings');
}

if (!DRY) { saveState(state); console.log('state updated'); }
else console.log('dry run: state not written');
