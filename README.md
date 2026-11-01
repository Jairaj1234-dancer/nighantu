# Nighantu

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22805684.svg)](https://doi.org/10.5281/zenodo.22805684)

A static reference encyclopedia of Ayurvedic herbs, classical formulations and instruments,
published by Age Ayurveda. It is deliberately separate from the Shopify storefront and never touches it.

Zero-cost to run: static output on GitHub Pages, built by GitHub Actions.

## How it works

The source of truth is a private Obsidian vault at `~/Desktop/Reference/Herb-Catalogue`.
The vault is never committed and is never copied wholesale. `scripts/ingest.mjs` walks an
explicit allow list and writes only the approved subset into `content/`, which **is**
committed. Anything in `content/` is published.

```
scripts/config.mjs      all policy: allow list, deny list, thresholds, redactions
scripts/ingest.mjs      vault -> content/ (the only path in)
scripts/answer.mjs      composes the 40-60 word answer block on each page
scripts/stamp-dates.mjs stable per-page published/modified dates
scripts/audit.mjs       compliance gate; fails the build on a violation
scripts/linkcheck.mjs   verifies every internal link in dist/
scripts/indexnow.mjs    submits CHANGED urls to Bing/Yandex/Naver/Seznam
scripts/monitor.mjs     the daily detection sweep
scripts/monitors/       one module per check
scripts/lib/            state, http, issue filing, dashboard rendering

scripts/lib/safety.mjs      safety record schema and validator (the publish gate)
scripts/lib/sources.mjs     the source allowlist: nothing else may ground a safety claim
scripts/safety-worklist.mjs which pages need safety data, in risk order
scripts/apply-safety.mjs    workflow output -> data/safety.json, via the validator
scripts/dravyaguna.mjs      parses rasa/guna/virya/vipaka out of the monographs
scripts/compounds.mjs       constituent co-occurrence graph, computed from content/
scripts/safety-refresh.mjs  quarterly: are published safety sources still saying it
scripts/crawl-audit.mjs     crawlability gate
scripts/verification.mjs    builds the published verification ledger from run artifacts
scripts/api-index.mjs       extracts botanical identities from the API text (no agent tokens)
scripts/apply-identity.mjs  workflow output -> binomials + substance classes, re-checked here
scripts/apply-composition.mjs workflow output -> AFI composition tables, re-checked here
scripts/icd-tm2.mjs         WHO ICD-11 TM2 terminology crosswalk (needs a free ICD API key)
scripts/slim-runs.mjs       redacts and shrinks run output before it is committed
scripts/test/               negative tests; every one injects a fault and expects a failure

guides/                 hand-written guide pages (the Shirodhara hub)
content/                generated, committed, published
data/                   monitor state
data/runs/              slimmed verification-run records (raw output is gitignored)
```

## Section counts

| Section | Pages |
| --- | --- |
| Herbs | 504 |
| Formulations | 143 |
| Instruments | 37 |
| Reference | 53 |
| Classical texts | 2 |
| Glossary | 14 |
| Shirodhara guide | 13 |
| **Built total** | **779** |

## Commands

```bash
npm run ingest:dry     # show the publish set and the deny set, write nothing
npm run ingest         # regenerate content/ from the vault
npm run stamp          # refresh the page date ledger
npm run build          # stamp + audit + astro build
npm run verify         # ledger check + audit + link check, after a build
npm run monitor:dry    # run every monitor, open no issues
npm run indexnow:dry   # show which URLs would be submitted
npm run dev            # local dev server

node scripts/safety-worklist.mjs --stats   # which pages need safety data, in risk order
node scripts/apply-safety.mjs <panel.json> # validate + publish a panel's output
node scripts/dravyaguna.mjs --dry-run      # parse the pharmacology tables, write nothing
node scripts/verification.mjs --dry-run    # rebuild the ledger, write nothing
node scripts/slim-runs.mjs                 # redact + shrink run output before committing
node scripts/test/safety.test.mjs          # negative tests for the safety validator
```

## What is excluded, and why

| Excluded | Reason |
|---|---|
| `Chyawanprash-Royale/**` | Unreleased SKU. Pricing economics, competitive matrix, launch roadmap, formulation SOP, regulatory dossier, packaging spec. |
| `Manufacturing-RnD/**` | Process IP. |
| `Toxic-Restricted-Herbs/**` | Rasa-shastra metallic and mineral preparations. A consumer-facing reference carrying detailed mercury and heavy-metal monographs is an unnecessary liability. |
| TCM, Unani, Siddha, Western herbalism, mushrooms, nutraceuticals | Out of scope for this site and retained as internal reference. |
| `### Manufacturing Notes` / `Process` inside published pages | Same class of process IP as the private tree; stripped at subsection level so it cannot leak through a herb monograph. |

Hub pages cross-reference traditions this site does not publish. Their `## TCM`, `## Global`,
`## Nutraceutical` and `## Manufacturing` sections are stripped, and any list item whose link
target is unpublished is removed outright rather than degraded to plain text, so nothing leaks
by name.

## Compliance gates

`scripts/audit.mjs` runs before and after every build and exits non-zero on any violation.

1. No published file may originate from a denied vault path.
2. No commercial strings (COGS, MRP, landed cost, competitive matrix, launch roadmap).
3. No cross-tradition leakage.
4. No heritage framing (Baidyanath, 1917) on the editorial site. On a reference site it
   undercuts neutrality.
5. No wikilink syntax may survive into published content.
6. Every page has an answer block of a sensible length.
7. No herb count for Chyawanprash while the classical source is contested (45 vs 50 vs 18), and
   no Bhasma-plus-pregnancy guidance on those pages. Counts are also redacted at ingest.
8. No disease term or claim verb inside a product module. Exact product titles are exempted
   from this scan because product names are fixed and are never changed to fix a claim.

All three gates have been negative-tested: each fails on an injected fault and passes clean.

## Verification

Every class of fact has a documented procedure and a published rejection rate at
`/verification/`. The counts there are computed from the run artifacts in `data/runs/`,
never typed in, so a wrong number on the page means a wrong script.

| Run | Examined | Published | Rejected |
|---|---|---|---|
| Botanical identity | 256 | 108 | 148 |
| Botanical identity, Pharmacopoeia-anchored pass | 126 | 46 binomials + 107 substance classes | 48 |
| AFI compositions | 135 | 48 | 54 rejected, 29 not in the formulary |
| Research citations | 1,251 | 496 | 755 |
| Safety, first attempt | 83 | 0 | 83 |
| Safety, second attempt | 25 | 1 | 24 |
| Safety, third attempt | 24 | 1 | 23 |
| Safety, fourth attempt | 23 | 3 | 19 |

Two findings are worth knowing before reading anything else here.

**The citation pass found that every research bullet on the site was a paraphrase.** None
carried a PubMed ID, DOI or exact title, so none could be checked. 496 were resolved to real
papers and 755 were deleted. Pages that lost material say so.

**The first safety run was rejected in full by its own audit.** A four-lens judge panel
accepted 25 records; a meta-judge then re-read three of those acceptances and rejected all
three, for defects including a dropped instruction to monitor liver enzymes, a source misread
in the reassuring direction, and a study's adverse findings reported as absent. Nothing was
published. The second pass repaired the records against rules written from those exact
defects and audited every one individually; one passed.

That yield is low because the standard is strict and the per-preparation literature for
Ayurvedic metallic preparations is mostly silent. The remaining records are unfinished, not
discarded, and they are held in `data/runs/`.

**What the four passes actually established.** After three passes, every record that had
passed did so with `insufficientData: true`, and it looked as though no preparation-specific
record could survive. Pass four told the rebuilders exactly that and asked them to drop claims
the literature does not support rather than defend them. The result corrected the finding: of
the three records that then published, one is preparation-specific and one is mixed. Bhanga
(*Cannabis sativa*) and Eranda (*Ricinus communis*) have real clinical literature and a real
EMA herbal monograph respectively, and their records hold up.

So the rule is not "insufficient data always wins". It is that a record passes when the
evidence genuinely exists and fails when it does not, and for most bhasmas it does not: there
is no monograph, no elemental analysis, no clinical study and no dose, so anything framed as
being about *that* preparation is unsupportable and gets caught. Where that is the case, the
honest shape publishes: nothing is known about this preparation, here is exactly what was
searched and what it returned, and here is the documented hazard for the class, every
statement labelled `class-level`.

Two things from pass four are worth keeping in view. A record that passed its audit in an
interrupted attempt was held when the same audit ran again, which is the documented instability
of repeated model judgements rather than any change in the evidence; it is treated as held,
because for safety a rejection outweighs an earlier acceptance. And a record that cleared the
audit was then refused by the schema validator for a missing field and claim-shaped wording,
which is why panel acceptance has never been sufficient on its own.

Once published, a record is re-checked quarterly by `.github/workflows/safety-refresh.yml`.
It does not re-judge claims; it asks whether every cited source still resolves, still lands on
an allowlisted host after redirects, and still says what it said. A revised LiverTox entry
opens an issue rather than failing a build, because that is a case for a person to read.

### Safety records

A safety statement cannot reach a page unless it survives both gates:

1. **The judge panel**, which decides whether it is true.
2. **`validateRecord` in `scripts/lib/safety.mjs`**, which decides whether it is well formed:
   every source on the allowlist, every `sourceId` resolving, every severity and status in its
   enum, every statement carrying a `scope` of `preparation-specific` or `class-level`, and a
   heavy-metal statement present on any metallic or mineral preparation.

`insufficientData` is a valid and often correct state: no source describes this preparation,
here is the class-level evidence, correctly scoped. Silence is not a valid state. Coverage is
enforced by a ratchet in `data/safety-baseline.json` rather than a fixed target, so finished
work cannot regress while unfinished work is still in progress.

## External identifiers

Every botanical and constituent name is resolved against public registries, cached in
`data/enrichment/` and committed, so a rebuild makes no network requests and CI cannot
fail on a provider outage.

| Layer | Resolved | Source |
|---|---|---|
| Botanical names | 241 | GBIF Backbone Taxonomy |
| Wikidata QIDs | 228 | Wikidata |
| NCBI taxonomy ids | 236 | NCBI Taxonomy |
| Constituents | 466 of 852 | PubChem PUG-REST |

This costs no agent tokens at all, which is the point. A taxon key is not a judgement:
the name resolves or it does not, the answer is the same every time, and anyone can check
it in one request. Compare the safety layer, where four passes of agent research and
adversarial audit produced five records. Both prices are correct for what they buy.

**GBIF pays twice.** It reports how it matched, so it re-checks the botanical work for
free. It found three journal titles sitting in the `botanical` field, caught a
misspelling (*Onosma bracteatum* for *bracteata*), and flagged 25 names as taxonomic
synonyms. Where it disagrees, pages show both names and label the relationship rather
than rewriting either: the classical literature uses the older names.

**Identifiers appear only on EXACT matches.** A fuzzy or higher-rank hit is a guess, and a
guess rendered as a registry link reads as a fact.

**Two things that do not work, tested and recorded so they are not tried again.** GBIF's
vernacular search resolves "Vacha" to *Eutropiichthys vacha*, a fish, and "Shatavari" to
the wrong *Asparagus* while reporting a vernacular match; it is safe for confirming a
binomial, never for discovering one. And a bare PubMed query on an Ayurvedic name returns
mostly noise, because "Vacha" is also the surname Vácha: 626 hits become 42 under
`[Title/Abstract]`.

`scripts/lib/identifiers.mjs` checks every identifier against its own grammar before
publication, negative-tested in CI. A malformed identifier is worse than a missing one,
because it renders as a link, looks authoritative and resolves to nothing.

## Deployment

Push to `main`. The workflow audits, builds, link-checks and deploys to GitHub Pages.

Site URL and base path come from `ATLAS_SITE` and `ATLAS_BASE`, set in the workflow. The
move to `nighantu.ageayurveda.com` is one command once the DNS CNAME exists:
`./scripts/use-subdomain.sh nighantu.ageayurveda.com`. It refuses to run until DNS
actually resolves, so it cannot break the live site by going early.

## Machine-readable surface

- `robots.txt`, `sitemap-index.xml`, an RSS feed, `llms.txt` and `llms-full.txt`.
- A plain-Markdown twin of every page at its URL with `.md` appended, naming its canonical HTML URL.
- Per page: a short answer block, a key-facts table, a citation block and JSON-LD. Deliberately
  not `MedicalWebPage`, `Drug` or `MedicalIndication` schema, which invite a regulatory reading of
  educational text.
- Downloadable datasets under CC BY 4.0, generated from the monographs so none can drift from the
  pages.
- `scripts/crawl-audit.mjs` gates every page in the sitemap for a canonical, a title, description
  and h1, parseable JSON-LD, and full rendering with JavaScript off.

## Automation

Runs on GitHub Actions cron, which is free and unlimited on public repos and, unlike any
local scheduler, survives the machine being closed.

| Workflow | When | What |
| --- | --- | --- |
| `deploy.yml` | on push | build, three gates, deploy, submit changed URLs |
| `monitor.yml` | daily 01:43 UTC | health, product links, competitor specs, freshness, public feeds |
| `search-health.yml` | Mondays 06:41 UTC | Bing Webmaster figures |

Findings become GitHub issues labelled `monitor`.

Three design points worth knowing before changing anything:

- **The monitor commits on every run, even when nothing changed.** Scheduled workflows in a
  public repo are auto-disabled after 60 days of no repository activity, and only commits
  reliably reset that timer. The heartbeat file is what keeps the automation alive.
- **Nothing posts to a community platform.** The feed monitor reads public RSS and files an
  issue. Reddit's Data API terms bar commercial use without a licence, and a domain-level
  ban would poison every future mention of the site.
- **IndexNow submits only changed URLs.** Resubmitting unchanged ones earns throttling and
  host deprioritisation. `scripts/stamp-dates.mjs` exists partly to make page hashes stable
  enough for that to work.

Credentials are optional and each job degrades gracefully without them. See
[SETUP-CREDENTIALS.md](SETUP-CREDENTIALS.md).

## Licensing

Content is [CC BY 4.0](LICENSE); scripts and site code are [MIT](LICENSE-CODE). Brand,
product names and product photography are not licensed.

Monograph text incorporates material from the Amidha Ayurveda Herb Database under
CC BY 4.0, and that attribution travels with any redistribution. Full statement, including
what is deliberately not published and where the work is weakest, in
[PROVENANCE.md](PROVENANCE.md) and [LICENSES.md](LICENSES.md).
