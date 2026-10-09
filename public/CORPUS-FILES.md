# Age Ayurveda Nighantu: open datasets

Concept DOI: https://doi.org/10.5281/zenodo.22805684
Licence: CC BY 4.0
Site: https://nighantu.ageayurveda.com
Canonical version of this page: https://nighantu.ageayurveda.com/CORPUS-FILES.md

A *nighantu* is the classical Ayurvedic lexicon of medicinal substances. These are the machine
readable datasets behind a modern one.

## Why this version exists

Earlier versions of this deposit held a single archive of the project repository. Every dataset
was in there and none of them was individually retrievable, so following the DOI gave you a
source tree rather than the data. This version deposits each dataset as its own file.

## What is in each file

### `access.json`

For every cited paper, the most openly readable copy that could be found: open-access full text where it exists, then PubMed Central, then the DOI.

- 3.17 MB
- sha256 `7c8ed08f5f25aa8b2f7cfe3422ff6a6179afad1cc73d9b20f40736059275d05a`
- live copy: https://nighantu.ageayurveda.com/access.json

### `afi-crosswalk.csv`

The same crosswalk, one row per formulary ingredient row rather than per name, which is the join needed to check a label against the formulary.

- 0.47 MB, 1,973 data rows
- sha256 `9fa153539f78c0a380dee87827f43c61a68f8f8acd3324dd1965afa9a9bda5bd`
- live copy: https://nighantu.ageayurveda.com/afi-crosswalk.csv

### `afi-crosswalk.json`

The Ayurvedic Formulary of India ingredient-name crosswalk: every Sanskrit ingredient name the formulary uses, resolved to a botanical identity where one could be established, with the basis stated per row. Ambiguous names are published as ambiguous and unresolved ones as unresolved.

- 0.90 MB
- sha256 `fdc64de56190e155355e7986a80f4e7968e35eae7c487bd4896a7e8a60b83ecc`
- live copy: https://nighantu.ageayurveda.com/afi-crosswalk.json

### `brand-disclosure.json`

What Indian Ayurvedic manufacturers publish about their own products, measured across their product pages: whether each page names its ingredients, gives a quantity against them, states a dose amount, or cites an authority. Every count carries the page URL it came from.

- 0.13 MB
- sha256 `87500ee528a9111d1db4066c5713dea36f180733f59f11499014eb242329e15c`
- live copy: https://nighantu.ageayurveda.com/brand-disclosure.json

### `chemistry.json`

Constituents resolved against PubChem to a CID, molecular formula, weight and InChIKey, kept apart from compounds.json because an unresolved constituent is a different fact from a resolved one.

- 0.20 MB
- sha256 `249a6087931898a6f3b440099884aa7ede27b850e711e56ca064e1db0ca74668`
- live copy: https://nighantu.ageayurveda.com/chemistry.json

### `composition.csv`

The composition tables flattened to one row per ingredient.

- 0.41 MB, 1,985 data rows
- sha256 `1741fe7a3f9af1f2a11119d64444fcb34966f4263101f6d5a921a7e6c41167db`
- live copy: https://nighantu.ageayurveda.com/composition.csv

### `composition.json`

The ingredient composition of the classical formulations transcribed from the Ayurvedic Formulary of India, with the quantity the formulary states, the plant part, and the part and entry number it was transcribed from. A cell illegible in the scan is published as illegible.

- 0.54 MB
- sha256 `1dd8fae677847af8fbe97e9e8fd5efd68341143db8eadeffb589adec0ac9eeee`
- live copy: https://nighantu.ageayurveda.com/composition.json

### `compounds.csv`

The constituents as a table, one row per constituent per monograph.

- 0.32 MB, 849 data rows
- sha256 `ccc7157fa6349ff8424437adfaa646e84e109e2e780c656b1320ffa95e8ef720`
- live copy: https://nighantu.ageayurveda.com/compounds.csv

### `compounds.json`

Phytochemical constituents named across the monographs, resolved to PubChem where an identifier exists, with a co-occurrence network computed from the pages themselves.

- 1.81 MB
- sha256 `a0bace6f6d30bd7bd6b8339d3f2df968e88abf552326b0e6e9e23d654d95c794`
- live copy: https://nighantu.ageayurveda.com/compounds.json

### `concepts.csv`

The concept records flattened to one row per attributed position.

