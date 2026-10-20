#!/usr/bin/env node
/**
 * The research-section notes in content/ reworded to match lib/claims.mjs shortfallNote and
 * lib/rewrites.mjs UNIDENTIFIED_NOTE: what the reader is looking at, not how the page was edited.
 *
 *   node scripts/fix-shortfall-notes.mjs            report what would change
 *   node scripts/fix-shortfall-notes.mjs --write    apply it
 */
import fs from 'node:fs';
import path from 'node:path';
import { walk } from './lib.mjs';
import { UNIDENTIFIED_NOTE } from './lib/rewrites.mjs';

const WRITE = process.argv.includes('--write');
const OLD = /\*\d+ further claims? previously listed here could not be traced to a published paper and (?:has|have) been removed\. ([^*]+)\*/;
const OLD_UNIDENTIFIED = '*These summaries come from the source notes. The studies behind them are not identified on this page.*';
let n = 0;
for (const rel of walk('content').filter((f) => f.endsWith('.md'))) {
  const f = path.join('content', rel);
  const before = fs.readFileSync(f, 'utf8');
  // Section by section, so the note can say whether anything traced is listed above it.
  const parts = before.split(/(?=^## )/m).map((sec) => {
    const m = OLD.exec(sec);
    if (!m) return sec;
    const rest = sec.replace(/^## .*$/m, '').replace(m[0], '').replace(/^#+.*$/gm, '');
    const remaining = /[A-Za-z]/.test(rest);
    const note = remaining
      ? `*Only studies that could be traced to a published paper are listed here. ${m[1].trim()}*`
      : `*No study for this section could be traced to a published paper. ${m[1].trim()}*`;
    return sec.replace(m[0], note);
  });
  const after = parts.join('').split(OLD_UNIDENTIFIED).join(UNIDENTIFIED_NOTE);
  if (after === before) continue;
  n += 1;
  if (WRITE) fs.writeFileSync(f, after);
}
console.log(`${WRITE ? 'fixed' : 'would fix'} ${n} file(s)`);
