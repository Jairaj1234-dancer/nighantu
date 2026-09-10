import fs from 'node:fs';
import path from 'node:path';
import { get } from '../lib/fetch.mjs';
import { walk, parseFrontmatter } from '../lib.mjs';
import { FEED_QUERIES, FEED_SUBS, THREAD_TARGET } from './config.mjs';

export const id = 'threads';
export const label = 'Answerable threads';

/**
 * Finds public discussion threads the Nighantu can genuinely answer, ranks them, and
 * files the best ones as a daily digest with a suggested page and a drafted opening.
 *
 * It reads public RSS and writes to our own repository. It never authenticates to any
 * platform and never posts. That line is not squeamishness: Reddit's Data API terms bar
 * commercial use without a negotiated licence, its Responsible Builder Policy forbids
 * mixing an automation account with a human one, and the real exposure is a silent
 * domain-level ban that would poison every future mention of the site, including
 * genuine third-party recommendations.
 *
 * Reddit rate-limits these feeds hard (HTTP 429 within seconds of a burst), so requests
 * are few and widely spaced, once a day.
 */

const PAUSE_MS = 6000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UA_NOTE = 'Reddit blocks empty or generic user agents; lib/fetch.mjs sends a descriptive one.';

function parseAtom(xml) {
  const items = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const b = m[1];
    const pick = (re) => (b.match(re)?.[1] ?? '').trim();
    const decode = (s) => s
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    const title = decode(pick(/<title[^>]*>([\s\S]*?)<\/title>/));
    const link = pick(/<link[^>]*href="([^"]+)"/);
    const id = pick(/<id[^>]*>([\s\S]*?)<\/id>/) || link;
    const updated = pick(/<updated[^>]*>([\s\S]*?)<\/updated>/);
    const sub = pick(/<category[^>]*term="([^"]+)"/);
    const content = decode(pick(/<content[^>]*>([\s\S]*?)<\/content>/)).replace(/<[^>]+>/g, ' ');
    if (title && link) items.push({ id, title, link, updated, sub, snippet: content.slice(0, 400) });
  }
  return items;
}

/** Load the published pages so a thread can be matched to something that answers it. */
function loadPages() {
  const pages = [];
  // Read the content files rather than the manifest: the manifest has no aliases or
  // binomials, and those are what make a match specific enough to act on.
  if (fs.existsSync('content')) {
    for (const rel of walk('content')) {
      const kind = rel.split(path.sep)[0];
      const slug = path.basename(rel, '.md');
      const { data } = parseFrontmatter(fs.readFileSync(path.join('content', rel), 'utf8'));
      pages.push({
        title: data.title ?? slug,
        aliases: Array.isArray(data.aliases) ? data.aliases : [],
        botanical: data.botanical ?? '',
        url: `/nighantu/${kind === 'reference' ? 'reference' : kind}/${slug}/`,
        kind,
      });
    }
  }
  if (fs.existsSync('guides')) {
    for (const f of fs.readdirSync('guides').filter((x) => x.endsWith('.md'))) {
      const slug = path.basename(f, '.md');
      const raw = fs.readFileSync(path.join('guides', f), 'utf8');
      const title = /^title:\s*"(.*)"$/m.exec(raw)?.[1] ?? slug;
      pages.push({
        title,
        url: slug === 'shirodhara' ? '/nighantu/shirodhara/' : `/nighantu/shirodhara/${slug}/`,
        kind: 'guide',
      });
    }
  }
  return pages;
}

