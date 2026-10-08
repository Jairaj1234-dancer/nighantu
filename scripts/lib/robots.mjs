/**
 * robots.txt, parsed and obeyed.
 *
 * This is a gate, not a formality. The sites this is pointed at are other companies' property,
 * and at least one of them refuses AI crawlers deliberately; working around that would be both
 * wrong and self-defeating, since the whole claim this project makes is that its figures can be
 * traced to a source that permitted the reading.
 *
 * Follows the REP as standardised in RFC 9309 on the points that decide a real fetch:
 *
 *  - Groups are keyed by User-agent. A group's lines apply to every agent named in its header
 *    block, and a blank line ends the block but NOT the group's rules.
 *  - The most specific matching agent token wins, by longest prefix match, and `*` is the
 *    fallback used only when no named token matches. An agent never inherits `*`'s rules on top
 *    of its own: the chosen group is the whole answer.
 *  - Within a group, the LONGEST matching path pattern wins, and Allow beats Disallow on a tie.
 *    That ordering matters: a site that says `Disallow: /` then `Allow: /products/` means the
 *    products are open, and reading the lines in order would get it backwards.
 *  - `Disallow:` with an empty value allows everything. `Disallow: /` denies everything.
 *  - `$` anchors the end of a path and `*` matches any run of characters, both of which are
 *    extensions every major crawler honours and which sites write expecting them to be honoured.
 *  - A 4xx on robots.txt means no restrictions. A 5xx, a timeout or a connection reset means
 *    UNKNOWN, and unknown is treated as disallowed here rather than as permission: a host whose
 *    edge terminates the connection has said something, and reading it as a green light would be
 *    choosing the interpretation that suits us.
 */

/** Percent-decoding, so `/produkte/%C3%BCber` and `/produkte/über` compare equal. */
const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

/** A robots path pattern to a RegExp, honouring `*` and a trailing `$`. */
const toRegExp = (pattern) => {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`);
};

/**
 * Parse a robots.txt body into groups.
 *
 * The one subtlety: consecutive User-agent lines with no rule between them form ONE group with
 * several names. A parser that opens a new group per User-agent line silently drops the rules for
 * every agent but the last, which is the classic way to end up fetching something disallowed.
 */
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let expectingAgents = false;

  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (!current || !expectingAgents) { current = { agents: [], rules: [], crawlDelay: null }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      expectingAgents = true;
      continue;
    }
    // Crawl-delay is not a permission, so it does not end the agent block and is kept on the
    // group for a caller that wants to honour it. A site that asks for ten seconds is asking.
    if (field === 'crawl-delay') {
      const secs = Number.parseFloat(value);
      if (current && Number.isFinite(secs) && secs >= 0) current.crawlDelay = secs;
      continue;
    }
    if (field !== 'allow' && field !== 'disallow') continue;
    if (!current) continue;
    expectingAgents = false;
    // An empty Disallow is an explicit "nothing is disallowed" and carries no path.
    if (field === 'disallow' && value === '') { current.rules.push({ allow: true, path: '/', empty: true }); continue; }
    if (value === '') continue;
    current.rules.push({ allow: field === 'allow', path: decode(value), re: toRegExp(decode(value)) });
  }
  return groups;
}

/** The single group that governs `ua`: longest matching named token, else `*`, else none. */
export function groupFor(groups, ua) {
  const needle = String(ua).toLowerCase();
  let best = null;
  let bestLen = -1;
  for (const g of groups) {
    for (const a of g.agents) {
      if (a === '*') continue;
      if (needle.includes(a) && a.length > bestLen) { best = g; bestLen = a.length; }
    }
  }
  if (best) return best;
  return groups.find((g) => g.agents.includes('*')) ?? null;
}

/**
 * May `ua` fetch `pathname`? Longest matching rule wins; Allow beats Disallow on equal length.
 * `null` groups (no robots.txt, or none applying to us) mean no restrictions.
 */
export function isAllowed(group, pathname, { defaultAllow = true } = {}) {
  if (!group || !group.rules.length) return defaultAllow;
  const p = decode(pathname || '/');
  let winner = null;
  for (const r of group.rules) {
    if (r.empty) { if (!winner) winner = r; continue; }
    if (!r.re.test(p)) continue;
    if (!winner || r.path.length > winner.path.length
      || (r.path.length === winner.path.length && r.allow && !winner.allow)) winner = r;
  }
  return winner ? winner.allow : defaultAllow;
}

/**
 * Fetch and parse a host's robots.txt.
 *
 * Returns `{ status, groups, verdict }` where verdict is one of `open` (no robots.txt or no rules
 * for us), `rules` (rules exist and were parsed), or `unknown` (the host would not tell us). A
 * caller must treat `unknown` as closed; see the note at the top of this file.
 */
export async function fetchRobots(origin, ua, { timeoutMs = 15000, attempts = 3 } = {}) {
  // Retried, because `unknown` is treated as disallowed and a single network blip therefore
  // removes a whole host from the run. That happened once: a timeout on one robots.txt dropped
  // 53 product pages out of the dataset, and the run reported a smaller result with no error.
  // Closed-on-unknown is the right rule; reaching that verdict on one failed request is not.
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    last = await fetchRobotsOnce(origin, ua, { timeoutMs });
    if (last.verdict !== 'unknown') return last;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return { ...last, note: `${last.note} (after ${attempts} attempts)` };
}

async function fetchRobotsOnce(origin, ua, { timeoutMs }) {
  const url = `${origin.replace(/\/$/, '')}/robots.txt`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'user-agent': ua, accept: 'text/plain,*/*' }, redirect: 'follow', signal: ac.signal });
    if (res.status >= 500) return { status: res.status, groups: null, verdict: 'unknown', note: `robots.txt returned ${res.status}` };
    if (res.status >= 400) return { status: res.status, groups: null, verdict: 'open', note: `no robots.txt (${res.status})` };
    const text = await res.text();
    // A host that answers robots.txt with HTML has not published one, whatever the status code.
    if (/^\s*<(?:!doctype|html)/i.test(text)) return { status: res.status, groups: null, verdict: 'open', note: 'robots.txt served HTML, treated as absent' };
    const groups = parseRobots(text);
    return { status: res.status, groups, verdict: groups.length ? 'rules' : 'open', bytes: text.length };
  } catch (err) {
    return { status: null, groups: null, verdict: 'unknown', note: `${err.name}: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}
