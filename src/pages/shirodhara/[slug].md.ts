import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const all = await getCollection('guide');
  return all
    .filter((e) => e.data.slug !== 'shirodhara')
    .map((entry) => ({ params: { slug: entry.data.slug }, props: { entry } }));
}

export const GET: APIRoute = ({ props }) => {
  const { entry } = props as { entry: any };
  const d = entry.data;
  const body = [
    `# ${d.title}`, '', `> ${d.answer}`, '', entry.body?.trim() ?? '',
    ...(d.faq.length
      ? ['', '## Common questions', '', ...d.faq.flatMap((f: any) => [`### ${f.q}`, '', f.a, ''])]
      : []),
    '', '---', '',
    'Published by Age Ayurveda in the Nighantu. Educational reference only, not medical advice.',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