const norm = (s) => ` ${String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;

/** Words too generic to identify a page even though they appear in page titles. */
const GENERIC = new Set(['herb', 'herbs', 'oil', 'oils', 'seed', 'seeds', 'root', 'leaf', 'bark',
  'powder', 'juice', 'water', 'milk', 'salt', 'sugar', 'honey', 'ghee', 'acid', 'extract',
  'family', 'wild', 'black', 'white', 'red', 'green', 'blue', 'yellow', 'indian', 'common',
  'great', 'small', 'sweet', 'bitter', 'gourd', 'morning', 'glory', 'tree', 'grass', 'flower']);

/**
 * Build a lookup of distinctive terms to pages.
 *
 * The bar is deliberately entity presence, not word overlap. An earlier version scored
 * by shared words and matched "Has anyone tried pine pollen?" to Bitter Gourd, which
 * would have had us posting an irrelevant link into someone's thread. That is exactly
 * the behaviour platforms ban for, so a thread now only qualifies if it actually names
 * something we have a page about.
 */
function buildIndex(pages) {
  const index = new Map();
  const add = (term, page, weight) => {
    const t = String(term).toLowerCase().trim();
    if (t.length < 5) return;
    const words = t.split(/\s+/);
    if (words.length === 1 && GENERIC.has(t)) return;
    if (words.every((w) => GENERIC.has(w))) return;
    const existing = index.get(t);
    if (!existing || existing.weight < weight) index.set(t, { page, weight });
  };

  for (const p of pages) {
    add(p.title, p, p.kind === 'guide' ? 3 : 2);
    for (const a of p.aliases ?? []) add(a, p, 2);
    if (p.botanical) {
      const bin = p.botanical.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
      if (bin.length >= 2) add(`${bin[0]} ${bin[1]}`, p, 4);   // a binomial is unambiguous
    }
  }
  return index;
}

/** Every indexed entity named in the thread, best first. */
function entitiesIn(thread, index) {
  const hay = norm(`${thread.title} ${thread.snippet}`);
  const hits = [];
  for (const [term, { page, weight }] of index) {
    if (hay.includes(` ${term} `)) hits.push({ term, page, weight: weight + term.split(' ').length });
  }
  return hits.sort((a, b) => b.weight - a.weight);
}

/** A thread is worth answering if it asks something we can actually answer. */
function score(thread, hits) {
  if (!hits.length) return 0;                       // names nothing we cover: skip
  let s = hits[0].weight;
  const t = thread.title.toLowerCase();
  if (/\?|^how |^what |^is |^can |^does |^should |^why |^which |advice|help|recommend/.test(t)) s += 3;
  if (/dosage|dose|how much|how long|temperature|safe|side effect|interaction|difference between/.test(t)) s += 2;
  if (/\bbuy\b|\bsale\b|discount|my (shop|store|brand)|promo/.test(t)) s -= 6;
  if (thread.updated) {
    const days = (Date.now() - Date.parse(thread.updated)) / 864e5;
    if (days < 2) s += 2; else if (days < 7) s += 1;
  }
  return s;
}

export async function run(state) {
  const pages = loadPages();
  state.threads ??= { seenIds: [] };
  const seen = new Set(state.threads.seenIds ?? []);
  const found = new Map();
  let requests = 0;
  let blocked = 0;

  const fetchFeed = async (url) => {
    if (requests) await sleep(PAUSE_MS);
    requests += 1;
    const res = await get(url, { retries: 1, timeoutMs: 25000 });
    if (res.status === 429) { blocked += 1; return []; }
    return res.ok ? parseAtom(res.text) : [];
  };

  // Site-wide search beats per-subreddit /new: it catches the question wherever it was
  // asked, which is usually not in the obvious subreddit.
  for (const q of FEED_QUERIES) {
    const url = `https://www.reddit.com/search.rss?q=${encodeURIComponent(q)}&sort=new&t=week`;
    for (const it of await fetchFeed(url)) found.set(it.id, it);
  }
  for (const sub of FEED_SUBS) {
    for (const it of await fetchFeed(`https://www.reddit.com/r/${sub}/new/.rss`)) found.set(it.id, it);
  }

  const index = buildIndex(pages);
  const fresh = [...found.values()].filter((t) => !seen.has(t.id));
  const ranked = fresh
    .map((t) => {
      const hits = entitiesIn(t, index);
      return { ...t, hits, page: hits[0]?.page ?? null, score: score(t, hits) };
    })
    .filter((t) => t.page && t.score >= 7)
    .sort((a, b) => b.score - a.score);

  const picks = ranked.slice(0, THREAD_TARGET);
  for (const t of fresh) seen.add(t.id);
  state.threads = { checkedAt: new Date().toISOString(), seenIds: [...seen].slice(-1500) };

  const findings = [];
  if (picks.length) {
    const day = new Date().toISOString().slice(0, 10);
    const lines = picks.map((t, i) => [
      `### ${i + 1}. [${t.title}](${t.link})`,
      t.sub ? `_${t.sub}_` : '',
      '',
      `**Mentions:** ${t.hits.slice(0, 3).map((h) => `\`${h.term}\``).join(', ')}`,
      `**Answer with:** [${t.page.title}](https://jairaj1234-dancer.github.io${t.page.url})`,
      '',
    ].filter(Boolean).join('\n'));

    findings.push({
      fingerprint: `threads:${day}`,
      severity: 'low',
      title: `${picks.length} thread${picks.length === 1 ? '' : 's'} worth answering today`,
      body: [
        picks.length < THREAD_TARGET
          ? `Only ${picks.length} met the bar today out of ${fresh.length} new posts seen. `
            + 'The niche is small and most posts are not questions; a thin day is a real result, '
            + 'not a broken monitor.'
          : `The best ${picks.length} of ${fresh.length} new posts seen.`,
        '',
        ...lines,
        '---',
        '',
        '**How to use this.** Open the thread, read it properly, and answer in your own words as',
        'yourself. Link the page only where it genuinely answers the question. Do not paste the',
        'same text twice, and skip anything you would not answer if there were no link in it.',
        '',
        'Nothing was posted for you and nothing will be. Reddit acts on inauthenticity and volume,',
        'and the exposure is a silent domain-level ban that would poison every future mention of',
        'the site. It is also worth the minute: Google licenses Reddit content, so unlike other',
        'platforms these answers do reach Google and its AI Overviews.',
        blocked ? `\n_${blocked} feed(s) returned HTTP 429 this run; coverage was partial._` : '',
      ].filter(Boolean).join('\n'),
    });
  }

  state.threadStats = {
    checkedAt: new Date().toISOString(),
    requests, blocked, seen: found.size, fresh: fresh.length,
    qualified: ranked.length, surfaced: picks.length,
    note: UA_NOTE,
  };

  return { findings, metrics: { seen: found.size, qualified: ranked.length, surfaced: picks.length, blocked } };
}
