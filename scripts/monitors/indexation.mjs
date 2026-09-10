import { get } from '../lib/fetch.mjs';
import { SITE, BASE, ORIGIN } from './config.mjs';

export const id = 'indexation';
export const label = 'Indexation';

/**
 * Answers "has anything actually crawled us yet" with numbers instead of guesses.
 *
 * Only probes that are public, documented and need no account are used here. Checking
 * membership of Google, Bing or Brave would mean either an API key or scraping a results
 * page against the engine's terms, so those are reported as "needs an account" rather
 * than faked. An honest unknown is more useful than a scraped number that gets us
 * blocked.
 *
 * What can be checked:
 *   Common Crawl  public CDX index; tells us whether CCBot has ever fetched the site,
 *                 which is a genuine third-party crawl signal and feeds AI training sets
 *   Wayback       public availability API; whether a snapshot exists
 *   Software      public API; whether the repository is archived and its SWHID
 *     Heritage
 */

const REPO = 'https://github.com/Jairaj1234-dancer/nighantu';

async function commonCrawl(host) {
  const info = await get('https://index.commoncrawl.org/collinfo.json', { retries: 1 });
  if (!info.ok) return { status: 'unknown', note: 'collinfo unavailable' };
  let crawls;
  try { crawls = JSON.parse(info.text); } catch { return { status: 'unknown', note: 'bad collinfo' }; }

  // Check the three most recent crawls; CCBot runs monthly-ish and a new site will
  // legitimately be absent for a while.
  for (const c of crawls.slice(0, 3)) {
    const res = await get(`${c['cdx-api']}?url=${encodeURIComponent(`${host}/*`)}&output=json&limit=5`,
      { retries: 1 });
    if (res.ok && res.text.trim() && !res.text.includes('No Captures')) {
      const n = res.text.trim().split('\n').length;
      return { status: 'present', crawl: c.id, captures: n };
    }
  }
  return { status: 'absent', checked: crawls.slice(0, 3).map((c) => c.id) };
}

async function wayback(url) {
  const res = await get(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
    { retries: 1 });
  if (res.status === 429) return { status: 'unknown', note: 'rate limited' };
  if (!res.ok) return { status: 'unknown', note: `HTTP ${res.status}` };
  try {
    const snap = JSON.parse(res.text)?.archived_snapshots?.closest;
    return snap?.available
      ? { status: 'present', timestamp: snap.timestamp, url: snap.url }
      : { status: 'absent' };
  } catch { return { status: 'unknown', note: 'unparseable' }; }
}

async function softwareHeritage(repo) {
  const res = await get(
    `https://archive.softwareheritage.org/api/1/origin/save/git/url/${repo}/`, { retries: 1 });
  if (!res.ok) return { status: res.status === 404 ? 'absent' : 'unknown', note: `HTTP ${res.status}` };
  try {
    const d = JSON.parse(res.text);
    const last = Array.isArray(d) ? d[d.length - 1] : d;
    return {
      status: last?.snapshot_swhid ? 'present' : 'pending',
      swhid: last?.snapshot_swhid ?? null,
      taskStatus: last?.save_task_status ?? null,
    };
  } catch { return { status: 'unknown', note: 'unparseable' }; }
}

export async function run(state) {
  const host = new URL(SITE).host;
  const home = `${SITE}${BASE}/`;

  const [cc, wb, swh] = [
    await commonCrawl(host),
    await wayback(home),
    await softwareHeritage(REPO),
  ];

  const previous = state.indexation ?? {};
  const findings = [];

  // Report the transition, not the state: a daily "still absent" issue trains you to
  // ignore the label.
  const announce = (key, now, label_, detail) => {
    if (previous[key]?.status !== 'present' && now.status === 'present') {
      findings.push({
        fingerprint: `indexation:${key}:present`,
        severity: 'low',
        title: `${label_} now has the site`,
        body: detail,
      });
    }
  };

  announce('commonCrawl', cc, 'Common Crawl',
    [`CCBot has crawled the site: ${cc.captures ?? '?'} capture(s) in ${cc.crawl}.`,
      '',
      'This is the first genuine third-party crawl signal, and Common Crawl feeds a lot of',
      'AI training and research corpora downstream.'].join('\n'));

  announce('wayback', wb, 'The Wayback Machine',
    `A snapshot exists: ${wb.url ?? ''}`);

  state.indexation = {
    checkedAt: new Date().toISOString(),
    commonCrawl: cc,
    wayback: wb,
    softwareHeritage: swh,
    // Stated rather than silently omitted, so the dashboard cannot imply we know.
    google: { status: 'unknown', note: 'needs Search Console; no public probe exists' },
    bing: { status: 'unknown', note: 'needs Bing Webmaster; IndexNow submission accepted but membership unverifiable' },
    brave: { status: 'unknown', note: 'no webmaster tool and no submission route exists' },
  };

  return {
    findings,
    metrics: {
      commonCrawl: cc.status,
      wayback: wb.status,
      swh: swh.status,
    },
  };
}
