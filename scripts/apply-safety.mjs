#!/usr/bin/env node
/**
 * Take the judge panel's output, validate it, and write the two files the site reads.
 *
 * The panel decides whether a record is TRUE. This script decides whether it is
 * WELL FORMED, and those are different questions. A record can pass four judges and
 * still cite a source id that does not exist, or carry a severity the renderer has no
 * case for. Both gates have to hold, so panel acceptance is necessary and not
 * sufficient: everything here re-runs through validateRecord with the page's own
 * subcategory, which is where heavy-metal enforcement actually bites.
 *
 * Writes:
 *   data/safety.json           records that passed both gates, keyed by slug
 *   data/safety-verdicts.json  the full ledger including rejects, which is what
 *                              /verification/ publishes. The rejects are the
 *                              interesting half and they are not thrown away.
 *
 *   node scripts/apply-safety.mjs <panel-output.json> [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './lib.mjs';
import { validateRecord, strongestClass } from './lib/safety.mjs';

const [, , inFile] = process.argv;
const DRY = process.argv.includes('--dry-run');

if (!inFile || !fs.existsSync(inFile)) {
  console.error('usage: node scripts/apply-safety.mjs <panel-output.json> [--dry-run]');
  process.exit(1);
}

const panel = JSON.parse(fs.readFileSync(inFile, 'utf8'));

/** Page context: the validator needs subcategory to know if heavy metals are required. */
function pageContext(slug) {
  const f = path.join('content', 'herb', `${slug}.md`);
  if (!fs.existsSync(f)) return null;
  const { data } = parseFrontmatter(fs.readFileSync(f, 'utf8'));
  return { title: data.title || slug, subcategory: data.subcategory || '', botanical: data.botanical || '' };
}

/**
 * A record may declare, in its own insufficientReason, that everything it carries is
 * class-level rather than about the specific preparation. When it says so explicitly
 * we mark its statements accordingly, because the schema needs the flag and the
 * record has already made the statement in prose.
 *
 * This is deliberately narrow. It fires only on an explicit declaration, it never
 * infers scope from the content of a claim, and a record that carries statements
 * without either a scope field or this declaration still fails validation.
 */
const DECLARES_CLASS_LEVEL = /\ball (?:of )?(?:the )?(?:evidence|material|data)\b[^.]*\bclass[- ]level\b|\beverything (?:below|here|that follows)\b[^.]*\bclass[- ]level\b/i;

function applyDeclaredScope(rec) {
  if (!rec.insufficientData) return rec;
  if (!DECLARES_CLASS_LEVEL.test(String(rec.insufficientReason ?? ''))) return rec;
  const mark = (n) => (n && !n.scope ? { ...n, scope: 'class-level' } : n);
  return {
    ...rec,
    contraindications: (rec.contraindications ?? []).map(mark),
    interactions: (rec.interactions ?? []).map(mark),
    adverseEffects: (rec.adverseEffects ?? []).map(mark),
    pregnancy: mark(rec.pregnancy),
    lactation: mark(rec.lactation),
    doseLimits: mark(rec.doseLimits),
    heavyMetals: mark(rec.heavyMetals),
    scopeMarkedFromDeclaration: true,
  };
}

const records = {};
const ledger = [];
let passed = 0;
let failedValidation = 0;
let unknownSlug = 0;

for (const entry of panel.accepted ?? []) {
  const rec = applyDeclaredScope(entry.record);
  const ctx = pageContext(rec.slug);
  if (!ctx) {
    unknownSlug += 1;
    ledger.push({ slug: rec.slug, outcome: 'rejected', stage: 'apply', reasons: ['no such page'] });
    continue;
  }
  const v = validateRecord(rec, ctx);
  if (!v.ok) {
    failedValidation += 1;
    console.log(`  reject ${rec.slug}: ${v.errors.join('; ')}`);
    ledger.push({ slug: rec.slug, outcome: 'rejected', stage: 'validation', reasons: v.errors });
    continue;
  }
  passed += 1;
  records[rec.slug] = { ...rec, title: ctx.title, sourceClass: strongestClass(rec) };
  ledger.push({
    slug: rec.slug,
    outcome: 'accepted',
    stage: 'published',
    warnings: v.warnings,
    // Keep only the shape of each verdict, not the judges' full prose. The
    // verification pages need "who passed it and why", not a transcript.
    verdicts: Object.fromEntries(Object.entries(entry.verdicts ?? {})
      .map(([lens, ver]) => [lens, ver ? { pass: ver.pass, reasons: (ver.reasons ?? []).slice(0, 3) } : null])),
  });
}

for (const r of panel.rejected ?? []) {
  ledger.push({
    slug: r.slug,
    outcome: 'rejected',
    stage: 'panel',
    fidelityPass: r.fidelityPass,
    otherPasses: r.otherPasses,
    reasons: Object.entries(r.verdicts ?? {})
      .filter(([, v]) => v && !v.pass)
      .flatMap(([lens, v]) => (v.reasons ?? []).slice(0, 2).map((x) => `${lens}: ${x}`)),
  });
}

const summary = {
  panelAccepted: (panel.accepted ?? []).length,
  panelRejected: (panel.rejected ?? []).length,
  publishedAfterValidation: passed,
  failedValidation,
  unknownSlug,
  metaSampled: panel.summary?.metaSampled ?? 0,
  metaAgreed: panel.summary?.metaAgreed ?? 0,
  metaDisagreements: panel.metaDisagreements ?? [],
};

for (const [k, v] of Object.entries(summary)) {
  if (Array.isArray(v)) console.log(`${k.padEnd(26)} ${v.length}`);
  else console.log(`${k.padEnd(26)} ${v}`);
}

if (DRY) { console.log('\nDry run: nothing written.'); process.exit(0); }

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(path.join('data', 'safety.json'),
  JSON.stringify({ updatedAt: panel.updatedAt ?? null, count: passed, records }, null, 1));
fs.writeFileSync(path.join('data', 'safety-verdicts.json'),
  JSON.stringify({ updatedAt: panel.updatedAt ?? null, summary, ledger }, null, 1));

// The build imports from src/data/, matching how citations.json is wired. data/ stays
// the durable ledger; src/data/ is the copy Astro compiles against.
fs.mkdirSync(path.join('src', 'data'), { recursive: true });
fs.writeFileSync(path.join('src', 'data', 'safety.json'),
  JSON.stringify({ updatedAt: panel.updatedAt ?? null, count: passed, records }, null, 1));

console.log('\nwrote data/safety.json, data/safety-verdicts.json and src/data/safety.json');
