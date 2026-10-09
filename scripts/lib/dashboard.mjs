import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join('data', 'DASHBOARD.md');

const fmtDate = (iso) => (iso ? iso.slice(0, 10) : 'never');
const tick = (ok) => (ok ? 'ok' : 'FAIL');

/**
 * Read the citation log BY HEADER NAME, not by position.
 *
 * This read `cited` from field 3 and the log gained an `intent` column at field 3, so it has been
 * reading the intent string and comparing it to 'yes' ever since. That is never true, so
 * data/DASHBOARD.md has reported a flat `0 | 67 | 0%` on every run while the log actually held 10
 * of 67 prompts cited and 24 of 201 asks. The dashboard's own footer, "a flat zero for the first
 * 8 to 12 weeks on a new domain is expected", made the false zero look like a finding rather than
 * a parsing bug, which is why it survived three months.
 *
 * scripts/citation-report.mjs:27-37 already parses by header name and records why: "The log gained
 * rate, hits and asks columns when repeated sampling came in, and a fixed index would have quietly
 * compared the wrong fields." That warning was written about this file's failure mode and this
 * file never got the fix.
 */
/**
 * EVERY citation log, not the one fixed filename, because rotation moved the data out of it.
 *
 * This read data/citation-log.csv and nothing else. When the panel was rebuilt, geo-audit rotated
 * the old series into data/citation-log-<date>.csv and left the fixed name holding a single
 * `# panel <hash>` comment and no rows. The length test then returned null and the dashboard has
 * reported "No runs logged" ever since, while data/citation-log-2026-10-05.csv held a full 49-row
 * run showing 0 of 41 reference-intent prompts cited and every citation landing on the Shopify
 * store instead of this site.
 *
 * That is the third distinct way this one function has reported a false zero: a positional parse
 * that read the wrong column, a quoted-matcher applied to an unquoted header, and now a filename
 * that rotation emptied. The pattern is that the failure always looks like a measurement, so the
 * fix is to read every log present and to label runs by PANEL as well as by date. A panel change
 * is a change of instrument, and showing two panels in one undifferentiated column is how a
 * rebuild gets read as a collapse.
 */
function citationLogs(dir = 'data') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^citation-log.*\.csv$/.test(f) && !/probe/.test(f))
    .map((f) => path.join(dir, f))
    .sort();
}

/**
 * EXPORTED, AND THE DIRECTORY IS AN ARGUMENT, so this can be tested.
 *
 * This function has reported a confident false zero four separate times: a positional parse that
 * read the question text where `cited` belonged, a quoted-field matcher applied to an unquoted
 * header, a hardcoded filename that log rotation emptied, and one header taken from the first file
 * and applied to files with a different column order. Each failure looked like a measurement
 * rather than a bug, and one survived three months because the dashboard's own footer explained
 * the zero away as normal for a new domain.
 *
 * Every other load-bearing parser in this project is tested. The one measuring whether the project
 * works was not, because it read a hardcoded path and was not exported, so there was nothing a
 * test could hold. Both of those are now arguments rather than assumptions.
 */
