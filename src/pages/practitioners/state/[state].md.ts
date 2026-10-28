import type { APIRoute } from 'astro';
import { states, urlOf } from '../../../lib/practitioners';
import { abs } from '../../../lib/site';

/** Plain-Markdown twin of a state page: every practice by city, with practitioner, address and phone. */
export function getStaticPaths() { return states().map((s) => ({ params: { state: s.slug }, props: { s } })); }

export const GET: APIRoute = ({ props }) => {
  const { s } = props as { s: any };
  const canonical = abs(`/practitioners/state/${s.slug}/`);
  const n = s.cities.reduce((a: number, c: any) => a + c.localities.reduce((b: number, l: any) => b + l.practices.length, 0), 0);
  const body = [
    `# Ayurvedic practitioners in ${s.name}`,
    '',
    `Canonical version of this page: ${canonical}`,
    '',
    `> ${n} Ayurvedic ${n === 1 ? 'practice' : 'practices'} in ${s.cities.length} ${s.cities.length === 1 ? 'city or town' : 'cities and towns'} of ${s.name}, each with a named practitioner, an address with PIN and a phone number published by the practice itself or an official list.`,
    '',
    ...s.cities.flatMap((c: any) => [
      `## ${c.name}`,
      '',
      ...c.localities.flatMap((l: any) => l.practices).map((p: any) => `- [${p.practiceName}](${abs(urlOf(p))}): ${p.practitioners.map((d: any) => d.name).join(', ')}. ${p.address.line}, ${p.address.locality}, ${p.address.city} ${p.address.pin}. Phone ${p.phone.join(', ')}.`),
      '',
    ]),
    '---',
    '',
    `Canonical version of this page: ${canonical}`,
    '',
    'Published by Age Ayurveda in the Nighantu practitioner directory. A listing is not an endorsement. Not medical advice.',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
