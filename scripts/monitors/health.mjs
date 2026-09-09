import { get } from '../lib/fetch.mjs';
import { SITE, BASE, ORIGIN, HEALTH_PATHS, ROOT_PATHS } from './config.mjs';

export const id = 'health';
export const label = 'Site health';

export async function run(state) {
  const findings = [];
  const results = [];

  for (const p of HEALTH_PATHS) {
    const url = `${SITE}${BASE}${p}`;
    const res = await get(url);
    results.push({ url, status: res.status, ok: res.ok });
    if (!res.ok) {
      findings.push({
        fingerprint: `health:${p}:${res.status}`,
        severity: res.status === 404 ? 'high' : 'medium',
        title: `Site health: ${p} returned ${res.status || 'no response'}`,
        body: [
          `\`${url}\` returned **${res.status || 'no response'}**${res.error ? ` (${res.error})` : ''}.`,
          '',
          'This path is on the health list because something depends on it:',
          'the sitemap and llms files are how crawlers and answer engines discover the site,',
          'and the sample pages are representative of whole sections.',
        ].join('\n'),
      });
    }
  }

  // Root-level files live on a different repo while the site is on a project path.
  for (const p of ROOT_PATHS) {
    const url = `${ORIGIN}${p}`;
    const res = await get(url);
    results.push({ url, status: res.status, ok: res.ok });
    if (!res.ok) {
      findings.push({
        fingerprint: `health:root:${p}:${res.status}`,
        severity: 'high',
        title: `Root file missing: ${p} returned ${res.status || 'no response'}`,
        body: [
          `\`${url}\` returned **${res.status || 'no response'}**.`,
          '',
          'Root files matter more than they look. Crawlers read `robots.txt` only from the',
          'origin root, so the copy under the base path is never read. The IndexNow key file',
          'must resolve or every submission is rejected with `SiteVerificationNotCompleted`.',
          '',
          'These are served by the `jairaj1234-dancer.github.io` repo, not this one.',
        ].join('\n'),
      });
    }
  }

  const failing = results.filter((r) => !r.ok);
  state.health = {
    checkedAt: new Date().toISOString(),
    total: results.length,
    failing: failing.length,
    failingUrls: failing.map((r) => `${r.url} (${r.status})`),
  };

  return { findings, metrics: { checked: results.length, failing: failing.length } };
}