- 2.06 MB, 461 data rows
- sha256 `19a8b2d284aaa8e51191f46db8e133d5ff4f864270d0d6fa45ad5fcfb26e3195`
- live copy: https://nighantu.ageayurveda.com/concepts.csv

### `concepts.json`

Ayurvedic concept records: contested questions with the competing positions attributed to the sources that hold them, explicit statements of what is not established, and classical citations with the translator and numbering named on each.

- 1.37 MB
- sha256 `37ea263198ac96eb5d61b7caa5981c5122a1f739691a867aef5644ba25598767`
- live copy: https://nighantu.ageayurveda.com/concepts.json

### `dose-comparison.csv`

The dose comparison, one row per compared product page.

- 0.02 MB, 60 data rows
- sha256 `51658787754f18cbb780b45f6c3aa9418c46786eac8574ffea29be944b2ff152`
- live copy: https://nighantu.ageayurveda.com/dose-comparison.csv

### `dose-comparison.json`

Manufacturers' stated doses against the dose the Ayurvedic Formulary of India states for the same classical preparation, with each manufacturer's own wording and the page it was read from. Includes the claims withheld on an adversarial check, with reasons.

- 0.07 MB
- sha256 `2d50b446dfe60c3f98cc83f67c74d0ead7b4fab9dfb32caba2103571adc8ec9c`
- live copy: https://nighantu.ageayurveda.com/dose-comparison.json

### `dravyaguna.csv`

The dravyaguna properties as a table.

- 0.02 MB, 245 data rows
- sha256 `032e9b5d45ecf1332caa9d6f30796b5a812e8d046e2f6fed12a2ffd408c66994`
- live copy: https://nighantu.ageayurveda.com/dravyaguna.csv

### `dravyaguna.json`

Rasa, guna, virya, vipaka and prabhava per monograph, parsed from the published pages so every value can be checked against the page it came from.

- 0.08 MB
- sha256 `96af142efe9c6d512ffb28cdd5cd35430ef7e97ea65136a655d4580a9fd9dbd9`
- live copy: https://nighantu.ageayurveda.com/dravyaguna.json

### `lexicon.csv`

The lexicon flattened to one row per rendering.

- 0.72 MB, 1,631 data rows
- sha256 `881a82549d6eb033a91ca8cda24a12ea2965f851dec67f6354ab6da4e233b934`
- live copy: https://nighantu.ageayurveda.com/lexicon.csv

### `lexicon.json`

Ayurvedic technical terms with every English rendering found for each, the source that uses it, and an assessment of whether the rendering survives the classical passage it claims to render.

- 2.64 MB
- sha256 `7145066570dbff8e9a2f11762c8e8f0745470d659453cdaeb86528c6cd8892ab`
- live copy: https://nighantu.ageayurveda.com/lexicon.json

### `manufacturer-register.csv`

The manufacturer register as a table, with per-crawler permissions as columns.

- 0.02 MB, 164 data rows
- sha256 `cb2724acba927ded45845a56c954499f0da3abae1b3e40b976149cad4351d724`
- live copy: https://nighantu.ageayurveda.com/manufacturer-register.csv

### `manufacturer-register.json`

A register of Indian Ayurvedic manufacturers with the website each publishes, the state it operates from, and what its robots.txt permits, measured one host at a time.

- 0.09 MB
- sha256 `cb16533ccfac5b5d5d9833b98ec4c19497b17805dbdfb03c6f0303b7946d06b4`
- live copy: https://nighantu.ageayurveda.com/manufacturer-register.json

### `parquet_composition.parquet`

The composition tables as Parquet, for columnar querying.

- 0.04 MB
- sha256 `765b29e58c276569d0e40030116b75f8499c777692d9abc479093ea117ae46a8`
- live copy: https://nighantu.ageayurveda.com/parquet/composition.parquet

### `parquet_composition.parquet.json`

The schema sidecar for composition.parquet, used by this project's own Parquet gate.

- 0.00 MB
- sha256 `002ad220cd98a68316f3b0332f15c8dcada7ee856e790be199e5598c08003759`
- live copy: https://nighantu.ageayurveda.com/parquet/composition.parquet.json

### `parquet_compounds.parquet`

The constituents as Parquet.

