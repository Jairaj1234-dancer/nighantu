import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { KINDS, SECTION_META } from '../lib/collections';
import { abs, TAGLINE } from '../lib/site';

export const GET: APIRoute = async () => {
  const out: string[] = [
    '# Nighantu',
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
    `- [Verification](${abs('/verification/')}): how each class of fact was checked and what was rejected, with the rejection rate for every run.`,
    '',
    '## Datasets',
    '',
    'Structured, downloadable, CC BY 4.0. Each is generated from the monographs themselves,',
    'so it cannot drift from the pages.',
    '',
    `- [Research index](${abs('/research/')}): every cited paper once, with PubMed ID and DOI, cross-referenced to the herbs it concerns. [JSON](${abs('/research.json')}) · [CSV](${abs('/research.csv')})`,
    `- [Dravyaguna](${abs('/dravyaguna/')}): rasa, guna, virya, vipaka and dosha effect as structured values against the classical vocabularies. [JSON](${abs('/dravyaguna.json')}) · [CSV](${abs('/dravyaguna.csv')})`,
    `- [Constituents](${abs('/compounds/')}): the phytochemical co-occurrence graph, computed from the published pages so every weight is checkable. [JSON](${abs('/compounds.json')}) · [CSV](${abs('/compounds.csv')})`,
    `- [Verification ledger](${abs('/verification/')}): per-run counts, rejection reasons and worked examples. [JSON](${abs('/verification.json')})`,
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
