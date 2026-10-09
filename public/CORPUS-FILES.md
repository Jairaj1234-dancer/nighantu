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

- 3.18 MB
- sha256 `bdda2c09701117e15d781d8f31d1b0ceabb611333aeb260ee11e5479d0c2d1f6`
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
- sha256 `eecee3d960adf83de5d89a115f5dce55d348c3b4b6c6a6444f1f55c5e100c5ec`
- live copy: https://nighantu.ageayurveda.com/chemistry.json

### `composition.csv`

The composition tables flattened to one row per ingredient.

- 0.41 MB, 1,985 data rows
- sha256 `1741fe7a3f9af1f2a11119d64444fcb34966f4263101f6d5a921a7e6c41167db`
- live copy: https://nighantu.ageayurveda.com/composition.csv

### `composition.json`

The ingredient composition of the classical formulations transcribed from the Ayurvedic Formulary of India, with the quantity the formulary states, the plant part, and the part and entry number it was transcribed from. A cell illegible in the scan is published as illegible.

- 0.54 MB
- sha256 `8000f2a25bc2f69f0b271887123c3d2bbc7fc9d149df7e72f0ec382732026ecc`
- live copy: https://nighantu.ageayurveda.com/composition.json

### `compounds.csv`

The constituents as a table, one row per constituent per monograph.

- 0.31 MB, 838 data rows
- sha256 `8f64639c62a1f4a59537ef4a8aadb6ba0a6ae3ca90d0e0c2716aac7a2416a32b`
- live copy: https://nighantu.ageayurveda.com/compounds.csv

### `compounds.json`

Phytochemical constituents named across the monographs, resolved to PubChem where an identifier exists, with a co-occurrence network computed from the pages themselves.

- 1.33 MB
- sha256 `014f4ee5a229698b9506c75b3adb70badb5a4f9fe4b94d52b1ca8290da0a6c79`
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

- 0.07 MB
- sha256 `40778e839366e7d4fa5b482903f7752703031c43d1acc9f8576ee96305d4b1c5`
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

- 0.86 MB, 2,892 data rows
- sha256 `781c3482b8a7798182011ef86152fb91240eb5e48eec3d046539770be0b39259`
- live copy: https://nighantu.ageayurveda.com/research.csv

### `research.json`

Research papers cited across the site, each with its PubMed ID or DOI, the monographs that cite it, and a tier recording what kind of study it is rather than a verdict on it.

- 1.71 MB
- sha256 `0871c6c5b151aaf2bd53fa1586fcd1ea97a4375bfa32c06049f77e08f60fa39d`
- live copy: https://nighantu.ageayurveda.com/research.json

### `taxonomy.json`

Botanical names resolved against GBIF, each carrying the match type so a fuzzy hit is never read as an exact one.

- 0.17 MB
- sha256 `315a9dc0aba243521ae0a3dbe11f12a8aaf90fefd789693bad93ffac233ffe27`
- live copy: https://nighantu.ageayurveda.com/taxonomy.json

### `verification.json`

The editorial verification ledger: what was checked, by what method, and what was rejected, with the counts computed from the run artefacts rather than stated.

- 0.03 MB
- sha256 `80014003aa21744d7547f919bfe9b15b9397b09dbbff045b58058b805f385bba`
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
