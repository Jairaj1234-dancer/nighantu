# Provenance

Where the material in this repository comes from, stated precisely enough to be
checked. This document exists because a permanent citable record, once minted, cannot
be quietly corrected, and because a reference work that is vague about its own sources
has no business asking to be cited.

## What this is not

The monographs in `content/` are **not original prose written from scratch.** Any
statement to that effect, in a dataset card, a deposit record or an outreach email,
would be false.

## What they are

Each monograph is a **restructured and extended derivative** of upstream reference
material, assembled by an automated pipeline (`scripts/ingest.mjs`) from a private
working vault and then transformed for publication.

### Upstream sources

**Amidha Ayurveda Herb Database**, used under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This supplies a substantial
part of the identification, classification and pharmacology fields across the herb and
formulation monographs, and is credited in the `sources` field of every page that draws
on it, in the site footer, on `/how-we-source/`, and in every plain-Markdown twin.

**Classical Ayurvedic texts**, cited by name where a page relies on them: the Charaka
Samhita, Sushruta Samhita, Ashtanga Hridaya, Bhavaprakasha Nighantu and Sharangadhara
Samhita. These are historical works in the public domain. The site distinguishes
explicitly between what the Samhitas contain and what is later Kerala practice, rather
than back-dating the latter.

**Pharmacopoeial standards**, named where quoted: the Ayurvedic Pharmacopoeia of India,
the Ayurvedic Formulary of India, the WHO Monographs on Selected Medicinal Plants, and
national pharmacopoeias where a plant is listed.

**Published research**, reported with study type, year and finding as the authors state
them.

### What Age Ayurveda added

- Selection, exclusion and structuring of the published subset.
- A composed definitional summary at the head of every page, built deterministically
  from facts already on that page (`scripts/answer.mjs`).
- Key-facts tables, question-form headings and cross-reference resolution.
- The Shirodhara practice guide in `guides/`, which is original writing.
- Editorial policy, compliance gating and the citation apparatus.

## What is deliberately not published

The private vault is larger than what appears here. Held back: an unreleased product's
commercial documentation, manufacturing process detail, restricted and metallic
(rasa-shastra) preparations, and every tradition outside Ayurveda. `README.md` gives the
full exclusion table and the mechanism that enforces it.

**Not published, and why it matters for licensing:** a corpus of 20,734 classical verses
derived from the SARIT TEI corpus exists in a separate project. It is **CC BY-SA 3.0**,
not CC BY 4.0. It is not part of this repository, and it must not be redistributed under
this repository's licence.

## Licensing

| Path | Licence |
| --- | --- |
| `content/`, `guides/` | [CC BY 4.0](LICENSE) |
| `scripts/`, `src/` | [MIT](LICENSE-CODE) |

Attribute content to: *Age Ayurveda, Age Ayurveda Nighantu*, with a link to the page
used. Because the content incorporates CC BY 4.0 material, attribution to the Amidha
Ayurveda Herb Database must be carried through to any redistribution. See
[LICENSES.md](LICENSES.md).

## Known limitations

Stated here rather than left to be discovered.

- **Research coverage is uneven.** Well-studied herbs carry long research sections; many
  traditional dravyas carry none. That reflects the literature, not the plant.
- **Botanical identity is contested** for a number of classical names, and substitute
  species are widely used in practice. A binomial on a page is the identification our
  sources give, not a resolution of the debate. Where confidence was low, the field is
  left empty rather than guessed.
- **No practitioner has reviewed the monographs line by line.** `/reviewers/` states
  this plainly. Do not cite this work as clinically reviewed, because it is not.
- **The Chyawanprash classical herb count is contested** across sources (45 vs 50 vs 18).
  No page states a number, and the build fails if one appears.

## Corrections

Errors, including in this document, to contact@ageayurveda.com. Corrections are logged
at `/corrections/`.
