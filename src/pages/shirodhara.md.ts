import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const entry = (await getCollection('guide')).find((e) => e.data.slug === 'shirodhara')!;
  const body = [
    `# ${entry.data.title}`, '', `> ${entry.data.answer}`, '', entry.body?.trim() ?? '',
    '', '---', '',
    'Published by Age Ayurveda in the Ayurveda Atlas. Educational reference only, not medical advice.',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
