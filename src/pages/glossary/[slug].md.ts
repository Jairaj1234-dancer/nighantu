import type { APIRoute } from 'astro';
import { abs } from '../../lib/site';
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const entries = await getCollection('glossary');
  return entries.map((entry) => ({ params: { slug: entry.data.slug }, props: { entry } }));
}

export const GET: APIRoute = ({ props }) => {
  const { entry } = props as { entry: any };
  const body = [
    `# ${entry.data.title}`, '', `> ${entry.data.answer}`, '',
    entry.body?.trim() ?? '', '', '---', '',
    `Canonical version of this page: ${abs(`/glossary/${entry.data.slug ?? entry.id}/`)}`, '',
    'Published by Age Ayurveda in the Nighantu. Educational reference only.',
    'Incorporates material from the Amidha Ayurveda Herb Database under CC BY 4.0.',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
