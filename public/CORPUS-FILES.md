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

- 3.86 MB
- sha256 `af15d4d602d40809dcc02a5e1810ef7c74d0e746c05810c93601ddf8e6ecc418`
- live copy: https://nighantu.ageayurveda.com/access.json

### `afi-crosswalk.csv`

The same crosswalk, one row per formulary ingredient row rather than per name, which is the join needed to check a label against the formulary.

- 0.47 MB, 1,973 data rows
- sha256 `9fa153539f78c0a380dee87827f43c61a68f8f8acd3324dd1965afa9a9bda5bd`
- live copy: https://nighantu.ageayurveda.com/afi-crosswalk.csv

### `afi-crosswalk.json`

The Ayurvedic Formulary of India ingredient-name crosswalk: every Sanskrit ingredient name the formulary uses, resolved to a botanical identity where one could be established, with the basis stated per row. Ambiguous names are published as ambiguous and unresolved ones as unresolved.

- 0.90 MB
- sha256 `529e56fbe5cda1aa4ff108f806710478043836256b2bf70606c8fce6ab5bb028`
- live copy: https://nighantu.ageayurveda.com/afi-crosswalk.json

### `afi-crosswalk.pdf`

The formulary ingredient crosswalk as a typeset document, generated from afi-crosswalk.json so it cannot disagree with it. It carries the canonical address, the DOI and the Wikidata entity on page one.

- 0.24 MB
- sha256 `2f98d875b973e764923d0270fd1a838c5cccca67eda50a92cedcf12d5830d137`
- live copy: https://nighantu.ageayurveda.com/afi-crosswalk.pdf

### `bhavaprakasha.csv`

The Bhavaprakasha Nighantu index as a table, one row per entry.

- 0.05 MB, 1,009 data rows
- sha256 `3718c22d69e7b5b3837e9b60130cfa5b9f5535dfad1e3d42ea1576e174cc3fe6`
- live copy: https://nighantu.ageayurveda.com/bhavaprakasha.csv

### `bhavaprakasha.json`

Every entry of the 24 chapters (varga) of the Bhavaprakasha Nighantu with its verse numbers, as given in the e-Nighantu edition (NIIMH, for CCRAS), and the site herb pages identified as the same dravya. Headwords and verse numbers only; no verse text.

- 0.09 MB
- sha256 `b6910fdcbc89a020c38f044d5e49848397aa0c0c334e528263bde4e877ff48e0`
- live copy: https://nighantu.ageayurveda.com/bhavaprakasha.json

### `brand-disclosure.json`

What Indian Ayurvedic manufacturers publish about their own products, measured across their product pages: whether each page names its ingredients, gives a quantity against them, states a dose amount, or cites an authority. Every count carries the page URL it came from.

- 0.13 MB
- sha256 `edfcf8bf708c3b6742b64558068531b801505822f75394f7ec495a1a4b06394d`
- live copy: https://nighantu.ageayurveda.com/brand-disclosure.json

### `chemistry.json`

Constituents resolved against PubChem to a CID, molecular formula, weight and InChIKey, kept apart from compounds.json because an unresolved constituent is a different fact from a resolved one.

- 0.20 MB
- sha256 `c6fa00d204be1b68e76412939b1e54485c6c234e4b36d171d3ec39f2cf5d2cfb`
- live copy: https://nighantu.ageayurveda.com/chemistry.json

### `composition.csv`

The composition tables flattened to one row per ingredient.

- 0.41 MB, 1,985 data rows
- sha256 `1741fe7a3f9af1f2a11119d64444fcb34966f4263101f6d5a921a7e6c41167db`
- live copy: https://nighantu.ageayurveda.com/composition.csv

### `composition.json`

The ingredient composition of the classical formulations transcribed from the Ayurvedic Formulary of India, with the quantity the formulary states, the plant part, and the part and entry number it was transcribed from. A cell illegible in the scan is published as illegible.

- 0.54 MB
- sha256 `353e8e0bc52f74cc8977cb08c455fdfd4d27973c8c43dcf37b93c13dae704cb9`
- live copy: https://nighantu.ageayurveda.com/composition.json

### `compounds.csv`

The constituents as a table, one row per constituent per monograph.

- 0.29 MB, 816 data rows
- sha256 `2d2ea647b7e0a1fcba29eab70fb111e59d80a182533ee93dbc50896e81a82a68`
- live copy: https://nighantu.ageayurveda.com/compounds.csv

### `compounds.json`

Phytochemical constituents named across the monographs, resolved to PubChem where an identifier exists, with a co-occurrence network computed from the pages themselves.

- 1.72 MB
- sha256 `c7fdd4ce2ae3b114e7f7974e20d3b503cb344dd7f29c6e8ef0e49411d89812b7`
- live copy: https://nighantu.ageayurveda.com/compounds.json

### `concepts.csv`

The concept records flattened to one row per attributed position.

- 2.05 MB, 461 data rows
- sha256 `800163c8d67205a0b3957a799b15d131abde630b71fdb8e8bda07536e98e944e`
- live copy: https://nighantu.ageayurveda.com/concepts.csv

### `concepts.json`

Ayurvedic concept records: contested questions with the competing positions attributed to the sources that hold them, explicit statements of what is not established, and classical citations with the translator and numbering named on each.

