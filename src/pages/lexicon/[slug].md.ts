/**
 * Markdown twin of every lexicon entry.
 *
 * Same content, same caveats, same order. A withheld quotation says it is withheld here too: an
 * agent reading the markdown must not be able to mistake a quotation we may not reproduce for a
 * passage that does not exist.
 */
import type { APIRoute } from 'astro';
import lexicon from '../../data/lexicon.json';
import conceptsData from '../../data/concepts.json';
import { abs } from '../../lib/site';
import { conceptLinksFor } from '../../lib/concept-links';

export function getStaticPaths() {
  return ((lexicon as any).records as any[]).map((r) => ({ params: { slug: r.slug }, props: { r } }));
}

const address = (c: any) => [c.sthana, [c.chapter, c.verse].filter(Boolean).join(':')].filter(Boolean).join(' ');

export const GET: APIRoute = ({ props }) => {
  const { r } = props as { r: any };
  const name = r.iast ?? r.slug;
  const families = (lexicon as any).families as { id: string; label: string }[];
  const family = families.find((f) => f.id === r.family) ?? null;
  const distinct = [...new Set((r.renderings ?? []).map((x: any) => String(x.english ?? '').toLowerCase().trim()).filter(Boolean))];

  const out: string[] = [
    `# ${name}${r.devanagari ? ` (${r.devanagari})` : ''}`,
    '',
    `> Canonical version of this page: ${abs(`/lexicon/${r.slug}/`)}`,
    '',
  ];

  if (distinct.length > 1) {
    out.push(`An Ayurvedic technical term, rendered into English in ${distinct.length} different ways.`,
      'The renderings do not agree, and the difference between them changes what the term is taken',
      'to mean.', '');
  } else if (distinct.length === 1) {
    out.push(`An Ayurvedic technical term, rendered into English as "${r.renderings[0].english}".`, '');
  } else {
    out.push('An Ayurvedic technical term. No published English rendering was found for it.', '');
  }

  out.push('## Identification', '', '| Field | Value |', '| --- | --- |',
    `| Transliteration | ${r.iast ?? '—'} |`);
  if (r.devanagari) out.push(`| Devanagari | ${r.devanagari} |`);
  if ((r.alternates ?? []).length) out.push(`| Also written | ${r.alternates.join(', ')} |`);
  if (r.category) out.push(`| Category, as gathered | ${String(r.category).replace(/\|/g, '\\|')} |`);
  if (family) out.push(`| Grouped under | ${family.label} |`);
  out.push(`| Classical citations | ${(r.classical ?? []).length} |`);
  if (r.verifiedOn) out.push(`| Citations checked | ${r.verifiedOn} |`);
  out.push('');

  if (r.nameAttestation) {
    out.push('## Is the name itself classical?', '', `**${r.nameAttestation.finding}**`, '', r.nameAttestation.detail, '');
  }

  if ((r.renderings ?? []).length) {
    out.push('## How it is translated, and whether the translation holds', '',
      'Each rendering is given with the source that uses it. The assessment is ours.', '');
    for (const x of r.renderings) {
      out.push(`### ${x.english ?? '(the source\'s rendering is a full definition and is not reproduced here)'}`, '',
        `${[x.sourceName, x.locator, x.sourceKind].filter(Boolean).join(' · ')}`
        + `${x.verbatim === false ? ' · our paraphrase of the source, not its words' : ''}`, '');
      if (x.locatorWithheld) out.push(`The source's own wording is not reproduced here: ${x.locatorWithheld}.`, '');
      if (x.englishWithheld) out.push(`The source's rendering is not reproduced here: ${x.englishWithheld}.`, '');
      if (x.assessment) out.push(x.assessment, '');
      if (x.licence === 'nd-attribution') {
        out.push(`Reproduced unaltered and attributed from ${x.licenceNote}, which is what that`,
          'licence permits, and deliberately absent from the downloadable dataset, which is CC BY 4.0.', '');
      }
    }
  }

  if ((r.classical ?? []).length) {
    out.push('## The classical passages', '');
    for (const c of r.classical) {
      out.push(`### ${c.text}${address(c) ? ` ${address(c)}` : ''}${c.checked ? ` — ${c.checked}` : ''}`, '');
      if (c.quote) {
        out.push(`> ${String(c.quote).replace(/\n/g, '\n> ')}`, '',
          `${c.translator ? `tr. ${c.translator}` : 'Sanskrit mūla'}${c.sourceUrl ? ` · ${c.sourceUrl}` : ''}`, '');
      } else if (c.quoteWithheld) {
        out.push(`**Quotation withheld:** ${c.quoteWithheld}.`
          + `${c.sourceUrl ? ` The passage is at ${c.sourceUrl}` : ''}`, '');
      }
      if (c.establishes) out.push(c.establishes, '');
    }
  }

  // See src/lib/concept-links.ts: a record ABOUT this term, versus one that merely uses it.
  const termSlugs = new Set(((lexicon as any).records as any[]).map((x: any) => x.slug));
  const { subject: subjectConcepts, components: usedInConcepts } =
    conceptLinksFor(r.slug, (conceptsData as any).records as any[], termSlugs);

  if (subjectConcepts.length) {
    out.push('## The concept record for this term', '',
      'A term entry answers what the word means. It does not answer whether the thing the word',
      'names is settled, and often it is not. That is what the concept record is for: it sets out',
      'the questions on which the sources disagree about this term, with each position attributed,',
      'and states what is not established.', '');
    for (const u of subjectConcepts) out.push(`- [${u.title}](${abs(`/concept/${u.slug}/`)})`);
    out.push('');
  }

  if (usedInConcepts.length) {
    out.push('## Where this term does work in the theory', '',
      usedInConcepts.length === 1
        ? 'One concept record names this term as one of its components, and glosses it there as follows.'
        : `${usedInConcepts.length} concept records name this term as one of their components. Each gloss is that record's own.`, '');
    for (const u of usedInConcepts) {
      out.push(`- **[${u.title}](${abs(`/concept/${u.slug}/`)})**`
        + `${u.term !== name ? ` (as ${u.term})` : ''}: ${u.gloss ?? ''}`);
    }
    out.push('');
  }

  if ((r.distinguishFrom ?? []).length) {
    out.push('## Not to be confused with', '');
    for (const d of r.distinguishFrom) out.push(`- **${d.term}.** ${d.why}`);
    out.push('');
  }

  if ((r.mistranslations ?? []).length) {
    out.push('## Renderings that do not hold', '');
    for (const m of r.mistranslations) {
      out.push(`- ${typeof m === 'string' ? m : [m.rendering, m.why ?? m.problem].filter(Boolean).join('. ')}`);
    }
    out.push('');
  }

  if ((r.openQuestions ?? []).length) {
    out.push('## Open questions', '', 'Recorded rather than resolved.', '');
    for (const q of r.openQuestions) out.push(`- ${typeof q === 'string' ? q : (q.question ?? '')}`);
    out.push('');
  }

  out.push('## Citation', '',
    `Age Ayurveda Nighantu, "${name}", ${abs(`/lexicon/${r.slug}/`)}, CC BY 4.0.`,
    `Whole lexicon: ${abs('/lexicon.json')} and ${abs('/lexicon.csv')}.`, '',
    'Educational reference only. A term entry explains what a word means and how it has been',
    'translated. Nothing here is advice.', '');

  return new Response(out.join('\n'), { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
};
