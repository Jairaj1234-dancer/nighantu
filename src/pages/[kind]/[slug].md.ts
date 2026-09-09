import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { KINDS } from '../../lib/collections';

/**
 * Plain-Markdown twin of every monograph. Several crawlers and agents prefer a
 * raw text source over parsing HTML, and it costs nothing to serve both.
 */
export async function getStaticPaths() {
  const out: any[] = [];
  for (const kind of KINDS) {
    for (const entry of await getCollection(kind)) {
      out.push({ params: { kind, slug: entry.data.slug }, props: { entry } });
    }
  }
  return out;
}

export const GET: APIRoute = ({ props }) => {
  const { entry } = props as { entry: any };
  const d = entry.data;
  const facts = [
    ['Botanical name', d.botanical],
    ['Family', d.family],
    ['Sanskrit name', d.sanskrit],
    ['Ayurvedic category', d.ayurvedicCategory],
    ['Pharmacopoeia status', d.whoStatus],
  ].filter(([, v]) => v);

  const body = [
    `# ${d.title}`,
    '',
    `> ${d.answer}`,
    '',
    ...(facts.length ? ['## Key facts', '', ...facts.map(([k, v]) => `- **${k}:** ${v}`), ''] : []),
    entry.body?.trim() ?? '',
    '',
    '---',
    '',
    ...(d.sources?.length ? ['## Sources', '', ...d.sources.map((s: string) => `- ${s}`), ''] : []),
    'Published by Age Ayurveda in the Nighantu. Educational reference only, not medical advice.',
    'Incorporates material from the Amidha Ayurveda Herb Database under CC BY 4.0.',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
