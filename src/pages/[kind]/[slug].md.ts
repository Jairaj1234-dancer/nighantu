import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { KINDS } from '../../lib/collections';
import safety from '../../data/safety.json';
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
  for (const kind of [...KINDS, 'practice' as const]) {
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

  const body = [
    `# ${d.title}`,
    '',
    `> ${d.answer}`,
    '',
    ...(facts.length ? ['## Key facts', '', ...facts.map(([k, v]) => `- **${k}:** ${v}`), ''] : []),
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
