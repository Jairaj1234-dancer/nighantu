/**
 * A polite, permission-checked, caching fetcher for pages belonging to other people.
 *
 * Every rule here exists because its absence would be either rude or dishonest.
 *
 * PERMISSION IS CHECKED PER URL, not per host. A host can allow its catalogue and refuse its
 * search or its cart, and a fetcher that decides once per host gets that wrong. The robots.txt is
 * fetched once, parsed once, and then consulted for every path.
 *
 * ONE REQUEST AT A TIME PER HOST, with a delay between them, honouring Crawl-delay where the host
 * states one. A reference site arguing that figures should be checkable has no business making
 * someone else's site slower to prove it.
 *
 * EVERY RESPONSE IS CACHED TO DISK with its provenance: the URL, the status, the fetch time, and
 * the robots verdict that permitted it. The cache is what makes the parse step re-runnable
 * without re-fetching, which is the main reason the hosts only ever see one pass.
 *
 * NOTHING IS GUESSED. A URL is fetched because the host's own sitemap listed it. There is no
 * pattern-guessing loop that walks /product/1, /product/2 generating 404s on someone else's
 * server, and no fallback to a search page when discovery comes up empty: an empty result is
 * reported as an empty result.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fetchRobots, groupFor, isAllowed } from './robots.mjs';

export class Fetcher {
  /**
   * @param {object} opts
   * @param {string} opts.ua                  the one agent string, used for robots AND requests
   * @param {string} opts.cacheDir            where responses and their provenance are written
   * @param {number} [opts.delayMs]           floor on the gap between requests to one host
   * @param {number} [opts.maxBytes]          refuse a body larger than this
   * @param {number} [opts.maxAgeDays]        serve from cache if the entry is younger than this
   */
  constructor({ ua, cacheDir, delayMs = 1500, maxBytes = 5_000_000, maxAgeDays = 14 }) {
    this.ua = ua;
    this.cacheDir = cacheDir;
    this.delayMs = delayMs;
    this.maxBytes = maxBytes;
    this.maxAgeMs = maxAgeDays * 86400_000;
    /** @type {Map<string, {group: any, verdict: string, note: string|null, crawlDelayMs: number}>} */
    this.robots = new Map();
    this.lastAt = new Map();
    this.stats = { fetched: 0, cached: 0, refused: 0, failed: 0, bytes: 0 };
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  /** The robots.txt for a URL's origin, fetched at most once per origin per process. */
  async #robotsFor(origin) {
    if (this.robots.has(origin)) return this.robots.get(origin);
    const r = await fetchRobots(origin, this.ua);
    const group = r.groups ? groupFor(r.groups, this.ua) : null;
    // A stated Crawl-delay is a request from the site owner, so it is honoured when it asks for
    // longer than our own floor. It is never read as licence to go faster than the floor. Capped,
    // because a few sites state a delay of minutes and that would stall the run rather than
    // protect the host; past the cap the host is skipped instead of being crawled too fast.
    const stated = group?.crawlDelay ? group.crawlDelay * 1000 : 0;
    const entry = {
      group,
      verdict: r.verdict,
      note: r.note ?? null,
      status: r.status,
      crawlDelayMs: Math.min(Math.max(this.delayMs, stated), 30_000),
      statedCrawlDelayMs: stated || null,
      // A host asking for more than the cap is not crawled at all rather than crawled faster
      // than it asked for.
      tooSlowToCrawl: stated > 30_000,
    };
    this.robots.set(origin, entry);
    return entry;
  }

  /** May we fetch this URL? `{ ok, reason }`, with unknown read as closed. */
  async permitted(url) {
    const u = new URL(url);
    const r = await this.#robotsFor(u.origin);
    if (r.verdict === 'unknown') return { ok: false, reason: `robots.txt unreadable (${r.note}), treated as disallowed` };
    if (r.tooSlowToCrawl) return { ok: false, reason: `robots.txt asks for a ${r.statedCrawlDelayMs / 1000}s crawl delay, which is longer than this will wait, so the host is left alone` };
    const ok = isAllowed(r.group, u.pathname);
    return ok ? { ok: true, reason: 'allowed by robots.txt' } : { ok: false, reason: 'disallowed by robots.txt' };
  }

  #cachePath(url) {
    const u = new URL(url);
    const h = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
    return path.join(this.cacheDir, u.hostname.replace(/^www\./, ''), `${h}.json`);
  }

  async #throttle(origin, waitMs) {
    const last = this.lastAt.get(origin) ?? 0;
    const wait = last + waitMs - Date.now();
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    this.lastAt.set(origin, Date.now());
  }

  /**
   * Fetch a URL, or serve it from cache.
   *
   * Returns `{ url, status, body, contentType, fetchedAt, fromCache, robots }` or, when the fetch
   * was refused or failed, the same shape with `body: null` and a `refused` or `error` field. A
   * refusal is a RESULT, never an exception: the caller is expected to record it.
   */
  async get(url, { force = false } = {}) {
    const cachePath = this.#cachePath(url);
    if (!force && fs.existsSync(cachePath)) {
      try {
        const hit = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (Date.now() - Date.parse(hit.fetchedAt) < this.maxAgeMs) {
          this.stats.cached += 1;
          return { ...hit, fromCache: true };
        }
      } catch { /* a corrupt entry is simply refetched */ }
    }

    const u = new URL(url);
    const perm = await this.permitted(url);
    if (!perm.ok) {
      this.stats.refused += 1;
      return { url, status: null, body: null, refused: perm.reason, fetchedAt: new Date().toISOString(), fromCache: false };
    }

    const r = this.robots.get(u.origin);
    await this.#throttle(u.origin, r.crawlDelayMs);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25000);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': this.ua, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'en-IN,en;q=0.9' },
        redirect: 'follow',
        signal: ac.signal,
      });
      // A redirect can land somewhere robots disallows, and the final URL is what was actually
      // read, so permission is rechecked against it rather than against what we asked for.
      if (res.url && res.url !== url) {
        const after = await this.permitted(res.url);
        if (!after.ok) {
          this.stats.refused += 1;
          return { url, status: res.status, finalUrl: res.url, body: null, refused: `redirected to a path ${after.reason}`, fetchedAt: new Date().toISOString(), fromCache: false };
        }
      }
      /**
       * The size cap has to be enforced WHILE reading, not after.
       *
       * This was `Buffer.from(await res.arrayBuffer())` followed by a length check, which reads
       * as a cap and is not one: arrayBuffer() decompresses and buffers the whole body first, so
       * by the time the check runs the allocation has already happened. A wave-2 run died of
       * JavaScript heap exhaustion at 2 GB, 48 minutes and roughly 2,000 pages into a crawl of
       * other people's servers, inside a Brotli decompression callback, and produced no output at
       * all. The cap was 5 MB the whole time.
       *
       * So: refuse on a declared Content-Length before reading a byte, then stream and abort the
       * moment the running total passes the cap. `ac.abort()` stops the transfer rather than
       * politely finishing a download that is already being thrown away.
       */
      const declared = Number(res.headers.get('content-length') ?? 0);
      if (declared > this.maxBytes) {
        ac.abort();
        this.stats.failed += 1;
        return { url, status: res.status, body: null, error: `declared ${declared} bytes, over the ${this.maxBytes} cap, not read`, fetchedAt: new Date().toISOString(), fromCache: false };
      }

      let buf;
      if (!res.body) {
        buf = Buffer.alloc(0);
      } else {
        const chunks = [];
        let size = 0;
        let over = false;
        for await (const chunk of res.body) {
          size += chunk.length;
          if (size > this.maxBytes) { over = true; break; }
          chunks.push(Buffer.from(chunk));
        }
        if (over) {
          ac.abort();
          this.stats.failed += 1;
          return { url, status: res.status, body: null, error: `body passed the ${this.maxBytes} byte cap while streaming, abandoned`, fetchedAt: new Date().toISOString(), fromCache: false };
        }
        buf = Buffer.concat(chunks);
      }
      const record = {
        url,
        finalUrl: res.url !== url ? res.url : undefined,
        status: res.status,
        contentType: res.headers.get('content-type') ?? null,
        body: buf.toString('utf8'),
        fetchedAt: new Date().toISOString(),
        // Written into the record, not just logged: a figure taken from this page is only usable
        // if we can still say, later, that the page permitted being read when it was read.
        robots: { verdict: r.verdict, status: r.status, permitted: perm.reason },
      };
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify(record));
      this.stats.fetched += 1;
      this.stats.bytes += buf.length;
      return { ...record, fromCache: false };
    } catch (err) {
      this.stats.failed += 1;
      return { url, status: null, body: null, error: `${err.name}: ${err.message}`, fetchedAt: new Date().toISOString(), fromCache: false };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Pull `<loc>` values out of a sitemap or sitemap index.
 *
 * Deliberately a regex rather than an XML parser: these files are machine-written, the only thing
 * wanted is the URL list, and a parser would add a dependency and a failure mode for nothing. The
 * `isIndex` flag matters because an index's locs are more sitemaps, not pages.
 */
export const parseSitemap = (xml) => {
  const locs = [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'"));
  return { isIndex: /<sitemapindex/i.test(xml), locs };
};
