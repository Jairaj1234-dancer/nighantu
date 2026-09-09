import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { KINDS, SECTION_META } from '../lib/collections';
import { abs, TAGLINE } from '../lib/site';

export const GET: APIRoute = async () => {
  const out: string[] = [
    '# Ayurveda Atlas',
    '',
    `> ${TAGLINE} Published by Age Ayurveda. Every monograph carries a short definitional`,
    '> summary, a key-facts table, classical text references and dated research findings.',
    '> A plain-Markdown twin of each page is available by appending .md to its URL',
    `> (for example ${abs('/herb/ashwagandha.md')}).`,
    '',
    'Editorial position: this is reference material. Traditional uses and published research',
    'are reported as stated in their sources, not as claims about what any product does.',
    'Monograph text incorporates material from the Amidha Ayurveda Herb Database (CC BY 4.0).',
    '',
    '## Guides',
    '',
    `- [Shirodhara](${abs('/shirodhara/')}): the full practice guide, oil selection by dosha, protocol, cautions and equipment.`,
    `- [How we source](${abs('/how-we-source/')}): where the material comes from and how it is checked.`,
    `- [Editorial standards](${abs('/editorial-standards/')}): what this site does and does not claim.`,
    '',
  ];

  for (const kind of KINDS) {
    const entries = (await getCollection(kind))
      .map((e) => e.data)
      .sort((a, b) => a.title.localeCompare(b.title, 'en'));
    if (!entries.length) continue;
    const meta = SECTION_META[kind];
    out.push(`## ${meta.label} (${entries.length})`, '', meta.blurb, '');
    for (const e of entries) {
      const note = e.botanical || e.ayurvedicCategory || '';
      out.push(`- [${e.title}](${abs(`${meta.href}${e.slug}/`)})${note ? `: ${note}` : ''}`);
    }
    out.push('');
  }

  const glossary = (await getCollection('glossary')).map((e) => e.data);
  if (glossary.length) {
    out.push(`## Glossary (${glossary.reduce((n, g) => n + g.entryCount, 0)} definitions)`, '');
    for (const g of glossary.sort((a, b) => a.slug.localeCompare(b.slug))) {
      out.push(`- [${g.title}](${abs(`/glossary/${g.slug}/`)}): ${g.entryCount} entries`);
    }
    out.push('');
  }

  return new Response(out.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
