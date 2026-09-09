import fs from 'node:fs';
import { FRESHNESS_DAYS } from './config.mjs';

export const id = 'freshness';
export const label = 'Content freshness';

/**
 * Flags pages overdue for review. Reports one aggregate finding with the ten oldest
 * named, never one issue per page: 500 issues is the same as no issues.
 */
export async function run(state) {
  const ledgerPath = 'src/data/page-dates.json';
  if (!fs.existsSync(ledgerPath)) {
    return { findings: [], metrics: { checked: 0, overdue: 0 } };
  }

  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  const cutoff = Date.now() - FRESHNESS_DAYS * 864e5;
  const entries = Object.entries(ledger).map(([key, v]) => ({ key, ...v }));
  const overdue = entries
    .filter((e) => Date.parse(`${e.modified}T00:00:00Z`) < cutoff)
    .sort((a, b) => a.modified.localeCompare(b.modified));

  const findings = [];
  if (overdue.length) {
    // Fingerprint on the bucket, not the exact count, so it does not re-fire daily
    // as the number creeps up by one.
    const bucket = Math.floor(overdue.length / 25) * 25;
    findings.push({
      fingerprint: `freshness:overdue:${bucket}`,
      severity: 'low',
      title: `${overdue.length} pages are over ${FRESHNESS_DAYS} days since last review`,
      body: [
        `${overdue.length} of ${entries.length} pages have not been revised in more than`,
        `${FRESHNESS_DAYS} days. That is not automatically a problem for a reference work,`,
        'but the ten oldest are worth a look, particularly any with a research section that',
        'may have been superseded.',
        '',
        '**Oldest ten:**',
        ...overdue.slice(0, 10).map((e) => `- \`${e.key}\` last modified ${e.modified}`),
        '',
        'The dates come from `src/data/page-dates.json`, which advances only when a page\'s',
        'content actually changes.',
      ].join('\n'),
    });
  }

  state.freshness = {
    checkedAt: new Date().toISOString(),
    total: entries.length,
    overdue: overdue.length,
    oldest: overdue.slice(0, 5).map((e) => `${e.key} (${e.modified})`),
  };

  return { findings, metrics: { checked: entries.length, overdue: overdue.length } };
}