export function citationSummary(dir = 'data') {
  const files = citationLogs(dir);
  if (!files.length) return null;

  /*
   * The header is UNQUOTED and the data rows are quoted, so they need different parsers. Using the
   * quoted matcher on the header returns an empty array, every column index comes back -1, and the
   * whole log reads as unrecognised. Same split as scripts/citation-report.mjs, deliberately, so
   * there is one convention and not two.
   */
  const cells = (l) => [...l.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"'));

  /**
   * EACH FILE IS PARSED WITH ITS OWN HEADER. This is not a stylistic choice.
   *
   * The logs do not share a column order. data/citation-log-2026-09-18.csv has
   * `date,model,question,cited,...` and every later log has `date,model,question,intent,cited,...`,
   * because the panel gained an intent column. So `cited` is field 3 in the September log and
   * field 4 in the others. A single header taken from the first file and applied to rows from all
   * of them reads the question text as the cited flag on one file or the intent string on the
   * rest, and the answer is a confident zero either way.
   *
   * That is the same fault this function was already fixed for once, at the level of one file. The
   * first attempt at reading every log reintroduced it at the level of every file, and reported
   * 0 cited of 48 for a run that has 4 cited of 49. Hence per-file parsing and no shared index.
   */
  const byRun = new Map();
  let recognised = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8').trim();
    if (!text) continue;
    const lines = text.split('\n').filter(Boolean);
    const panel = /^#\s*panel\s+(\S+)/m.exec(text)?.[1] ?? 'unlabelled';

    /*
     * FIND the header line; do not assume it is the first. geo-audit.mjs writes a `# panel <hash>`
     * comment above it so a panel change rotates the log, and a reader that took line 0 would
     * parse that comment as the header and silently read every field as empty.
     */
    const headerLine = lines.find((l) => l.startsWith('date,'));
    if (!headerLine) continue;
    const header = headerLine.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
    const col = (name) => header.indexOf(name);
    const iDate = col('date');
    const iModel = col('model');
    const iCited = col('cited');
    const iHits = col('hits');
    const iAsks = col('asks');
    // A log whose header this does not recognise is skipped rather than read as zeros.
    if (iDate < 0 || iModel < 0 || iCited < 0) continue;
    recognised += 1;

    /*
     * Select the DATA rows rather than skipping a fixed number of lines. Every data row is fully
     * quoted, so starting with a quote is the test; `slice(1)` was right when the header was line 0
     * and became wrong the moment a `# panel` comment went above it.
     */
    for (const line of lines.filter((l) => l.startsWith('"'))) {
      const f = cells(line);
      const key = `${f[iDate]} ${f[iModel]} ${panel}`;
      const agg = byRun.get(key)
        ?? { date: f[iDate], model: f[iModel], panel, total: 0, cited: 0, hits: 0, asks: 0 };
      agg.total += 1;
      if (f[iCited] === 'yes') agg.cited += 1;
      // Asks are the honest denominator: each prompt is asked REPS times and a prompt cited once
      // in three is not the same result as one cited three times in three.
      if (iHits >= 0) agg.hits += Number(f[iHits]) || 0;
      if (iAsks >= 0) agg.asks += Number(f[iAsks]) || 0;
      byRun.set(key, agg);
    }
  }
  if (!recognised) return null;

  // Same exclusion as scripts/citation-report.mjs: a run with no successful ask is not a reading,
  // and one fetch failure should not appear in the table as a 0% run.
  return [...byRun.values()]
    .filter((r) => r.asks > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || String(a.model).localeCompare(String(b.model)));
}

