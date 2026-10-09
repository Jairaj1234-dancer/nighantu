import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { KINDS } from '../../lib/collections';
import safety from '../../data/safety.json';
import names from '../../data/names.json';
import { abs } from '../../lib/site';

/**
 * Plain-Markdown twin of every monograph. Several crawlers and agents prefer a
 * raw text source over parsing HTML, and it costs nothing to serve both.
 *
 * Serving both does have one real cost: it creates a near-duplicate pair for every
 * page, and a retrieval index that clusters near-duplicates picks ONE representative
 * without asking us which. If it picks the .md twin, citations land on a page with no
 * navigation and no markup. So each twin names its canonical HTML URL in the body.
 *
 * A `Link: rel="canonical"` HTTP header would be the correct mechanism, but GitHub
 * Pages serves these as static files and drops response headers set at build time.
 * An in-body declaration is what is actually available here, so that is what this does.
 */
export async function getStaticPaths() {
  const out: any[] = [];
  // 'practice' is not in KINDS, which drives the section indexes, but it is a monograph
  // kind for this purpose: its pages are cited and CiteThis offers a .md twin for them.
  for (const kind of [...KINDS, 'practice' as const, 'choosing' as const]) {
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

  const rec = (safety as any).records?.[d.slug];
  const sourceTitle = (ids: string[] = []) => {
    const byId = new Map((rec?.sources ?? []).map((x: any) => [x.id, x]));
    const names = ids.map((i) => byId.get(i)).filter(Boolean).map((x: any) => `${x.title}, ${x.url}`);
    return names.length ? ` (${names.join('; ')})` : '';
  };

  const safetyLines: string[] = [];
  if (rec) {
    safetyLines.push('## Safety, contraindications and cautions', '');
    if (rec.insufficientData) {
      safetyLines.push(`No authoritative safety data was found for this entry. ${rec.insufficientReason}`, '');
    }
    if (rec.pregnancy) safetyLines.push(`- **Pregnancy:** ${rec.pregnancy.status}${rec.pregnancy.note ? ` — ${rec.pregnancy.note}` : ''}${sourceTitle(rec.pregnancy.sourceIds)}`);
    if (rec.lactation) safetyLines.push(`- **Breastfeeding:** ${rec.lactation.status}${rec.lactation.note ? ` — ${rec.lactation.note}` : ''}${sourceTitle(rec.lactation.sourceIds)}`);
    if (rec.heavyMetals?.text) safetyLines.push(`- **Heavy metal content:** ${rec.heavyMetals.text}${sourceTitle(rec.heavyMetals.sourceIds)}`);
    for (const c of rec.contraindications ?? []) safetyLines.push(`- **Contraindication (${c.severity}):** ${c.condition}${c.note ? ` — ${c.note}` : ''}${sourceTitle(c.sourceIds)}`);
    for (const x of rec.interactions ?? []) safetyLines.push(`- **Interaction (${x.severity}):** ${x.drugClass}${x.mechanism ? ` — ${x.mechanism}` : ''}${sourceTitle(x.sourceIds)}`);
    for (const a of rec.adverseEffects ?? []) safetyLines.push(`- **Adverse effect:** ${a.effect}${a.frequency ? ` (${a.frequency})` : ''}${sourceTitle(a.sourceIds)}`);
    if (rec.doseLimits?.text) safetyLines.push(`- **Dose and duration limits:** ${rec.doseLimits.text}${sourceTitle(rec.doseLimits.sourceIds)}`);
    safetyLines.push('', 'Each statement above was checked by four independent reviewers and published only if its source could be confirmed to state it.', '');
  }

  const canonical = abs(`/${entry.collection}/${d.slug}/`);

  /**
   * THE NAMES IN THE INDIAN LANGUAGES, which this twin was silently dropping.
   *
   * src/data/names.json holds 3,761 name forms across fifteen languages for 270 monographs, with a
   * source cited per name, and NameForms.astro renders the whole table on the HTML page. The
   * markdown twin carried none of it: a survey in October 2026 found Devanagari in 1 of roughly 650
   * herb and formulation twins, and in that one only by accident.
   *
   * That matters more than a missing section usually would, because llms.txt tells AI crawlers the
   * twin is the canonical plain-text version of the page. A crawler that takes the route this site
   * recommends was being handed a page with the multilingual table removed, which is the one part
   * of a monograph a reader who knows the drug by another name actually needs. The lexicon's twins
   * already carry their Devanagari and IAST forms; this copies that.
   *
   * The source is carried per language rather than per name to keep the block readable, and the
   * script forms are given before the transliterations because the script is the identifying thing.
   */
  const nameBlock: string[] = [];
  const nameRec = (names as any).pages?.[`${entry.collection}/${d.slug}`];
  if (nameRec) {
    const labels: Record<string, string> = (names as any).languages ?? {};
    const order: string[] = (names as any).languageOrder ?? Object.keys(nameRec);
    const lines: string[] = [];
    for (const lang of order) {
      const arr = nameRec[lang];
      if (!Array.isArray(arr) || !arr.length) continue;
      const forms = arr
        .map((x: any) => [x.name, x.iast && x.iast !== x.name ? `(${x.iast})` : null].filter(Boolean).join(' '))
        .filter(Boolean);
      if (!forms.length) continue;
      lines.push(`| ${labels[lang] ?? lang} | ${forms.join(', ').replace(/\|/g, '\\|')} |`);
    }
    if (lines.length) {
      nameBlock.push(
        '## Names in the Indian languages', '',
        'Every name form this project holds for this drug, with the script form first and the',
        'transliteration after it. Sources per name are on the canonical page.', '',
        '| Language | Names |', '| --- | --- |', ...lines, '',
      );
    }
  }

  const body = [
    `# ${d.title}`,
    '',
    `> ${d.answer}`,
    '',
    ...(facts.length ? ['## Key facts', '', ...facts.map(([k, v]) => `- **${k}:** ${v}`), ''] : []),
    ...nameBlock,
    entry.body?.trim() ?? '',
    '',
    ...safetyLines,
    '---',
    '',
    `Canonical version of this page: ${canonical}`,
    '',
    ...(d.sources?.length ? ['## Sources', '', ...d.sources.map((s: string) => `- ${s}`), ''] : []),
    'Published by Age Ayurveda in the Nighantu. Educational reference only, not medical advice.',
    'Incorporates material from the Amidha Ayurveda Herb Database under CC BY 4.0.',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
