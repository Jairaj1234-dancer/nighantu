import type { APIRoute } from 'astro';
import { practices, urlOf, cityOf, localityOf, summaryOf, longDate, placeOf } from '../../../../lib/practitioners';
import { abs, PUBLISHER } from '../../../../lib/site';

/**
 * Plain-Markdown twin of one listing, for the same reason the monographs have one: an agent that
 * prefers text gets the four admitted fields without parsing a page. The canonical HTML address sits
 * in the first lines, so a consumer that truncates still knows where the text came from.
 */
export function getStaticPaths() {
  return practices.map((p) => ({ params: { city: cityOf(p), locality: localityOf(p), practice: p.id }, props: { p } }));
}

const FIELD: Record<string, string> = { practiceName: 'Practice name', practitioners: 'Practitioners', address: 'Address', phone: 'Phone' };

export const GET: APIRoute = ({ props }) => {
  const { p } = props as { p: any };
  const canonical = abs(urlOf(p));
  const body = [
    `# ${p.practiceName}`,
    '',
    `Canonical version of this page: ${canonical}`,
    '',
    `> ${summaryOf(p)}`,
    '',
    '## Listing',
    '',
    ...p.practitioners.map((d: any) => `- **Practitioner:** ${d.name}${d.qualification ? `, ${d.qualification}` : ''}${d.registration ? `, registration ${d.registration.number}` : ''}`),
    `- **Address:** ${p.address.line}, ${placeOf(p)} ${p.address.pin}`,
    `- **Phone:** ${p.phone.join(', ')}`,
    ...(p.website ? [`- **Website:** ${p.website}`] : []),
    ...(p.email ? [`- **Email:** ${p.email}`] : []),
    ...(p.hours ? [`- **Hours, as published:** ${p.hours}`] : []),
    ...(p.services?.length ? [`- **Services, as published:** ${p.services.join(', ')}`] : []),
    '',
    '## Where each detail comes from',
    '',
    ...Object.entries(p.sources).filter(([k]) => FIELD[k]).map(([k, u]) => `- ${FIELD[k]}: ${u}`),
    '',
    `Checked ${longDate(p.checkedOn)}. A listing is not an endorsement or a referral; ${PUBLISHER} has no arrangement with this practice.`,
    '',
    '---',
    '',
    `Canonical version of this page: ${canonical}`,
    '',
    'Published by Age Ayurveda in the Nighantu practitioner directory. Not medical advice.',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