- 0.05 MB
- sha256 `4051389a1fac7c7c8a999439159ed0a2623eff450fe1c3662d41ea0a6b49f289`
- live copy: https://nighantu.ageayurveda.com/parquet/compounds.parquet

### `parquet_dravyaguna.parquet`

The dravyaguna properties as Parquet.

- 0.01 MB
- sha256 `0e657e304c6d61759fb9da621b7ae8abfbd5f9b58bb05e6a098733ca3972c0c2`
- live copy: https://nighantu.ageayurveda.com/parquet/dravyaguna.parquet

### `parquet_research.parquet`

The research index as Parquet.

- 0.43 MB
- sha256 `3f4c1036f2c1c5215b6e5d89e7862ed892fd0cb51b61c18f1da1c96c7b7a2f11`
- live copy: https://nighantu.ageayurveda.com/parquet/research.parquet

### `parquet_taxonomy.parquet`

The botanical taxonomy as Parquet.

- 0.05 MB
- sha256 `37d79cbd3720fffe63ec31896b9f1299b59d3822c667fb18e043609b18b254b0`
- live copy: https://nighantu.ageayurveda.com/parquet/taxonomy.parquet

### `research.csv`

The research index as a table.

- 0.86 MB, 2,888 data rows
- sha256 `071e3404438e7b501f1f478ef70a030459f748478719343b90e7b1989b242707`
- live copy: https://nighantu.ageayurveda.com/research.csv

### `research.json`

Research papers cited across the site, each with its PubMed ID or DOI, the monographs that cite it, and a tier recording what kind of study it is rather than a verdict on it.

- 1.71 MB
- sha256 `f91c32893e1be7dc5ec35b23def4687823fca932ddea4d22290973275d24b3fc`
- live copy: https://nighantu.ageayurveda.com/research.json

### `taxonomy.json`

Botanical names resolved against GBIF, each carrying the match type so a fuzzy hit is never read as an exact one.

- 0.19 MB
- sha256 `9fa553c445153ce2f7ad5d5357d2f7164bf2bc2bf8ede14e2f83384f4008f7fb`
- live copy: https://nighantu.ageayurveda.com/taxonomy.json

### `verification.json`

The editorial verification ledger: what was checked, by what method, and what was rejected, with the counts computed from the run artefacts rather than stated.

- 0.03 MB
- sha256 `5ab20b4dadc1d91bc35d99788041e4b5d5982cef23aa7331f9956f85b04b00c2`
- live copy: https://nighantu.ageayurveda.com/verification.json

### `verse-numbering.csv`

The verse-numbering crosswalk, one row per equivalence.

- 0.01 MB, 45 data rows
- sha256 `198b4f5628879a728e4691bcab6bc36c7d126387c4201cdb5b5d6dc8b125375d`
- live copy: https://nighantu.ageayurveda.com/verse-numbering.csv

### `verse-numbering.json`

Verse-numbering equivalences between the public-domain English translations of the Charaka and Sushruta Samhitas and the modern standard editions, with the words each source states the equivalence in. Includes the equivalences rejected on an adversarial check, with reasons.

- 0.06 MB
- sha256 `f3568cac63a2c623949949fe769c4d08698fdcb96391e2ab2b9a6683573c99c4`
- live copy: https://nighantu.ageayurveda.com/verse-numbering.json

## What these datasets refuse to do

Three habits run through all of them and are the reason they are worth citing.

A value that could not be established is published as unestablished rather than guessed: an
unresolved formulary name, a botanical match that is fuzzy rather than exact, a quotation nobody
has read against its source. The record says so and keeps the address.

A claim about a named third party carries the evidence for it. Every count in the manufacturer
datasets carries the URL it was read from, and every dose comparison carries the manufacturer's
own wording, so any company named can check its own row.

A rejected finding is published as rejected. verification.json records what was thrown out and
why, the dose comparison carries the claims an adversarial check refused, and the verse-numbering
crosswalk carries the equivalences it would not assert.

## Citation

```bibtex
@dataset{ageayurveda_nighantu,
  title     = {Age Ayurveda Nighantu: a referenced encyclopedia of Ayurvedic materia medica},
  author    = {{Age Ayurveda}},
  publisher = {Zenodo},
  doi       = {10.5281/zenodo.22805684},
  url       = {https://nighantu.ageayurveda.com},
  license   = {CC-BY-4.0}
}
```
