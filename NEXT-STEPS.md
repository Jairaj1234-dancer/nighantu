# What to do next, in order

Everything here is free. Items 1 to 3 need your login or your registrar and cannot be done for
you. Item 4 onward is work I can do once you say go.

Current state: the Nighantu is live at **https://nighantu.ageayurveda.com** with 902 pages,
a published verification ledger at `/verification/`, structured datasets, a DOI
(10.5281/zenodo.22805684) and an ICD-11 terminology crosswalk. It serves its own
`robots.txt`, `llms.txt` and IndexNow key from its own origin. Bing is verified. Nothing on
the web links to it yet, and Google does not know it exists.

---

## 1. ~~Add the DNS record~~ DONE, 18 September 2026

`nighantu` is a CNAME to `jairaj1234-dancer.github.io.` at GoDaddy, the custom domain is
registered with GitHub Pages, the certificate is issued and HTTPS is enforced. The site
moved with `./scripts/use-subdomain.sh nighantu.ageayurveda.com`, which rewrote every
internal link, the canonicals, the sitemap and the JSON-LD node ids, and copied the
IndexNow key into this repo because it previously lived only on the old origin.

The old `jairaj1234-dancer.github.io/nighantu/` still serves. Leave it for a few weeks so
anything holding the old IndexNow key location keeps resolving.

## 2. Register with search engines (20 minutes)

**Already done, no login needed: IndexNow.** All 778 URLs have been pushed to Bing directly
(HTTP 200) and through the IndexNow aggregator, which fans out to Yandex, Naver and Seznam. A
self-generated key is hosted at the host root, and `scripts/indexnow.mjs` now runs automatically
after every deploy, so new and changed pages are pushed without anyone doing anything.

This matters because Bing feeds ChatGPT's search results, so the fastest route into an answer
engine did not need an account at all.

**Still needs your login:** Google has no equivalent. Search Console is the only way in, and
Request Indexing is the fastest way to get a new site crawled.

The subdomain is live, so do this once, on the real domain.

**Google Search Console** at https://search.google.com/search-console

1. Add property. Either **Domain** (`nighantu.ageayurveda.com`, verified by a DNS TXT record
   at GoDaddy, which also covers future subpaths) or **URL prefix**
   (`https://nighantu.ageayurveda.com/`).
2. Verify. DNS is easiest now that you own the domain: GoDaddy, Add New Record, type TXT,
   host `nighantu`, value the string Google gives you.
3. Sitemaps, submit `sitemap-index.xml`.
4. URL Inspection, paste the homepage URL, click **Request indexing**. Do the same for
   `/shirodhara/` and `/shirodhara/choosing-equipment/`. This is the fastest way to get a brand
   new site crawled.

**Bing Webmaster Tools** at https://www.bing.com/webmasters

Already verified on the old origin. Add `https://nighantu.ageayurveda.com/` as a second
property; the verification file is served from the new origin too, so it verifies at once. Worth doing anyway for
the reporting: you can import directly from Search Console once that is set up, which takes about
a minute, and Bing will then show you which of the submitted URLs it actually indexed. If you do
sign up, keep the existing key rather than generating a new one:
`bf9a6ad9a651b9775c941d4fd074a13a`.

---

## 3. Link to it from the Shopify store (5 minutes)

You confirmed this is acceptable since it is a Navigation setting rather than a theme edit.

In Shopify admin: **Online Store, then Navigation**. Edit the **Footer menu**, click **Add menu
item**.

- Name: `Ayurvedic herb reference`
- Link: `https://nighantu.ageayurveda.com`

Use the footer rather than the main menu. It is the lower-risk placement, it is a normal thing
for a brand to have, and it carries the same signal.

**Why it matters.** This one link is what tells Google and the answer engines that the store and
the reference work are the same brand. Without it they are two unrelated sites that happen to
mention each other. It is also, right now, the only inbound link the Nighantu would have.

Anchor text tip: do not use "click here". Use words you want the site associated with.

---

## 4. Then the traffic work

A separate research pass is enumerating free, one-person-deployable channels: entity and
knowledge-graph presence, open-data and DOI hosting, community participation, free product
listings, video, syndication and inbound links. That output supersedes this section when it
lands.

Two things worth knowing in advance, independent of that research:

