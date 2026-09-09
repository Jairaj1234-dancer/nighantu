#!/usr/bin/env node
/**
 * Pull Bing Webmaster figures into the dashboard.
 *
 * REST only: Bing retired the SOAP and POX APIs on 31 August 2026, so any snippet
 * from an older tutorial is dead.
 *
 * Quota is read at runtime rather than assumed. The documented ceiling is 10,000
 * URLs a day, but a new or small site is routinely allowed far less, and hardcoding
 * the headline figure produces a dashboard that lies.
 *
 *   BING_API_KEY=... node scripts/search-health.mjs
 */
import { get } from './lib/fetch.mjs';
import { loadState, saveState } from './lib/state.mjs';
import { renderDashboard } from './lib/dashboard.mjs';
import { SITE, BASE } from './monitors/config.mjs';

const KEY = process.env.BING_API_KEY;
const SITE_URL = process.env.BING_SITE_URL || `${SITE}${BASE}/`;
const API = 'https://ssl.bing.com/webmaster/api.svc/json';

const state = loadState();

if (!KEY) {
  console.log('BING_API_KEY is not set. Skipping the Bing pull.');
  console.log('Get a free key: bing.com/webmasters -> Settings -> API Access -> Generate.');
  renderDashboard(saveState(state), { site: `${SITE}${BASE}` });
  process.exit(0);
}

const call = async (method, params = {}) => {
  const qs = new URLSearchParams({ apikey: KEY, siteUrl: SITE_URL, ...params });
  const res = await get(`${API}/${method}?${qs}`, { retries: 1 });
  if (!res.ok) {
    console.error(`${method}: HTTP ${res.status}${res.error ? ` (${res.error})` : ''}`);
    return null;
  }
  try {
    return JSON.parse(res.text).d ?? null;
  } catch {
    console.error(`${method}: response was not JSON`);
    return null;
  }
};

const quota = await call('GetUrlSubmissionQuota');
const traffic = await call('GetRankAndTrafficStats');

const bing = { checkedAt: new Date().toISOString(), siteUrl: SITE_URL };

if (quota) {
  bing.dailyQuota = quota.DailyQuota ?? null;
  bing.remaining = quota.DailyQuota ?? null;
  bing.monthlyQuota = quota.MonthlyQuota ?? null;
  console.log(`quota  daily=${bing.dailyQuota} monthly=${bing.monthlyQuota}`);
}

if (Array.isArray(traffic) && traffic.length) {
  // Most recent period first.
  const latest = traffic[traffic.length - 1];
  bing.impressions = latest.Impressions ?? null;
  bing.clicks = latest.Clicks ?? null;
  console.log(`traffic  impressions=${bing.impressions} clicks=${bing.clicks}`);
} else if (traffic) {
  console.log('traffic  no rows yet (normal for a site Bing has not finished crawling)');
}

state.search = { ...(state.search ?? {}), bing };
renderDashboard(saveState(state), { site: `${SITE}${BASE}` });
console.log('dashboard updated');
