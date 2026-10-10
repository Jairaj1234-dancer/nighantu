/**
 * The two pieces of scripts/bing-coverage.mjs that can give a confidently wrong answer.
 *
 * They live here so they can be tested. The program itself is a sequence of API calls and cannot
 * be, and the history of this project says the untestable parts are not where the bugs were: four
 * separate false zeroes came from small pure functions that looked obviously right. A date parser
 * that returns null reads as "Bing has never crawled this page", which is the single most
 * consequential wrong answer this script could produce.
 */

/**
 * Bing's REST API returns .NET JSON dates, not ISO.
 *
 * The shapes seen in the wild are /Date(1760000000000)/ and /Date(1760000000000+0000)/, and
 * `new Date('/Date(1760000000000)/')` is Invalid Date. Reading that as a missing crawl date would
 * turn an indexed site into an unindexed one in the report. Returns a YYYY-MM-DD string, or null
 * only when there genuinely is no date.
 */
export function dotNetDate(v) {
  if (v === null || v === undefined || v === '') return null;
  const m = /\/Date\((-?\d+)/.exec(String(v));
  const d = m ? new Date(Number(m[1])) : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  // .NET DateTime.MinValue MEANS "no date" and parses perfectly, which is how the first run of
  // this script reported "crawl dates span 0001-01-01 to 2026-10-02" and made 20 empty records
  // look like 20 crawled pages.
  //
  // A FLOOR, NOT A PREFIX MATCH. The obvious guard is to reject '0001-'; it does not work, because
  // MinValue is 0001-01-01 with no zone and converting to UTC moves it back to 0000-12-31. Any
  // sentinel of this kind lands near the start of the calendar, and no crawl date can predate the
  // web, so a floor catches the whole family rather than the one spelling that was tested.
  if (d.getUTCFullYear() < 1990) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Does this GetUrlInfo record actually say anything?
 *
 * Bing answers for a URL it has never seen with a FULLY POPULATED SHELL: every field present, every
 * value at its type's default. `Object.keys(d).length > 0` is therefore true for a URL Bing knows
 * nothing about, which is the opposite of what it was being used to mean. The first run of this
 * script counted 20 such shells as "Bing has a record" and then reported "no record at all: 0",
 * which is a false negative wearing the clothes of a measurement.
 *
 * A record counts as real only if Bing tells us something: a crawl date, a discovery date, or a
 * non-zero HTTP status.
 */
export function hasRealRecord(d) {
  if (!d || typeof d !== 'object' || Object.keys(d).length === 0) return false;
  if (dotNetDate(d.LastCrawledDate)) return true;
  if (discoveryDateOf(d)) return true;
  return Number(d.HttpStatus ?? 0) > 0;
}

/**
 * The discovery date, under either of the two names Bing uses.
 *
 * A live GetUrlInfo response for /herb/amla/ returns `DiscoveryDate`. This code was written
 * expecting `DiscoveredDate`, which is the spelling in some of Bing's own documentation and in the
 * GetChildrenUrlInfo shape. Reading the wrong one gives undefined, which reads as "Bing has never
 * discovered this page" on a page it crawled eight days ago. Both are accepted because the real
 * responses demonstrably use both.
 *
 * NOTE ON HttpStatus: it comes back 0 even for a page Bing has crawled, so it is not evidence of
 * anything on its own and is only a last resort in hasRealRecord above.
 */
export function discoveryDateOf(d) {
  return dotNetDate(d?.DiscoveryDate) ?? dotNetDate(d?.DiscoveredDate);
}

/**
 * Bing's throttle, which is a 400 with a body rather than a 429 with a header.
 *
 * `{"ErrorCode":5,"Message":"ERROR!!! ThrottleHost"}`. A caller that treats it as an ordinary
 * failure records "no data" for the URL and carries on, which turns a rate limit into a finding
 * about the site. It has to be distinguishable.
 */
export function isThrottled(status, body) {
  if (status !== 400) return false;
  const s = String(body ?? '');
  return /ThrottleHost/i.test(s) || /"ErrorCode"\s*:\s*5\b/.test(s);
}

/** The top-level section of a site URL: /herb/amla/ is "herb", /datasets/ is "(root)". */
export function sectionOf(u) {
  const p = new URL(u).pathname.split('/').filter(Boolean);
  return p.length > 1 ? p[0] : '(root)';
}

/**
 * A stratified sample across sections, not the first N and not a uniform random N.
 *
 * The first N in sitemap order is almost entirely one collection, and a uniform random draw
 * under-represents the small collections that are the most likely to be missing from an index.
 * Taking a proportional, evenly spaced slice of each section means a section that is wholly absent
 * reads as absent rather than as sampling noise.
 *
 * Guarantees, which the tests pin: every section present in the input is present in the output, no
 * URL appears twice, and the result never exceeds the input.
 */
export function stratify(urls, n) {
  const groups = new Map();
  for (const u of urls) {
    const s = sectionOf(u);
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(u);
  }
  const picked = [];
  for (const [, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const want = Math.min(list.length, Math.max(1, Math.round((list.length / urls.length) * n)));
    const step = Math.max(1, Math.floor(list.length / want));
    for (let i = 0, taken = 0; i < list.length && taken < want; i += step, taken++) {
      picked.push(list[i]);
    }
  }
  return picked;
}

/** Strip a secret from anything bound for a log line or a written file. */
export function redactor(secret) {
  if (!secret) return (s) => String(s ?? '');
  return (s) => String(s ?? '').replaceAll(secret, '[REDACTED]');
}