- **Nothing links to the site.** Crawlers find pages by following links. Item 3 fixes the count
  from zero to one. Getting to a handful of genuine links is the difference between being
  crawled in days and being crawled in months.
- **A citation baseline is recorded** in `data/citation-log.csv`, currently a clean zero. Re-run
  the panel at 30 and 90 days to see movement. On a new domain, meaningful change usually takes
  8 to 12 weeks, so do not read a flat result at week 3 as failure.

To run the full 53-prompt panel you need one API key, and any of four providers now works:

```bash
GEMINI_API_KEY=... node scripts/geo-audit.mjs      # free tier, and Google Search grounding
ANTHROPIC_API_KEY=sk-... node scripts/geo-audit.mjs
```

Gemini with Google Search grounding is the closest available proxy for Google AI Overviews,
and it costs nothing, so the baseline no longer waits on a paid key.

Without a key, `node scripts/geo-audit.mjs --list` prints the panel to run by hand.

---

## 5. The safety layer, which is the largest unfinished thing

**Where it stands: 1 of 504 herb pages carries a published safety record.** That is not a
stalled pipeline; it is what a strict standard produces against a literature that is mostly
silent at the level of the individual preparation. The full account is at `/verification/`
and the run records are in `data/runs/`.

In priority order:

1. **Finish the 24 held records.** Each has an auditor's line-by-line objections in
   `data/runs/feedback/`, and most objections are single, precisely-identified and mechanically
   fixable: a quote truncated before its caveat, a denominator that should read "of samples
   containing lead" rather than "of samples", an invented methodological detail. Several
   auditors said explicitly that the safety substance passed and only one claim was wrong.
2. **The remaining 59 priority pages.** The first run examined 83; the 9 marked inconclusive
   never got a full panel, and the rest were rejected on the merits and need re-researching
   rather than repairing.
3. **The other 421 herb pages**, in the risk order `scripts/safety-worklist.mjs` already
   computes.
4. **Formulations and devices have no safety path at all.** 143 and 37 pages respectively.
   The worklist only walks `content/herb/`.
5. ~~A scheduled refresh.~~ **Done.** `.github/workflows/safety-refresh.yml` runs quarterly
   and re-checks every published record against the sources it cites: still reachable, still
   resolving to an allowlisted host after redirects, and still saying what it said last time.
   It files an issue rather than failing, because a revised LiverTox entry is exactly the case
   a person should read. It does not re-judge claims; that still needs the agent panel.

**Budget warning, from experience.** Each full pass costs roughly 3 to 4 million subagent
tokens and about an hour of wall clock, and session limits interrupted every run so far. The
work resumes cleanly from cache, but plan for several sittings rather than one.

## 6. Depth work that is ready but not started

All of this is data already in hand, verified as present, and not yet published. Sizes are
measured, not estimated.

| Asset | Size | State |
|---|---|---|
| Formulation ingredients with proportions and roles | ~~1,017 rows~~ | **Done, from a better source.** The companion DB's rows are AI-curated and unverified, so the Ayurvedic Formulary of India was transcribed instead: 48 pages, 721 rows, cited to part and entry. 54 transcriptions were rejected by their verifiers and are repairable from the notes in `data/runs/afi-composition.json`; 29 formulations are genuinely not in AFI Parts I or II. |
| Compound co-occurrence graph | 710 nodes, weighted edges | In the vault at `_Hub/Compounds/`, currently flattened into glossary rows. Publishable close to as-is. |
| Panchakarma procedures | ~~73 rows~~ | **Done.** 43 published at `/practice/`, 12 held by the grounding auditor. Note: `content/practice/` has no vault source, so `ingest.mjs` now excludes it from the clear step or a re-ingest deletes the section. |
| Disease entities with ICD-11 TM2 codes | 140 rows | **Blocked, and the premise was wrong.** Only 1 of the 140 rows carries a TM2 code at all, and that code (`SK04.0`) does not exist in the WHO 2026-01 release, which was downloaded and checked. WHO's public files carry only English TM2 titles; the Sanskrit index terms that would make a crosswalk live behind the ICD API, which needs a free account (`scripts/icd-tm2.mjs --fetch`, reading `~/.who-icd-api`). Decision taken: publish a terminology crosswalk only, no symptoms, causes or treatment, because the rows' treatment content is disease-claim shaped. |
| 99 unpublished Dravyaguna tables | 99 pages | Lost to word-count thresholds rather than policy. Lowering `THRESHOLDS.herb` recovers them, but publishes 99 thin pages to do it; better to extract their pharmacology into the dataset without giving each a URL. |
| Compound co-occurrence graph | ~~710 nodes~~ | **Done.** Recomputed from the published corpus at `/compounds/`: 852 constituents, 22,176 co-occurring pairs, every weight checkable against the pages it counts. |