export function renderDashboard(state, { site }) {
  const runs = citationSummary();
  const c = state.competitorSummary;

  const lines = [
    '# Nighantu status',
    '',
    '_Generated by `scripts/monitor.mjs`. Committed to the repo rather than published,',
    'so competitors named in the comparison table cannot read our own scoreboard._',
    '',
    `Last run: **${fmtDate(state.updatedAt)}**  ·  Site: ${site}`,
    '',
    '## Site health',
    '',
  ];

  if (state.health?.checkedAt) {
    const h = state.health;
    lines.push(
      `| Checked | Failing |`,
      `| --- | --- |`,
      `| ${h.total} | ${h.failing} |`,
      '',
    );
    if (h.failing) lines.push('**Failing:**', ...h.failingUrls.map((u) => `- ${u}`), '');
  } else {
    lines.push('_Not yet run._', '');
  }

  lines.push('## Outbound product links', '');
  if (state.products?.checkedAt) {
    lines.push(`${state.products.total} checked, **${state.products.broken} broken**.`, '');
    if (state.products.broken) lines.push(...state.products.brokenHandles.map((b) => `- ${b}`), '');
  } else {
    lines.push('_Not yet run._', '');
  }

  lines.push('## Search submission', '');
  const inx = state.indexnow ?? {};
  lines.push(
    `| Metric | Value |`,
    `| --- | --- |`,
    `| URLs tracked | ${Object.keys(inx.hashes ?? {}).length} |`,
    `| Last IndexNow submission | ${fmtDate(inx.lastSubmittedAt)} |`,
    `| URLs in that submission | ${inx.lastSubmittedCount ?? 0} |`,
    '',
  );
  if (state.search?.bing) {
    const b = state.search.bing;
    lines.push(
      '### Bing Webmaster',
      '',
      `| Metric | Value |`,
      `| --- | --- |`,
      `| Daily submission quota | ${b.dailyQuota ?? 'unknown'} |`,
      `| Quota remaining | ${b.remaining ?? 'unknown'} |`,
      `| Impressions (last period) | ${b.impressions ?? 'unknown'} |`,
      `| Clicks (last period) | ${b.clicks ?? 'unknown'} |`,
      `| Checked | ${fmtDate(b.checkedAt)} |`,
      '',
    );
  } else {
    lines.push('_Bing Webmaster not configured. Add `BING_API_KEY` to enable._', '');
  }

  lines.push('## Citation panel', '');
  if (runs?.length) {
    // Prompts cited AND asks landed. A prompt cited once in three asks is a weaker result than one
    // cited three times in three, and the prompt column alone cannot tell them apart.
    lines.push('| Date | Source | Panel | Prompts cited | Of | Asks landed | Of | Ask rate |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of runs.slice(0, 12)) {
      const askRate = r.asks ? `${((r.hits / r.asks) * 100).toFixed(0)}%` : '-';
      lines.push(`| ${r.date} | ${r.model} | \`${String(r.panel).slice(0, 8)}\` | ${r.cited} `
        + `| ${r.total} | ${r.hits || '-'} | ${r.asks || '-'} | ${askRate} |`);
    }
    /*
     * The panel column exists so a rebuild cannot be misread as a drop. Two rows with different
     * panel hashes are two different instruments and their numbers are not a trend.
     */
    const panels = new Set(runs.slice(0, 12).map((r) => r.panel));
    if (panels.size > 1) {
      lines.push('',
        `_${panels.size} different panels appear above. Rows with different panel hashes are `
        + 'different instruments; do not read across them as a trend._');
    }
    /*
     * The old footer read "a flat zero for the first 8 to 12 weeks on a new domain is expected,
     * not failure." It was removed because for three months the zero was a parsing bug, not a
     * measurement, and that sentence is exactly what stopped anyone looking. A reassurance
     * attached to a number nobody has verified is worse than no footer.
     */
    lines.push('',
      '_Every citation recorded so far has gone to the Shopify store, not to this site._',
      '');
  } else {
    lines.push('_No runs logged, or the log header was not recognised._', '');
  }

  lines.push('## Content freshness', '');
  if (state.freshness?.checkedAt) {
    lines.push(`${state.freshness.overdue} of ${state.freshness.total} pages overdue for review.`, '');
    if (state.freshness.oldest?.length) lines.push(...state.freshness.oldest.map((o) => `- ${o}`), '');
  } else {
    lines.push('_Not yet run._', '');
  }

  lines.push('## Competitor pages', '');
  if (c?.items?.length) {
    lines.push('| Competitor | HTTP | Figures tracked |', '| --- | --- | --- |');
    for (const it of c.items) lines.push(`| ${it.name} | ${tick(it.status === 200)} ${it.status} | ${it.signals} |`);
    lines.push('', `_Checked ${fmtDate(c.checkedAt)}. Feeds the comparison table's accuracy promise._`, '');
  } else {
    lines.push('_Not yet run._', '');
  }

  lines.push('## Indexation', '');
  if (state.indexation?.checkedAt) {
    const ix = state.indexation;
    const row = (name, v) => {
      const detail = v.swhid || v.url || v.crawl || v.note || '';
      return `| ${name} | ${v.status} | ${String(detail).slice(0, 64)} |`;
    };
    lines.push(
      '| Index | Status | Detail |', '| --- | --- | --- |',
      row('Common Crawl', ix.commonCrawl),
      row('Wayback Machine', ix.wayback),
      row('Software Heritage', ix.softwareHeritage),
      row('Google', ix.google),
      row('Bing', ix.bing),
      row('Brave', ix.brave),
      '',
      '_Google, Bing and Brave are marked unknown rather than guessed: checking membership',
      'needs an API key or scraping a results page against the engine\'s terms. Common Crawl,',
      'Wayback and Software Heritage all publish free, documented APIs._',
      '',
    );
  } else {
    lines.push('_Not yet run._', '');
  }

  lines.push('## Answerable threads', '');
  if (state.threadStats?.checkedAt) {
    const t = state.threadStats;
    lines.push(
      `| Metric | Value |`, `| --- | --- |`,
      `| Feeds queried | ${t.requests} |`,
      `| Rate-limited | ${t.blocked} |`,
      `| Posts seen | ${t.seen} |`,
      `| New since last run | ${t.fresh} |`,
      `| Met the bar | ${t.qualified} |`,
      `| Surfaced to you | ${t.surfaced} |`,
      `| Checked | ${fmtDate(t.checkedAt)} |`,
      '',
      '_A thread only qualifies if it names something the Nighantu has a page about._',
      '_Read-only. Nothing is posted to any platform._',
      '',
    );
  } else {
    lines.push('_Not yet run._', '');
  }

  lines.push('## Community signals', '');
  if (state.community?.checkedAt) {
    lines.push(
      `${state.community.scanned} items scanned across ${state.community.feeds} public feeds, `
      + `${state.community.matched} matched.`,
      '',
      '_Read-only. Nothing is posted to any platform._',
      '',
    );
  } else {
    lines.push('_Not yet run._', '');
  }

  const out = lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out);
  return OUT;
}
