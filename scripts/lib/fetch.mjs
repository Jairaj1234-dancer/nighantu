/** Shared HTTP helper: identifies itself, retries transient failures, never throws. */

const UA = 'AgeAyurvedaNighantuMonitor/1.0 (+https://jairaj1234-dancer.github.io/nighantu/; site health and accuracy checks)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch with retry. Returns {ok, status, text, error} and never rejects, so one dead
 * host cannot take down a whole monitoring run.
 */
export async function get(url, { retries = 2, timeoutMs = 20000, method = 'GET' } = {}) {
  let last = { ok: false, status: 0, text: '', error: 'not attempted' };

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(1000 * 2 ** (attempt - 1));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        headers: { 'User-Agent': UA, Accept: '*/*' },
        signal: controller.signal,
      });
      const text = method === 'HEAD' ? '' : await res.text();
      last = { ok: res.ok, status: res.status, text, error: null, url: res.url };
      // 4xx is a real answer, not a transient failure. Do not burn retries on it.
      if (res.ok || (res.status >= 400 && res.status < 500)) return last;
    } catch (e) {
      last = { ok: false, status: 0, text: '', error: e.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : e.message };
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}

/** Strip scripts, styles and tags. Good enough for diffing visible content. */
export function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
