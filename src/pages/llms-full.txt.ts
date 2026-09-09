import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { KINDS, SECTION_META } from '../lib/collections';
import { abs, TAGLINE } from '../lib/site';

/** Every monograph's answer block and key facts in one file. */
export const GET: APIRoute = async () => {
  const out: string[] = [
    '# Ayurveda Atlas, full text index',
    '',
    TAGLINE,
    'Published by Age Ayurveda. Educational reference only, not medical advice.',
    'Incorporates material from the Amidha Ayurveda Herb Database under CC BY 4.0.',
    '',
  ];

  for (const kind of KINDS) {
    const entries = (await getCollection(kind))
      .map((e) => e.data)
      .sort((a, b) => a.title.localeCompare(b.title, 'en'));
    if (!entries.length) continue;
    out.push(`\n## ${SECTION_META[kind].label}\n`);
    for (const e of entries) {
      out.push(`### ${e.title}`);
      out.push(`URL: ${abs(`${SECTION_META[kind].href}${e.slug}/`)}`);
      if (e.botanical) out.push(`Botanical name: ${e.botanical}`);
      if (e.family) out.push(`Family: ${e.family}`);
      if (e.ayurvedicCategory) out.push(`Ayurvedic category: ${e.ayurvedicCategory}`);
      if (e.whoStatus) out.push(`Pharmacopoeia status: ${e.whoStatus}`);
      out.push('', e.answer, '');
    }
  }

  return new Response(out.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