- 1.37 MB
- sha256 `57773486d35ea5d36112ef1b38edcad43ad4a8b4d10f31c8b45698ed671fb043`
- live copy: https://nighantu.ageayurveda.com/concepts.json

### `disclosure-exclusions.json`

Product pages the disclosure survey matched to a formulary preparation by name that on review are not that preparation (blog articles, other product forms, different formulas sharing a head name). One row is one excluded page URL with the preparation it was filed under and the reason.

- 0.01 MB
- sha256 `116a7d7a42cbc1aa9992ab5be057026643bd12422b7efdbb08957c62b22d2aa0`
- live copy: https://nighantu.ageayurveda.com/disclosure-exclusions.json

### `dose-comparison.csv`

The dose comparison, one row per compared product page.

- 0.03 MB, 129 data rows
- sha256 `1f54a334ca632a7dda98371517404936015aaa7fc8007b20070bd9efc82a2700`
- live copy: https://nighantu.ageayurveda.com/dose-comparison.csv

### `dose-comparison.json`

Manufacturers' stated doses against the dose the Ayurvedic Formulary of India states for the same classical preparation, with each manufacturer's own wording and the page it was read from. Includes the claims withheld on an adversarial check, with reasons.

- 0.12 MB
- sha256 `73343639981c669869fa8d88b753361ecb3f4ee0862562386dd00f412214c665`
- live copy: https://nighantu.ageayurveda.com/dose-comparison.json

### `dravyaguna.csv`

The dravyaguna properties as a table.

- 0.03 MB, 246 data rows
- sha256 `8db0b1c506bd0f0c85b53d98d3c762c20d72a16b2af9aca054a1bea57a5c6b26`
- live copy: https://nighantu.ageayurveda.com/dravyaguna.csv

### `dravyaguna.json`

Rasa, guna, virya, vipaka and prabhava per monograph, parsed from the published pages so every value can be checked against the page it came from.

- 0.08 MB
- sha256 `21ce331addd756e22e7b48695ff4508314e3c09ac40ddb2b4df8b8069dad6071`
- live copy: https://nighantu.ageayurveda.com/dravyaguna.json

### `lexicon.csv`

The lexicon flattened to one row per rendering.

- 0.72 MB, 1,631 data rows
- sha256 `e1790b73c38b486d6a398ed3a70202f204e80655c876d32d4ba53014d5fc4e28`
- live copy: https://nighantu.ageayurveda.com/lexicon.csv

### `lexicon.json`

Ayurvedic technical terms with every English rendering found for each, the source that uses it, and an assessment of whether the rendering survives the classical passage it claims to render.

- 2.63 MB
- sha256 `e95e538b983f7332b2d6b8a9b76fcb546924582ee936d1e174f96d522fda6074`
- live copy: https://nighantu.ageayurveda.com/lexicon.json

### `manufacturer-register.csv`

The manufacturer register as a table, with per-crawler permissions as columns.

- 0.03 MB, 197 data rows
- sha256 `b312ddf3de9abca1319904e83dd30f11c58617fefd0a6287c046500345231c13`
- live copy: https://nighantu.ageayurveda.com/manufacturer-register.csv

### `manufacturer-register.json`

A register of Indian Ayurvedic manufacturers with the website each publishes, the state it operates from, and what its robots.txt permits, measured one host at a time.

- 0.10 MB
- sha256 `2d44225db5aa85fe57fd1ae7f0499f0d64733367f762ad592b77f62567f5f840`
- live copy: https://nighantu.ageayurveda.com/manufacturer-register.json

### `parquet_composition.parquet`

The composition tables as Parquet, for columnar querying.

- 0.04 MB
- sha256 `15187ea4014e25fc43a9b95c0c86af3e806483dbfa11d2f4dec7d358b8c951f2`
- live copy: https://nighantu.ageayurveda.com/parquet/composition.parquet

### `parquet_composition.parquet.json`

The schema sidecar for composition.parquet, used by this project's own Parquet gate.

- 0.00 MB
- sha256 `8bd8cd1932e4af8a807131d34d1c61ce69e3fa53f6115c08caf2d4f756a687f3`
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

- 1.09 MB, 3,590 data rows
- sha256 `78f583f472452688c2ba63d03644b8328f3c86d242c07c0a1f578b43922f91da`
- live copy: https://nighantu.ageayurveda.com/research.csv

### `research.json`

Research papers cited across the site, each with its PubMed ID or DOI, the monographs that cite it, and a tier recording what kind of study it is rather than a verdict on it.

- 2.13 MB
- sha256 `fa07d0ff1862ebf7a8f70163cb86986f5d822fc771a906fab31fec390c2ce0eb`
- live copy: https://nighantu.ageayurveda.com/research.json

### `taxonomy.json`

Botanical names resolved against GBIF, each carrying the match type so a fuzzy hit is never read as an exact one.

- 0.19 MB
- sha256 `7e6dacb3960ea67b60c637250b880f14dfe597563f3e5b4f741c90c4dc42321a`
- live copy: https://nighantu.ageayurveda.com/taxonomy.json

### `verification.json`

The editorial verification ledger: what was checked, by what method, and what was rejected, with the counts computed from the run artefacts rather than stated.

- 0.03 MB
- sha256 `3eb22998a38cbbabb2b698b026bf259c6cf5fed8c456b5f5eafd1bf867c5c629`
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
