import type { APIRoute } from 'astro';
import { cities, urlOf, stateOf } from '../../lib/practitioners';
import { abs } from '../../lib/site';

/** Plain-Markdown twin of a city page: every practice by locality, with practitioner, address and phone. */
export function getStaticPaths() { return cities().map((c) => ({ params: { city: c.slug }, props: { c } })); }

export const GET: APIRoute = ({ props }) => {
  const { c } = props as { c: any };
  const all = c.localities.flatMap((l: any) => l.practices);
  const state = stateOf(all[0]);
  const canonical = abs(`/practitioners/${c.slug}/`);
  const body = [
    `# Ayurvedic practitioners in ${c.name}${state && !c.name.includes(state) ? `, ${state}` : ''}`,
    '',
    `Canonical version of this page: ${canonical}`,
    '',
    `> ${all.length} Ayurvedic ${all.length === 1 ? 'practice' : 'practices'} across ${c.localities.length} ${c.localities.length === 1 ? 'locality' : 'localities'} of ${c.name}, each with a named practitioner, an address with PIN and a phone number published by the practice itself or an official list.`,
    '',
    ...c.localities.flatMap((l: any) => [
      `## ${l.name}`,
      '',
      ...l.practices.map((p: any) => `- [${p.practiceName}](${abs(urlOf(p))}): ${p.practitioners.map((d: any) => d.name).join(', ')}. ${p.address.line}, ${p.address.locality}, ${p.address.city} ${p.address.pin}. Phone ${p.phone.join(', ')}.`),
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
