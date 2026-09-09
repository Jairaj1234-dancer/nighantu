import { execFileSync } from 'node:child_process';

/**
 * Idempotent GitHub issue creation via the `gh` CLI.
 *
 * Every finding carries a fingerprint, which is embedded in the issue body as an
 * HTML comment. Before opening anything we search existing open issues for that
 * marker, so a monitor that runs daily against an unfixed problem does not produce
 * a daily issue. The state file suppresses repeats too; this is the second line of
 * defence, and it survives the state file being reset.
 */

const MARKER = (fp) => `<!-- nighantu-monitor:${fp} -->`;
const LABEL = 'monitor';

function gh(args, { allowFail = false } = {}) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    if (allowFail) return null;
    throw new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${e.stderr || e.message}`);
  }
}

export function ghAvailable() {
  return gh(['--version'], { allowFail: true }) !== null;
}

/** Make sure the label exists, so issues are filterable. Safe to call repeatedly. */
export function ensureLabel() {
  gh(['label', 'create', LABEL, '--description', 'Opened automatically by the monitors', '--color', '2d5a1e'],
    { allowFail: true });
}

function existingFingerprints() {
  const raw = gh(['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,body'], { allowFail: true });
  if (!raw) return new Map();
  const map = new Map();
  try {
    for (const issue of JSON.parse(raw)) {
      const m = String(issue.body ?? '').match(/<!-- nighantu-monitor:([^>]+?) -->/);
      if (m) map.set(m[1], issue.number);
    }
  } catch { /* a malformed listing is not worth failing a run over */ }
  return map;
}

const SEVERITY_PREFIX = { high: '🔴', medium: '🟠', low: '🔵' };

/**
 * Open issues for findings that do not already have one.
 * Returns { opened, skipped }.
 */
export function fileFindings(findings, { dryRun = false } = {}) {
  if (!findings.length) return { opened: 0, skipped: 0, opened_urls: [] };

  if (dryRun || !ghAvailable()) {
    for (const f of findings) {
      console.log(`  [would open] ${SEVERITY_PREFIX[f.severity] ?? ''} ${f.title}`);
    }
    return { opened: 0, skipped: findings.length, opened_urls: [] };
  }

  ensureLabel();
  const open = existingFingerprints();
  let opened = 0;
  let skipped = 0;
  const urls = [];

  for (const f of findings) {
    if (open.has(f.fingerprint)) {
      skipped += 1;
      continue;
    }
    const body = [
      f.body,
      '',
      '---',
      '',
      `Opened automatically by \`scripts/monitor.mjs\` (${f.severity} severity).`,
      'Close this when the underlying problem is fixed; it will reopen only if the problem recurs.',
      '',
      MARKER(f.fingerprint),
    ].join('\n');

    const url = gh(
      ['issue', 'create', '--title', `${SEVERITY_PREFIX[f.severity] ?? ''} ${f.title}`.trim(), '--body', body, '--label', LABEL],
      { allowFail: true },
    );
    if (url) { opened += 1; urls.push(url); } else { skipped += 1; }
  }

  return { opened, skipped, opened_urls: urls };
}
