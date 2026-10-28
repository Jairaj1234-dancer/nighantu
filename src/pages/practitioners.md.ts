import type { APIRoute } from 'astro';
import { states, practices, cities } from '../lib/practitioners';
import { abs } from '../lib/site';

/** Plain-Markdown twin of the directory index: every state and city with its count. */
export const GET: APIRoute = () => {
  const canonical = abs('/practitioners/');
  const count = (c: any) => c.localities.reduce((a: number, l: any) => a + l.practices.length, 0);
  const all = states();
  const body = [
    '# Ayurvedic practitioners in India',
    '',
    `Canonical version of this page: ${canonical}`,
    '',
    `> ${practices.length} Ayurvedic practices in ${cities().length} cities and towns across ${all.length} states and union territories of India. A practice is listed only when a named practitioner, the practice name, a full address with PIN and a business phone number are published by the practice itself or an official list, and every listing is re-read against its source before it is published.`,
    '',
    ...all.flatMap((s) => [
      `## [${s.name}](${abs(`/practitioners/state/${s.slug}/`)})`,
      '',
      ...s.cities.map((c) => `- [${c.name}](${abs(`/practitioners/${c.slug}/`)}): ${count(c)}`),
      '',
    ]),
    `Practitioners can list, verify, correct or remove a practice at ${abs('/practitioners/submit/')}.`,
    '',
    '---',
    '',
    `Canonical version of this page: ${canonical}`,
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
