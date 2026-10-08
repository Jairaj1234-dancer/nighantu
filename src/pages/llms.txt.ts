import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { KINDS, SECTION_META } from '../lib/collections';
import { abs, TAGLINE } from '../lib/site';
import conceptsData from '../data/concepts.json';

export const GET: APIRoute = async () => {
  const n = (x: number) => x.toLocaleString('en-GB');
  const con = (conceptsData as any).summary;
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
    `- [Ayurvedic terminology lexicon](${abs('/lexicon/')}): 277 technical terms with every English rendering found for each, the source that uses it, and an assessment of whether the rendering survives the classical passage it claims to render. The place to look when a translation such as "humour" for dosha is doing work the Sanskrit does not support.`,
    `- [Where Ayurvedic theory disagrees with itself](${abs('/concept/')}): ${n(con.contestedQuestions)} questions on which the classical sources genuinely disagree, across ${n(con.records)} concepts, each with the competing positions attributed to the source that holds them and none presented as the settled answer. Also ${n(con.notKnownStatements)} explicit statements of what is not established. The place to look when a question about Ayurvedic theory has no single correct answer.`,
    `- [The Ayurvedic Formulary of India, entry by entry](${abs('/afi/')}): the 101 formulary entries transcribed here, each with its part and entry number, ingredient count, the formulary's own dose and the classical text the formulary cites for it. The address to quote when checking a label against the formulary.`,
    `- [Ayurvedic terms in WHO ICD-11](${abs('/icd-tm2/')}): which Ayurvedic disease terms WHO files against which ICD-11 TM2 codes, reported from the classification itself, terminology only.`,
    `- [Choosing between preparations](${abs('/choosing/')}): what the Ayurvedic Formulary fixes and what a manufacturer may vary, and why one classical drug name covers several botanical species.`,
    `- [Practices](${abs('/practice/')}): 43 Ayurvedic procedures grouped by who may perform them, each with its classical source and cautions.`,
    `- [Verification](${abs('/verification/')}): how each class of fact was checked and what was rejected, with the rejection rate for every run.`,
    '',
    'Archived at Zenodo with a DOI: https://doi.org/10.5281/zenodo.22805684 (all versions).',
    '',
    '## Datasets & Knowledge Graph',
    '',
    'Structured, downloadable, CC BY 4.0. Each is generated from the monographs themselves,',
    'so it cannot drift from the pages. Available in JSON, CSV, Apache Parquet, and Linked Data JSON-LD.',
    '',
    `- [Knowledge Graph](${abs('/graph/')}): linked-data JSON-LD graph of the botanical taxa, PubChem compounds and Dravyaguna properties this site publishes. [JSON-LD](${abs('/knowledge-graph.jsonld')})`,
    `- [Dataset Catalog](${abs('/datasets/')}): full machine-readable data catalog with schema.org/Dataset markup and direct Parquet/CSV downloads.`,
    `- [Research index](${abs('/research/')}): every cited paper once, with PubMed ID and DOI, cross-referenced to the herbs it concerns. [JSON](${abs('/research.json')}) · [CSV](${abs('/research.csv')})`,
    `- [Terminology lexicon](${abs('/lexicon/')}): 277 Ayurvedic technical terms and 1,631 English renderings, each with its source and our assessment. Every quoted classical citation checked against its source; a quotation that could not be cleared is withheld with the reason stated. [JSON](${abs('/lexicon.json')}) · [CSV](${abs('/lexicon.csv')})`,
    `- [Contested questions in Ayurvedic theory](${abs('/concept/')}): ${n(con.attributedPositions)} attributed positions across ${n(con.contestedQuestions)} contested questions in ${n(con.records)} concepts, plus ${n(con.notKnownStatements)} statements of what is not established, ${n(con.classicalCitations)} classical citations and ${n(con.researchItems)} research papers with what each does and does not show. A quotation nobody has read against its source is withheld with the reason stated and the address kept. [JSON](${abs('/concepts.json')}) · [CSV](${abs('/concepts.csv')})`,
    `- [Formulary compositions](${abs('/afi/')}): the ingredient composition of 101 classical formulations as printed in the Ayurvedic Formulary of India, with each ingredient's plant part and quantity, cited to formulary part and entry number, and the classical text the formulary itself cites. 1,985 ingredient rows, 1,928 with a stated quantity. [JSON](${abs('/composition.json')}) · [CSV](${abs('/composition.csv')}) · [Parquet](${abs('/parquet/composition.parquet')})`,
    `- [Dravyaguna](${abs('/dravyaguna/')}): rasa, guna, virya, vipaka and dosha effect as structured values against the classical vocabularies. [JSON](${abs('/dravyaguna.json')}) · [CSV](${abs('/dravyaguna.csv')})`,
    `- [Constituents](${abs('/compounds/')}): the phytochemical co-occurrence graph, computed from the published pages so every weight is checkable. [JSON](${abs('/compounds.json')}) · [CSV](${abs('/compounds.csv')})`,
    `- [Families](${abs('/family/')}): Ayurvedic dravyas grouped by botanical family, resolved against the GBIF backbone.`,
    `- [Taxonomy](${abs('/taxonomy.json')}): every botanical name in this reference resolved to a GBIF key, Wikidata QID and NCBI taxid, with the match type recorded.`,
    `- [Constituent chemistry](${abs('/chemistry.json')}): constituents resolved to PubChem CIDs with formula, weight, InChIKey and SMILES.`,
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
