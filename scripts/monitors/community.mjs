import { get } from '../lib/fetch.mjs';
import { FEEDS, FEED_KEYWORDS } from './config.mjs';

export const id = 'community';
export const label = 'Community signals';

/**
 * Reads public RSS and files a digest issue. It does not authenticate to any platform
 * and it does not post anything, anywhere, ever.
 *
 * That is a deliberate limit, not a missing feature. Reddit's Data API terms bar
 * commercial use without a negotiated licence, and its Responsible Builder Policy
 * forbids mixing an automation account with a human one, which kills scheduled brand
 * presence outright. The real exposure is a domain-level ban, which would silently
 * poison every future mention of the site including genuine third-party
 * recommendations. Reading a public feed carries none of that.
 */

function parseFeed(xml) {
  const items = [];
  // Atom (Reddit) and RSS both appear across these sources.
  for (const m of xml.matchAll(/<entry[\s\S]*?<\/entry>|<item[\s\S]*?<\/item>/g)) {
    const block = m[0];
    const pick = (re) => (block.match(re)?.[1] ?? '').trim();
    const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/)
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    const link = pick(/<link[^>]*href="([^"]+)"/) || pick(/<link[^>]*>([\s\S]*?)<\/link>/);
    const idv = pick(/<id[^>]*>([\s\S]*?)<\/id>/) || pick(/<guid[^>]*>([\s\S]*?)<\/guid>/) || link;
    if (title && link) items.push({ id: idv || link, title, link });
  }
  return items;
}

const matches = (title) => {
  const t = title.toLowerCase();
  return FEED_KEYWORDS.filter((k) => t.includes(k));
};

export async function run(state) {
  const findings = [];
  state.feeds ??= {};
  const fresh = [];
  let scanned = 0;

  for (const feed of FEEDS) {
    const res = await get(feed.url, { retries: 1 });
    if (!res.ok) continue;

    const items = parseFeed(res.text);
    scanned += items.length;
    const seen = new Set(state.feeds[feed.id]?.seenIds ?? []);

    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const hits = matches(item.title);
      if (hits.length) fresh.push({ feed: feed.label, ...item, hits });
    }

    // Cap the remembered set so the state file cannot grow without bound.
    state.feeds[feed.id] = {
      checkedAt: new Date().toISOString(),
      seenIds: [...seen].slice(-400),
    };
  }

  if (fresh.length) {
    const day = new Date().toISOString().slice(0, 10);
    findings.push({
      fingerprint: `community:digest:${day}`,
      severity: 'low',
      title: `${fresh.length} new community post(s) matching the Nighantu's subjects`,
      body: [
        'Public RSS only. Nothing was posted anywhere, and nothing will be.',
        '',
        ...fresh.slice(0, 25).map((f) => `- **${f.feed}** [${f.title}](${f.link})  \n  matched: ${f.hits.join(', ')}`),
        fresh.length > 25 ? `\n_and ${fresh.length - 25} more_` : '',
        '',
        '---',
        '',
        'If you answer any of these, do it by hand from your own account, in your own words,',
        'following that subreddit\'s rules. Reddit enforces against inauthenticity and volume',
        'rather than against automation as such, but a domain-level ban would poison every',
        'future mention of the site, so the safe play is a real answer or none.',
      ].filter(Boolean).join('\n'),
    });
  }

  state.community = {
    checkedAt: new Date().toISOString(),
    feeds: FEEDS.length,
    scanned,
    matched: fresh.length,
  };

  return { findings, metrics: { scanned, matched: fresh.length } };
}
