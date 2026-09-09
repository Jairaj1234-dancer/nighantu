import { get, visibleText } from '../lib/fetch.mjs';
import { hash } from '../lib/state.mjs';
import { COMPETITORS, COMPETITOR_SIGNALS } from './config.mjs';

export const id = 'competitors';
export const label = 'Competitor specifications';

/**
 * Extract only the figures worth diffing: prices, weights, temperatures, durations,
 * capacities and warranty terms. Hashing the whole page would fire on every cookie
 * banner and cart-count change, which trains you to ignore the alert.
 */
function signals(html) {
  const text = visibleText(html);
  const found = new Set();
  for (const re of COMPETITOR_SIGNALS) {
    for (const m of text.matchAll(re)) found.add(m[0].toLowerCase().replace(/\s+/g, ' ').trim());
  }
  return [...found].sort();
}

export async function run(state) {
  const findings = [];
  const summary = [];

  for (const c of COMPETITORS) {
    const res = await get(c.url, { retries: 1 });
    const prev = state.competitors[c.id] ?? {};

    if (!res.ok) {
      summary.push({ id: c.id, name: c.name, status: res.status, signals: prev.signals?.length ?? 0 });
      // A competitor page going away is itself worth knowing: the comparison table
      // names it, and a dead vendor is a fact the page should reflect.
      if (res.status === 404 || res.status === 410) {
        findings.push({
          fingerprint: `competitor:gone:${c.id}:${res.status}`,
          severity: 'medium',
          title: `Competitor page gone: ${c.name} (${res.status})`,
          body: [
            `\`${c.url}\` returned **${res.status}**.`,
            '',
            `${c.name} is listed in the comparison table on \`/shirodhara/choosing-equipment/\`.`,
            'If the product is genuinely discontinued, the table should say so rather than',
            'keep citing specifications for something nobody can buy.',
          ].join('\n'),
        });
      }
      continue;
    }

    const current = signals(res.text);
    const h = hash(current.join('|'));
    summary.push({ id: c.id, name: c.name, status: res.status, signals: current.length });

    if (prev.hash && prev.hash !== h) {
      const added = current.filter((s) => !(prev.signals ?? []).includes(s));
      const removed = (prev.signals ?? []).filter((s) => !current.includes(s));
      findings.push({
        fingerprint: `competitor:changed:${c.id}:${h}`,
        severity: 'low',
        title: `Competitor specs changed: ${c.name}`,
        body: [
          `Figures on [${c.name}](${c.url}) have changed since the last check.`,
          '',
          added.length ? `**Now present:**\n${added.map((s) => `- \`${s}\``).join('\n')}` : '_Nothing new._',
          '',
          removed.length ? `**No longer present:**\n${removed.map((s) => `- \`${s}\``).join('\n')}` : '_Nothing removed._',
          '',
          'The comparison table at `/shirodhara/choosing-equipment/` carries a "checked on"',
          'date and an explicit promise to correct errors, including where a correction',
          'favours a competitor over us. Verify against the page itself before editing, since',
          'this monitor reads figures out of context and cannot tell a price from a postcode.',
        ].join('\n'),
      });
    }

    state.competitors[c.id] = {
      hash: h,
      signals: current,
      checkedAt: new Date().toISOString(),
      url: c.url,
    };
  }

  state.competitorSummary = { checkedAt: new Date().toISOString(), items: summary };
  return { findings, metrics: { checked: COMPETITORS.length, changed: findings.length } };
}
