import fs from 'node:fs';
import path from 'node:path';

/**
 * Reworded research lines, applied during ingest and by scripts/fix-research-claims.mjs, so
 * re-ingesting from the vault never brings the original wording back.
 *
 * The vault's "Traditional Uses Validated by Modern Research" lists are plain bullets: a modern
 * indication and the word "validated", with no paper named. lib/claims.mjs only ever saw the bold
 * study-title bullets, so these went through untouched, under a heading that says research
 * supports them and beside a note saying untraceable claims were removed. Each one is reworded as
 * a traditional use plus what was reported, by study type, with no number the page cannot back.
 *
 * Lines are matched on their text as a reader sees it (links reduced to their text, case and
 * spacing ignored), because ingest and the later linking passes put links in different places.
 */
const FILE = path.join('data', 'research-rewrites.json');
export const SECTION = '## Which traditional uses are supported by research?';
export const UNIDENTIFIED_NOTE = '*These summaries come from the source notes, which do not name the studies behind them.*';
const OLD_NOTES = ['*These summaries come from the source notes. The studies behind them are not identified on this page.*'];

export const plainKey = (s) => String(s)
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/^\s*[-*]\s+/, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

let cache = null;
export function loadRewrites() {
  if (cache) return cache;
  cache = new Map();
  if (!fs.existsSync(FILE)) return cache;
  for (const [page, rows] of Object.entries(JSON.parse(fs.readFileSync(FILE, 'utf8')).pages ?? {})) {
    cache.set(page, new Map(rows.map((r) => [plainKey(r.from), r.to])));
  }
  return cache;
}

/**
 * Apply the rewrites for `page` ("herb/ela") to a markdown body. Returns { text, changed }.
 * A section left holding unidentified summaries gets one line saying so.
 */
export function applyRewrites(page, text) {
  const rows = loadRewrites().get(page);
  if (!rows) return { text, changed: 0 };
  let changed = 0;
  let section = null;
  let needsNote = false;
  const out = [];
  for (const line of text.split('\n')) {
    if (/^#{2,4} /.test(line)) section = line.trim();
    const to = rows.get(plainKey(line));
    if (to != null && to !== line) {
      const bullet = /^\s*[-*]\s/.exec(line);
      out.push(bullet && !/^\s*[-*]\s/.test(to) ? `${bullet[0]}${to}` : to);
      changed += 1;
    } else out.push(line);
    if (section === SECTION && /^\s*[-*]\s/.test(line) && !/pubmed|doi\.org|PMID/i.test(line)) needsNote = true;
  }
  let result = out.join('\n');
  for (const old of OLD_NOTES) result = result.split(old).join(UNIDENTIFIED_NOTE);
  if (needsNote && !result.includes(UNIDENTIFIED_NOTE)) {
    result = result.replace(`${SECTION}\n\n`, `${SECTION}\n\n${UNIDENTIFIED_NOTE}\n\n`);
  }
  return { text: result, changed };
}
