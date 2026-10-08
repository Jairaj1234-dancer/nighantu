/**
 * Markdown twin of every concept page.
 *
 * Same order as the HTML, for the same reason: the disagreements first, then the gaps, then the
 * exposition. A withheld quotation says it is withheld here too, so an agent reading the markdown
 * cannot mistake a passage we may not reproduce for a passage that does not exist.
 */
import type { APIRoute } from 'astro';
import concepts from '../../data/concepts.json';
import { abs } from '../../lib/site';

export function getStaticPaths() {
  return ((concepts as any).records as any[]).map((r) => ({ params: { slug: r.slug }, props: { r } }));
}

const address = (c: any) => [c.sthana, [c.chapter, c.verse].filter(Boolean).join(':')].filter(Boolean).join(' ');
const cell = (s: any) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export const GET: APIRoute = ({ props }) => {
  const { r } = props as { r: any };
  const domains = (concepts as any).domains as { id: string; label: string }[];
  const domain = domains.find((d) => d.id === r.domainGroup) ?? null;
  const withText = (r.classical ?? []).filter((c: any) => c.quote || c.sanskrit || c.translation);

  const out: string[] = [
    `# ${r.title}`,
    '',
    `> Canonical version of this page: ${abs(`/concept/${r.slug}/`)}`,
    '',
  ];

  if (r.evidenceState) {
    out.push('## How much weight this concept bears', '', r.evidenceState, '');
  }
  if (r.summary) out.push(r.summary, '');

  out.push('## At a glance', '', '| Field | Value |', '| --- | --- |');
  if (domain) out.push(`| Subject area | ${cell(domain.label)} |`);
  if (r.domain) out.push(`| Domain, as recorded | ${cell(r.domain)} |`);
  out.push(`| Contested questions | ${(r.contested ?? []).length} |`);
  out.push(`| Stated as not known | ${(r.notKnown ?? []).length} |`);
  out.push(`| Classical citations | ${(r.classical ?? []).length}, ${withText.length} quoting the text |`);
  out.push(`| Research papers assessed | ${(r.modern ?? []).length} |`);
  if (r.verifiedOn) out.push(`| Citations checked | ${cell(r.verifiedOn)} |`);
  out.push('');

  if ((r.contested ?? []).length) {
    out.push('## What is contested, and by whom', '',
      'These are the questions on which the sources genuinely disagree. Each position is given as',
      'its source states it. No position is presented as the settled answer, because none of them is.', '');
    for (const c of r.contested) {
      out.push(`### ${c.question}`, '', 'This is contested.', '');
      for (const p of c.positions ?? []) out.push(`- ${p}`);
      out.push('');
    }
  }

  if ((r.notKnown ?? []).length) {
    out.push('## What is not known', '',
      'Stated rather than left out. Where a negative has actually been searched for rather than',
      'assumed, the entry says so.', '');
    for (const x of r.notKnown) out.push(`- ${typeof x === 'string' ? x : (x.question ?? '')}`);
    out.push('');
  }

  if ((r.components ?? []).length) {
    out.push('## The terms this concept is built from', '', '| Term | What it names |', '| --- | --- |');
    for (const c of r.components) {
      const name = c.lexicon ? `[${cell(c.term)}](${abs(`/lexicon/${c.lexicon}/`)})` : cell(c.term);
      out.push(`| ${name} | ${cell(c.gloss)} |`);
    }
    out.push('');
  }

  if ((r.classical ?? []).length) {
    out.push('## The classical passages', '',
      'Each citation gives its address so a reader can check it in a printed edition, our account',
      'of what it establishes, and the result of reading it against its source.', '');
    for (const c of r.classical) {
      out.push(`### ${c.text}${address(c) ? ` ${address(c)}` : ''}${c.checked ? ` — ${c.checked}` : ''}`, '');
      if (c.sanskrit) out.push(`> ${String(c.sanskrit).replace(/\n/g, '\n> ')}`, '', 'Sanskrit mūla', '');
      if (c.translation) {
        out.push(`> ${String(c.translation).replace(/\n/g, '\n> ')}`, '',
          c.translator ? `tr. ${c.translator}` : 'translation', '');
      }
      if (c.quote) {
        out.push(`> ${String(c.quote).replace(/\n/g, '\n> ')}`, '',
          c.translator ? `tr. ${c.translator}` : 'Sanskrit mūla', '');
      }
      if (c.withheld) {
        out.push(`**Quotation withheld:** ${c.withheld}.`
          + `${c.sourceUrl ? ` The passage is at ${c.sourceUrl}` : ''}`, '');
      }
      if (c.partWithheld) out.push(`The English rendering is not reproduced: ${c.partWithheld}.`, '');
      if (c.establishes) out.push(c.establishes, '');
      if (c.sourceUrl && !c.withheld) out.push(`Source: ${c.sourceUrl}`, '');
    }
  }

  if ((r.modern ?? []).length) {
    out.push('## What the research actually shows', '',
      'Every paper located for this concept, with what it measured and what it does and does not',
      'establish. The assessment is ours.', '');
    for (const m of r.modern) {
      out.push(`### ${m.title ?? 'Untitled'}`, '');
      const bib = [
        m.journal, m.year,
        m.pmid ? `PMID ${m.pmid} (https://pubmed.ncbi.nlm.nih.gov/${m.pmid}/)` : null,
        !m.pmid && m.doi ? `doi:${m.doi} (https://doi.org/${m.doi})` : null,
        m.design, m.n ? `n = ${m.n}` : null,
      ].filter(Boolean).join(' · ');
      if (bib) out.push(bib, '');
      if (m.establishes) out.push(m.establishes, '');
      if (m.quality) out.push(`**How much it shows.** ${m.quality}`, '');
      if (m.quote) out.push(`> ${String(m.quote).replace(/\n/g, '\n> ')}`, '');
    }
  }

  if ((r.openQuestions ?? []).length) {
    out.push('## Open questions on this record', '', 'Recorded rather than resolved.', '');
    for (const q of r.openQuestions) out.push(`- ${typeof q === 'string' ? q : (q.question ?? '')}`);
    out.push('');
  }

  out.push('## Citation', '',
    `Age Ayurveda Nighantu, "${r.title}", ${abs(`/concept/${r.slug}/`)}, CC BY 4.0.`,
    `Whole concept set: ${abs('/concepts.json')} and ${abs('/concepts.csv')}.`, '',
    'Educational reference only. This page describes what a body of theory claims and how well it',
    'is evidenced. Nothing here is advice, and nothing here describes how any condition should be',
    'treated.', '');

  return new Response(out.join('\n'), { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
};
