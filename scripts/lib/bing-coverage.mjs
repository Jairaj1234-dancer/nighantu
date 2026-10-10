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
  if (m) {
    const d = new Date(Number(m[1]));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
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
