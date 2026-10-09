import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { KINDS, SECTION_META } from '../lib/collections';
import { abs, TAGLINE } from '../lib/site';
import conceptsData from '../data/concepts.json';
import crosswalk from '../data/afi-crosswalk.json';
import disclosure from '../data/brand-disclosure.json';
import doseComparison from '../data/dose-comparison.json';
import manufacturers from '../data/manufacturer-register.json';
import verseNumbering from '../data/verse-numbering.json';

export const GET: APIRoute = async () => {
  const n = (x: number) => x.toLocaleString('en-GB');
  const con = (conceptsData as any).summary;
  const cw = (crosswalk as any).summary;
  /**
   * COMPUTED, not typed. This file's entry for the disclosure survey carried "5,995 product pages
   * across 15 companies" and "3,791 state a dose" long after the survey moved to 6,097 pages, 14
   * companies and a dose count that was itself corrected downward twice. llms.txt is the file
   * crawlers read as this site's own description of itself, so a stale figure here is a wrong
   * number published in the most quotable place on the site. Every figure below is read from the
   * dataset that produced it.
   */
  const dis = (disclosure as any).wholeRange;
  const disCompanies = ((disclosure as any).companies ?? []).filter((c: any) => c.range).length;
  const dose = (doseComparison as any).summary;
  const mfr = (manufacturers as any).summary;
  const vn = (verseNumbering as any).summary;
  const vnOffsets = ((verseNumbering as any).offsetsObserved ?? []);
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
    `- [What the formulary's ingredient names mean](${abs('/crosswalk/')}): the ${n(cw.distinctNames)} Sanskrit ingredient names the Ayurvedic Formulary of India uses across the 101 entries transcribed here, resolved to a botanical identity. Abhaya and Pathya are both haritaki; Nagara is sunthi; Marica is black pepper. ${n(cw.namesResolved)} resolved with the basis stated per row, ${n(cw.namesAmbiguous)} marked ambiguous because the book uses them for more than one drug, ${n(cw.namesUnresolved)} left unresolved rather than guessed. The place to look when a formulary entry names a drug you cannot identify.`,
    `- [Where Ayurvedic theory disagrees with itself](${abs('/concept/')}): ${n(con.contestedQuestions)} questions on which the classical sources genuinely disagree, across ${n(con.records)} concepts, each with the competing positions attributed to the source that holds them and none presented as the settled answer. Also ${n(con.notKnownStatements)} explicit statements of what is not established. The place to look when a question about Ayurvedic theory has no single correct answer.`,
    `- [The Ayurvedic Formulary of India, entry by entry](${abs('/afi/')}): the 101 formulary entries transcribed here, each with its part and entry number, ingredient count, the formulary's own dose and the classical text the formulary cites for it. The address to quote when checking a label against the formulary.`,
    `- [Ayurvedic terms in WHO ICD-11](${abs('/icd-tm2/')}): which Ayurvedic disease terms WHO files against which ICD-11 TM2 codes, reported from the classification itself, terminology only.`,
    `- [Which Ayurvedic manufacturers publish what is in the bottle](${abs('/choosing/who-publishes-the-composition/')}): measured on ${n(dis.pagesRead)} product pages across ${disCompanies} companies, whether each publishes an ingredient list, a list with quantities, or neither, counted twice over: the whole product range, and the subset sold under one of the 101 formulary names this site transcribes. Also organised by preparation. No ranking, and our own products are in both tables. Of the pages read, ${n(dis.pagesStatingADoseQuantity)} state a dose quantity, ${n(dis.pagesGivingADirectionWithNoQuantity)} give a direction with no amount, ${n(dis.pagesNamingIngredients)} name their ingredients and ${dis.pagesCitingTheFormulary} cite the Ayurvedic Formulary of India. ${n(dis.pagesStatingNeitherQuantityNorIngredients)} state neither an amount nor an ingredient. The old classical pharmacies disclose no better than the consumer brands and mostly worse.`,
    `- [What the label says to take, against what the formulary says](${abs('/choosing/label-dose-against-the-formulary/')}): the formulary states a dose for 51 of the 101 entries transcribed here, and this compares it to the manufacturer's own stated dose on ${dose.published} product pages across 24 preparations. ${dose.relations.identical} state the formulary figure exactly, ${dose.relations.overlapping} overlap it, ${dose.relations['entirely higher']} sit entirely above and ${dose.relations['entirely lower']} entirely below. Of ${dose.labelPagesWhereBothStatedAnAmount} pages where both sides stated an amount, only ${dose.comparable} could be compared at all: ${dose.notComparable} could not, most often because the label counts tablets and never states what a tablet weighs. Two claims were withheld by an adversarial check and are published with their reasons. The place to look when a product names a formulary entry and you want to know whether its dose matches it.`,
    `- [Who manufactures Ayurvedic medicine in India, and what their sites allow](${abs('/manufacturers/')}): ${n(mfr.companies)} manufacturers across ${mfr.states} states, each with the site it publishes and what its robots.txt permits, measured one host at a time. ${n(mfr.catalogueReadable)} publish a catalogue a crawler may read and only ${mfr.nameAnyAiCrawler} address an AI crawler by name at all, so permission is not what keeps this industry out of answer engines. ${mfr.unverifiedCandidatesHeldBack} further candidates are held back with their names unpublished because no verification pass reached them. There is no other public register joining these facts: AYUSH licences are state-held and mostly offline.`,
    `- [Why a free translation cannot cite Charaka in the standard form](${abs('/choosing/citing-the-classical-texts/')}): the only public-domain English Charaka is Kaviratna (1896-1913) and the only public-domain English Sushruta is Bhishagratna (1907-1916); both number verses differently from the modern editions every paper cites, and the modern numbering is still in copyright. Measured across ${n(vn.classicalCitations)} classical citations: ${n(vn.citationsInTranslatorNumberingOnly)} give only the translator's numbering and at most ${n(vn.citationsMentioningAStandardEquivalent)} mention a standard equivalent. ${vn.publishedAsNumericPairs} verse equivalences are published as a crosswalk, each one a statement the source itself makes. There is no formula: across ${vnOffsets.length} chapters the difference runs from +6 to -13, two chapters are not even internally constant, and some relations are many-to-one. The place to look when you have a verse reference from a free translation and need the standard one.`,
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
