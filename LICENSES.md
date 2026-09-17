# Licences

This repository is dual-licensed by path.

| Path | Licence | File |
| --- | --- | --- |
| `content/`, `guides/` | Creative Commons Attribution 4.0 International | [LICENSE](LICENSE) |
| `scripts/`, `src/`, `astro.config.mjs` | MIT | [LICENSE-CODE](LICENSE-CODE) |
| `data/` | CC BY 4.0, as generated records | [LICENSE](LICENSE) |

## Attributing this work

> Age Ayurveda. *Age Ayurveda Nighantu*. https://jairaj1234-dancer.github.io/nighantu/

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

**WHO ICD-11 terms and titles are CC BY-ND 3.0 IGO**, not CC BY 4.0. The crosswalk at
`/icd-tm2/` reproduces WHO's Ayurvedic index terms, codes and category titles unaltered,
attributed and linked, which is what the NoDerivs licence permits. They are deliberately
absent from `public/` and from every downloadable dataset, because those are offered under
CC BY 4.0 and invite the modification WHO's licence forbids. `src/data/icd-tm2.json` holds
only what the page renders. Source: WHO ICD-11 for Mortality and Morbidity Statistics,
2026-01, Module II, https://icd.who.int/browse/2026-01/mms/en
