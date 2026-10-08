# Licences

This repository is dual-licensed by path.

| Path | Licence | File |
| --- | --- | --- |
| `content/`, `guides/` | Creative Commons Attribution 4.0 International | [LICENSE](LICENSE) |
| `scripts/`, `src/`, `astro.config.mjs` | MIT | [LICENSE-CODE](LICENSE-CODE) |
| `data/` | CC BY 4.0, as generated records | [LICENSE](LICENSE) |

## Attributing this work

> Age Ayurveda. *Age Ayurveda Nighantu*. https://nighantu.ageayurveda.com/

Every page carries a suggested citation with its canonical URL and the date it was last
revised. Machine-readable metadata is in [CITATION.cff](CITATION.cff).

## Upstream attribution you must carry forward

The monograph content incorporates material from the **Amidha Ayurveda Herb Database**
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). CC BY is not a
one-way door: if you redistribute or adapt this content, that upstream credit travels
with it, alongside credit to Age Ayurveda.

The classical texts quoted and cited (Charaka Samhita, Sushruta Samhita, Ashtanga
Hridaya, Bhavaprakasha Nighantu, Sharangadhara Samhita) are historical works in the
public domain.

## What is not covered

**Product names, the Age Ayurveda name and marks, and product photography** are not
licensed by this repository. The Shopify CDN images referenced in
`src/data/products.json` remain the property of Age Ayurveda. The CC BY grant covers
the reference text, not the brand.

**The SARIT-derived classical verse corpus is CC BY-SA 3.0** and is deliberately not
part of this repository. Do not assume this repository's licence extends to it. See
[PROVENANCE.md](PROVENANCE.md).

**The terminology lexicon quotes sources under several licences.** `/lexicon/` and
`src/data/lexicon.json` carry 1,631 English renderings of Ayurvedic terms, and the renderings do
not share one licence. 523 are from Kaviratna's *Charaka* or Bhishagratna's *Sushruta* and are
public domain. 595 are from the WHO International Standard Terminologies on Ayurveda, the NIA
Jaipur / WHO-APW draft, ICD-11, or the Government of India NAMASTE lists, and are reproduced on
the pages unaltered, attributed and linked, and are deliberately absent from
`public/lexicon.json` and `public/lexicon.csv` on the same reasoning as ICD-11 below. 300 are from
journals, modern textbooks and commercial sites, which are not cleared for quotation at all: the
English equivalent each one uses is reported as a fact about usage and the source's own wording is
not reproduced. Which class a rendering belongs to is stamped on it as `licence`.

Two consequences worth stating plainly. A locator in the downloads is reduced to its identifier,
because `ITA-9.8.7` is a pointer and the definition printed after it is not. And an `assessment` is
this project's own critical prose, as are `distinguishFrom`, `mistranslations` and `openQuestions`.
All four are offered under CC BY 4.0, but where any of them quotes a source briefly in order to
discuss it those quoted words stay under their own licence and are not granted here: quotation for
comment is not a derivative work, and sub-licensing someone else's wording would be. That is a
claim, so it is checked: `scripts/lexicon-dataset.mjs` refuses to write the downloads if a
twenty-word run of any NoDerivs or uncleared definition appears inside those fields.

**WHO ICD-11 terms and titles are CC BY-ND 3.0 IGO**, not CC BY 4.0. The crosswalk at
`/icd-tm2/` reproduces WHO's Ayurvedic index terms, codes and category titles unaltered,
attributed and linked, which is what the NoDerivs licence permits. They are deliberately
absent from `public/` and from every downloadable dataset, because those are offered under
CC BY 4.0 and invite the modification WHO's licence forbids. `src/data/icd-tm2.json` holds
only what the page renders. Source: WHO ICD-11 for Mortality and Morbidity Statistics,
2026-01, Module II, https://icd.who.int/browse/2026-01/mms/en
