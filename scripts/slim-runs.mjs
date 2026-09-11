#!/usr/bin/env node
/**
 * Reduce the raw verification-run output to what the site actually publishes.
 *
 * A run produces megabytes of agent prose: full record bodies, every verdict, every
 * quoted passage. That is worth keeping, but it does not belong in a public repository.
 * Three reasons, in order of weight:
 *
 *   1. The redaction rule applies to the whole repo, not just to content/. One auditor
 *      quoted a paper's methods section that names a manufacturer this project redacts
 *      by policy. The quote is innocuous in context and still should not be published
 *      by us.
 *   2. The verification pages need counts, rule violations and worked examples. They
 *      never need the record bodies, and the bodies are almost all of the bulk.
 *   3. Records that did not pass should not be sitting in a public repo in full, where
 *      they read as content rather than as rejected drafts.
 *
 * The full output stays in data/runs/raw/, which is gitignored, so nothing is lost
 * locally and the slim files keep the published numbers reproducible from a clean clone.
 *
 *   node scripts/slim-runs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { redact } from './lib.mjs';

const DIR = path.join('data', 'runs');
const RAW = path.join(DIR, 'raw');

const clip = (s, n = 900) => redact(String(s ?? '')).slice(0, n);
const clipAll = (a, n = 3, len = 600) => (a ?? []).slice(0, n).map((x) => clip(x, len));

/** Keep only the fields scripts/verification.mjs reads, plus enough to audit them. */
function slim(run) {
  const out = {
    run: run.run,
    date: run.date,
    scope: clip(run.scope, 600),
    outcome: run.outcome,
    reason: clip(run.reason, 1200),
    summary: run.summary,
    note: 'Slimmed for publication. Full agent output, including record bodies and complete '
      + 'verdicts, is retained locally in data/runs/raw/ and is not published.',
  };
  if (run.metaDisagreements) {
    out.metaDisagreements = run.metaDisagreements.map((m) => ({
      slug: m.slug, reasons: clipAll(m.reasons, 3, 700),
    }));
  }
  if (run.held) {
    out.held = run.held.map((h) => ({
      slug: h.slug,
      reasons: clipAll(h.reasons, 2, 600),
      ruleViolations: clipAll(h.ruleViolations, 2, 500),
    }));
  }
  if (run.accepted) {
    // Slugs and the auditor's reasoning only. The record itself is published on its page.
    out.accepted = run.accepted.map((a) => ({
      slug: a.slug ?? a.record?.slug,
      auditReasons: clipAll(a.audit?.reasons ?? a.auditReasons, 2, 600),
    }));
  }
  return out;
}

fs.mkdirSync(RAW, { recursive: true });
let done = 0;
for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith('.json')) continue;
  const p = path.join(DIR, f);
  const run = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (run.note && run.note.startsWith('Slimmed')) { console.log(`  already slim: ${f}`); continue; }

  fs.writeFileSync(path.join(RAW, f), JSON.stringify(run, null, 1));   // keep everything
  const s = slim(run);
  fs.writeFileSync(p, JSON.stringify(s, null, 1));
  const before = fs.statSync(path.join(RAW, f)).size;
  const after = fs.statSync(p).size;
  console.log(`  ${f}: ${(before / 1024).toFixed(0)}K -> ${(after / 1024).toFixed(0)}K`);
  done += 1;
}
console.log(`\nslimmed ${done} run file(s); full output kept in ${RAW}/`);