**Not doing, and why:** the 20,734-verse Sanskrit corpus (English column empty on every row,
and CC BY-SA 3.0 share-alike collides with the site's CC BY 4.0); the 103 machine-readable
diagnostic patterns (clinical decision rules on `llm-only` provenance); the Hindi product
monographs (SKU-branded, and Hindi is low-resource enough that queries get pivoted to English
anyway).

## 6b. External identifiers: done, and what it exposed

279 botanicals carry GBIF keys, 264 Wikidata QIDs and 272 NCBI taxids (up from 241/228/236
when the Pharmacopoeia pass added names to resolve); 466 constituents carry PubChem CIDs. 34 family browse pages at `/family/`. All cached and committed, so
rebuilds are free. Zero agent tokens.

Worth knowing before planning more of this:

- **Only 6 of the 252 uncited pages have a botanical to search PubMed with.** The other
  246 are 102 formulations, which have no binomial by nature, and 150 herbs whose
  identity is contested or unexamined. So a species-based citation top-up will not close
  that gap; it needs name-based search, and a bare name query is noisy enough to be
  dangerous (see the Vácha surname problem in the README).
- **33 groups of pages resolve to the same species and are not distinguished by plant
  part**, covering 39 redundant pages. `neem` and `nimba`, `turmeric` and `haridra`,
  `manjishtha` and `manjistha` are one drug with several URLs. That splits a subject
  across near-identical pages, which is bad for a reader and worse for retrieval, because
  an index that clusters near-duplicates picks a representative arbitrarily. Some of the
  33 are genuinely separate drugs from one species (nutmeg and mace, lotus flower and
  rhizome) and must not be merged.

## 7. Two data-quality items found and not yet fixed

- ~~202 herb pages still have no botanical name.~~ **Second pass done**, anchored to the
  Ayurvedic Pharmacopoeia of India (Part I, Vols I-VI, in `sources-private/`, indexed by
  `scripts/api-index.mjs`). 46 names published with their monograph citation, 107 pages
  labelled as what they actually are (bhasma, rasa preparation, salt, animal product,
  formulation, isolate) and 7 as honestly unsettled. 156 herb pages still have no binomial;
  most are minerals and preparations where none applies. The first pass had also stopped
  partway through the alphabet, leaving 53 pages unexamined; those are now done.
- **Some herb photographs are of the wrong plant.** `image-credits.csv` in the Ayurmahotsav
  folder marks `herb_Ashwagandha.jpg` as verified and describes it as ginger root, and
  `herb_Haritaki.jpg` as sun-dried bananas. Roughly 20 to 25 of the 51 images are genuinely
  the right plant and correctly credited. Do not bulk-import: on a site whose whole claim is
  verified botanical identity, a mislabelled photograph is the exact failure it exists to
  prevent.

---

## Still open

- ~~A named reviewer.~~ **Partly done, 18 September 2026.** Dr. Awadesh Pratap Singh, BAMS, of
  the Shree Baidyanath Research Institute reviewed the Shirodhara guide and the practice
  section, 56 pages, and passed them. Each carries his name and the date, and names him in its
  structured data; `/reviewers/` states the scope and is the only page allowed to name the
  institution, since the heritage gate blocks that framing everywhere else. **The ~800
  monographs remain unreviewed** and are the open front.
- **Chyawanprash facts.** The classical herb count is contested across sources and the Bhasma in
  pregnancy question is unresolved. Counts are redacted automatically until settled.
- **The Surya one-pager** still carries the false "only portable Shirodhara device" claim.
  Corrected copy is at `~/Desktop/Surya-Shirodhara/Dropship-Kit/positioning-correction.md`.
