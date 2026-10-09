/**
 * A machine-readable record per page, at the page's URL plus .jsonld.
 *
 * WHY. A survey of the reference sites answer engines measurably cite found one technical habit
 * common to every database among them and absent here: a per-record machine endpoint, advertised
 * from the HTML page. PubChem offers `link rel="alternate" type="application/json"` to a PUG View
 * document per compound. PubMed carries the PMID, PMCID and DOI in citation_* meta and serves
 * efetch per record. Wikipedia points `sameAs` and `mainEntity` at the Wikidata entity and serves a
 * REST summary. The WHO ICD browser is entirely client-rendered and still cited, because its
 * persistent entity URIs and API carry the content.
 *
 * This site had only the markdown twin, which is prose. Everything else was site-level bulk:
 * research.json, taxonomy.json, the knowledge graph, the Parquet files. A consumer wanting the
 * structured facts for one drug had to download a whole dataset and filter it.
 *
 * WHAT THIS IS NOT. It is not a new assertion of anything. Every field here is already published
 * on the HTML page or in a committed dataset; this is the same material addressed per record. Nor
 * is it a general API: these are static files built with the site, so there is no query interface
 * and no freshness question beyond the build.
 *
 * The honest caveat, recorded because the rest of this work is held to it: no engine documents
 * consuming a per-record endpoint from a site like this one, and no study measures its effect. The
 * case for it is that it is what the cited databases do, and that a consumer who wants one record
 * should not have to take a dataset.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { KINDS } from '../../lib/collections';
import taxonomy from '../../data/taxonomy.json';
import names from '../../data/names.json';
import safety from '../../data/safety.json';
import { abs, SITE_NAME, PUBLISHER } from '../../lib/site';
import { pageDates } from '../../lib/dates';

export async function getStaticPaths() {
  const out: any[] = [];
  for (const kind of KINDS) {
    for (const entry of await getCollection(kind)) {
      out.push({ params: { kind, slug: entry.data.slug }, props: { entry } });
    }
  }
  return out;
}

export const GET: APIRoute = ({ props }) => {
  const { entry } = props as { entry: any };
  const d = entry.data;
  const selfUrl = `/${entry.collection}/${d.slug}/`;
  const { published, modified } = pageDates(entry.collection ?? d.kind, d.slug);

  /** External identity, from the committed GBIF crosswalk, exact matches only. */
  const taxa = (taxonomy as any).taxa ?? [];
  const t = taxa.find((x: any) => x.pages?.some((p: any) => p.kind === d.kind && p.slug === d.slug));
  const exact = t && /^(EXACT|ACCEPTED)$/i.test(String(t.matchType ?? ''));
  const identifiers: Record<string, string> = {};
  if (t?.wikidata) identifiers.wikidata = t.wikidata;
  if (t?.gbifKey && exact) identifiers.gbif = String(t.gbifKey);
  if (t?.ncbiTaxid) identifiers.ncbiTaxid = String(t.ncbiTaxid);

  /** Every name form held for this drug, by language. */
  const nameRec = (names as any).pages?.[`${entry.collection}/${d.slug}`] ?? null;
  const nameForms = nameRec
    ? Object.fromEntries(Object.entries(nameRec)
      .filter(([, v]) => Array.isArray(v) && (v as any[]).length)
      .map(([lang, v]) => [lang, (v as any[]).map((x) => ({ name: x.name, iast: x.iast ?? null }))]))
    : null;

  // safety.json keys its records by slug rather than holding an array. Treating it as an array
  // threw on the first page built, which is the right way for that to fail.
  const safetyRec = (safety as any).records?.[d.slug] ?? null;

  const doc: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    '@id': `${abs(selfUrl)}#entity`,
    name: d.title,
    url: abs(selfUrl),
    ...(d.answer ? { description: d.answer } : {}),
    ...(d.botanical ? { alternateName: d.botanical } : {}),
    inDefinedTermSet: { '@type': 'DefinedTermSet', name: SITE_NAME, url: abs('/') },
    ...(Object.keys(identifiers).length ? {
      sameAs: [
        identifiers.wikidata ? `https://www.wikidata.org/wiki/${identifiers.wikidata}` : null,
        identifiers.gbif ? `https://www.gbif.org/species/${identifiers.gbif}` : null,
      ].filter(Boolean),
      identifier: Object.entries(identifiers).map(([k, v]) => ({
        '@type': 'PropertyValue', propertyID: k, value: v,
      })),
    } : {}),
    mainEntityOfPage: {
      '@type': 'WebPage',
      url: abs(selfUrl),
      ...(published ? { datePublished: published } : {}),
      ...(modified ? { dateModified: modified } : {}),
      license: 'https://creativecommons.org/licenses/by/4.0/',
      publisher: { '@type': 'Organization', name: PUBLISHER, url: abs('/') },
      encoding: [
        { '@type': 'MediaObject', encodingFormat: 'text/html', contentUrl: abs(selfUrl) },
        { '@type': 'MediaObject', encodingFormat: 'text/markdown', contentUrl: abs(`/${entry.collection}/${d.slug}.md`) },
        { '@type': 'MediaObject', encodingFormat: 'application/ld+json', contentUrl: abs(`/${entry.collection}/${d.slug}.jsonld`) },
      ],
    },
    /**
     * `additionalProperty` rather than invented top-level keys, so a consumer that knows
     * schema.org can read this without knowing anything about Ayurveda or about this site.
     */
    additionalProperty: [
      ['kind', d.kind],
      ['botanicalFamily', d.family],
      ['ayurvedicCategory', d.ayurvedicCategory],
      ['partsUsed', Array.isArray(d.partsUsed) ? d.partsUsed.join(', ') : d.partsUsed],
      ['pharmacopoeialStatus', d.whoStatus],
      ['taxonomicMatchType', t?.matchType],
      ['hasSafetyRecord', safetyRec ? 'yes' : 'no'],
    ].filter(([, v]) => v).map(([k, v]) => ({ '@type': 'PropertyValue', name: k, value: v })),
    ...(nameForms ? { 'nighantu:nameForms': nameForms } : {}),
    ...(safetyRec ? {
      'nighantu:safety': {
        // A record may exist and say only that no permitted source covers this drug. That is a
        // finding and is carried as one rather than rendered as an empty safety profile.
        ...(safetyRec.insufficientData
          ? { insufficientData: true, reason: safetyRec.insufficientReason ?? null }
          : {
            contraindications: (safetyRec.contraindications ?? []).map((x: any) => x.condition ?? x),
            interactions: (safetyRec.interactions ?? []).map((x: any) => x.drugClass ?? x),
            doseLimits: safetyRec.doseLimits?.text ?? null,
          }),
        note: 'Each statement was checked by four independent reviewers and published only where its source could be confirmed to state it.',
      },
    } : {}),
    isAccessibleForFree: true,
    license: 'https://creativecommons.org/licenses/by/4.0/',
  };

  return new Response(`${JSON.stringify(doc, null, 2)}\n`, {
    headers: { 'content-type': 'application/ld+json; charset=utf-8' },
  });
};
