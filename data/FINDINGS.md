# What has already been measured, decided and built

_Hand-maintained, not generated. Committed to the repo rather than published, like
`DASHBOARD.md`. Competitor analysis is deliberately **not** here: it lives in gitignored
`measurement/`, and this file points at it rather than restating it._

**Read this before proposing work.** On 12 October 2026 a single session was about to rebuild the
brand crawler, rebuild the comparative layer, re-decide a decision that was already published, and
fix four bugs that were already fixed. It also built a recommendation on a citation figure that
exists nowhere, and recommended two link assets that were already live. Six times, in one day. The
cost was not wasted tokens, it was nearly publishing a duplicate of a live page.

That is not an acquisition problem. This project has measured a great deal and has no index of it,
so the findings are spread across gitignored `measurement/`, a dozen `data/*.json` files, script
docstrings, plan files and 400-line content pages. This file is the index. Keep it current in the
same commit as the work, and give every number a date and a path to its evidence.

---

## 1. Numbers that must not be quoted without their source

| Claim | Status |
|---|---|
| "Bing cited 26 pages 144 times in fifteen days" | **TRUE, and found on 14 Oct.** It comes from Bing Webmaster's **AI Performance** report, a different surface from the AI Search Queries report. Cumulative citations through 2 Oct are 145, and the first day with data is 19 Sep, so "144 in fifteen days" reconciles exactly. On 12 Oct this was declared unsourced and unusable because it was not in the repo and because the AI Search Queries export holds only one grounding query. **That was an over-correction, and an expensive one: it was used to argue Bing was not an AI-citation channel and to rewrite the strategy away from it.** Not being able to find a source is not evidence that a measurement is wrong. |
| "45 recorded citations, 37 of them to two pages" | **Wrong.** The four citation logs hold 291 prompt rows, **27** of them cited, carrying **34** citations, every one to `ageayurveda.com`. Counted 13 Oct from `data/citation-log*.csv`. |
| "1,342 compound graph edges" | **Wrong.** `src/data/compounds.json` reports **22,084** edges over 838 compounds, 188 linkable. The converged figures that matter to the deploy gate are in `src/data/chemistry.json`: 838 constituents, **455** resolved. |

Two of the three figures carried in from memory were genuinely wrong, and the third was right and
was wrongly dismissed. So this table has two jobs, and the second one matters as much as the first:
**record the claim and the result of checking it, not a verdict reached by failing to find it.**
Write "could not find a source for this, treat with caution" and keep looking. Do not write
"wrong".

Anything that cannot be traced to a file belongs in this table, not in a recommendation.

---

## 2. What is built, so that it is not built again

### Measurement readers (all local, never in CI: the repo is public and these read our own scoreboard)
| Script | Answers |
|---|---|
| `gsc-coverage.mjs` | Google's coverage state per URL, from the Search Console URL Inspection API. `--out`, `--resume`, archives the reading it replaces. |
| `gsc-coverage-diff.mjs` | What moved between two coverage snapshots: state transitions on the intersection, first crawls, per-section, canonical changes, a `--watch` list. |
| `bing-coverage.mjs` | Whether Bing holds a URL, from `GetUrlInfo`. Weekly series under launchd. |
| `bing-performance.mjs` | Which pages Bing actually **shows**, from `GetPageStats` / `GetQueryStats` / `GetRankAndTrafficStats`. Checks both lists against the site daily totals and says when they do not add up. |
| `market-map.mjs` | Who an answer engine cites across a whole topic, and whether they hold it by selling or by explaining. Use `--reps 3`; at `--reps 1` every share is understated by roughly half. |
| `snippet-experiment.mjs` | The 399/403 difference-in-differences cohorts for the meta-description rewrite. |
| `brand-disclosure.mjs` | Writes `src/data/brand-disclosure.json` and `public/brand-disclosure.json`. `--check` is a deploy gate. |

### The comparative layer: **built and live**
- `content/choosing/who-publishes-the-composition.md` (420 lines) holds the method, the per-company
  counts and the per-preparation table. Measured on 6,097 product pages across 20 companies.
- `content/choosing/label-dose-against-the-formulary.md` sets 22 manufacturers' stated doses against
  the formulary's.
- `public/brand-disclosure.json` publishes the whole measurement, with the URL of every page read.
- `src/components/Disclosure.astro` renders the per-preparation comparison on the **63** formulation
  monographs the dataset covers, beneath the formulary entry (added 12 Oct).
- The named companies are in `COMPETITORS` in `scripts/monitors/config.mjs`, so the standing
  correction offer is machine-kept.
- `src/pages/editorial-standards.astro` and `about.astro` were amended in October to say that some
  pages compare named commercial products, with the five rules. The amendment states plainly what
  the page used to promise.

### The brand survey: **collected, do not re-crawl**
`data/brands/` (gitignored) holds `register.json` (197 companies, robots verdict per host),
`products.json`, `products-wave2.json`, `products-extended.json` (**7,662 product records across 78
hosts**) and `cache/` (**3.3 GB of the HTML as served**). Collected 8 to 10 October.
`src/data/manufacturer-register.json` is the committed summary.

### Link and citation assets: **all live. There is nothing left to build here.**
Checked end to end on 13 Oct. Two link assets were recommended that morning as unpulled levers and
both turned out to be already deployed, which is why this table exists in this form.
| Asset | State |
|---|---|
| Zenodo DOI `10.5281/zenodo.22805684` | v2.0.0, 10 Oct 2026, **43 files**, indexed in OpenAIRE, related-work "is derived from" pointing at the site. Per-dataset deposit, not a repo archive. |
| Wikidata `Q141494735` | Instance of database, `official website` → `nighantu.ageayurveda.com`, DOI statement present. |
| `/datasets/` | Emits `DataCatalog` with nested `Dataset` nodes, `sameAs` the DOI and the Wikidata item. |
| `robots.txt` | Maximally permissive: every AI crawler named and allowed. Nothing to fix. |
| `/llms.txt`, `/llms-full.txt` | Published. |
| Wikidata `Q141494601` | The organisation item, separate from the database item. |
| Site-wide entity markup | `dist/index.html` asserts `WebSite.sameAs` → the database item, `Organization.sameAs` → the store, this site and the organisation item, and a `Dataset` node carrying the DOI as `identifier` and `sameAs`. |

So every identity assertion inside this repo's control is made. The remaining link work is all
off-repo and is listed in section 6.

---

## 3. What has been measured

### Google: the constraint is crawl, and the cause is almost certainly links
- **Baseline 10 Oct, 1,239 URLs** (`data/coverage/gsc-baseline-2026-10-10.json`): 686 indexed, 452
  "Discovered, currently not indexed", 94 unknown, 4 crawled-not-indexed, 3 alternate-canonical.
- **All 452 "Discovered" pages have a null `lastCrawlTime`.** Google has never fetched them, so no
  property of those pages can explain why it has not read them. On 11 Oct thinness, duplication and
  internal linking were each tested against indexing and each came back negative. **Those three
  test outputs were never written to a file**, so the specific spreads and similarity figures exist
  only in a session transcript and should be re-derived rather than quoted. The one finding that is
  checkable from the repo stands on its own: `/compounds/` is linked from the site footer, so every
  page links to it (1,240 as of 13 Oct), and it has never been crawled. GSC `referringUrls` is
  unreliable and reports 0 for that page.
- **Of the 101 formulation pages carrying the AFI compositions, 59 have never been crawled and 42
  are indexed.** `/formulation/chyawanprash/` and `/formulation/triphala-churna/`, the two
  highest-demand formulations, are both uncrawled. So is `/afi/`. So is `/datasets/`.
- **The crawl calendar is two bursts:** 184 pages on 18 Sep, 363 on the 19th, 58 on the 20th, 15 on
  the 21st, then **nothing for seventeen days**, then 14 on 8 Oct, 56 on the 9th, 3 on the 10th. The
  October restart began before the lastmod fix went live, so the restart is not evidence for it.
- **Bing reports zero inbound links to the domain** (`GetLinkCounts` → `{"Links":[],"TotalPages":0}`,
  `GetConnectedPages` → `[]`, checked 13 Oct). Treat a zero from an API as weaker evidence than a
  positive number, but no link-building has ever been done, so zero is plausible. 546 never-fetched
  pages on a 1,240-page subdomain that nothing points at is the expected outcome, not a puzzle.

### Google's AI features DO surface this site, and our own panel never saw it
From the Search Console "Performance on Search, Generative AI Features" export, 17 Sep to 11 Oct
(`measurement/gsc-genai/`):
- **382 impressions over 25 days across 184 pages.** First non-zero day 27 Sep, peak **101 on
  4 Oct**, last seven days 54, 8, 13, 41, 39, 30, 28, so roughly **30 a day**. 318 of the
  impressions are India, 288 mobile. The export carries impressions only, no clicks.
- **All 184 pages were "Submitted and indexed" in the 10 Oct coverage baseline. Every single one.**
  So Google's AI surface draws only from the indexed set, which makes the crawl problem directly and
  quantifiably the AI-citation problem: 686 of 1,240 pages are indexed, and the other 554 cannot
  appear in an AI answer at all, whatever is written on them.
- **The profile is the opposite of Bing's.** Herb monographs take 131 pages and 302 of the 388
  page-attributed impressions; formulation takes 31 pages and 58. Concentration is low: the top page
  is 4% and the top ten 26%, against Bing where one page is 39% and the top three are 60%. **Only 15
  of these 184 pages overlap with the 57 Bing shows.** The two engines surface almost disjoint sets,
  so "what works" has no single answer and a recommendation drawn from one engine does not transfer.
- What unites them is the *kind* of query, not the collection: the herbs winning impressions are
  obscure Sanskrit names (ushira, parpataka, jayapala, gorochana, mochras, tintidika, madanaphala,
  matsyakshi, tumburu, chavya, devadali, satyanashi), which is the same rare-terminology demand the
  Bing keyword report shows. Lexical coverage of terms nobody else has a page for is the asset.
- `vamshalochana` is in that list, and it is the page whose botanical has no source. A page with a
  known data defect is being served into Google's AI answers, which moves that fix up the list.
- **Caveat on provenance.** `Filters.csv` records only `Search type, Web (text-based)` and
  `Date, Last 28 days`. The generative-AI scoping is asserted by the export's filename and is not
  in the file, so treat the AI attribution as the UI's claim rather than as something verified here.
- **No API.** Hand-exported, like the Bing AI report.

### Bing: ranks us well, shows us rarely
From `bing-performance.mjs`, 18 Sep to 10 Oct (`measurement/bing-queries/`):
- **991 impressions, 20 clicks, CTR 2.02%**, 18 of 23 days active. Compare Google's snippet baseline:
  position 9.8 to 11.3, CTR 0.5% to 0.65%.
- **Every impression is in positions 1 to 10.** 38 in 1-3, 107 in 4-10, zero beyond. The constraint
  is demand volume, not rank.
- By collection: **formulation 24 pages / 406 impressions, herb 26 pages / 99**, root 15,
  dravyaguna 3, device 1, reference 1. **Lexicon 0. Concept 0. Family: only the hub.** The lexicon's
  zero is confounded, those 277 pages were published 7 to 8 October; concept and family are not.
- **The endpoints truncate: per-page rows sum to 53% of the site total, per-query to 22%.** Treat
  both as the top of the list over a sample of days, never as a census.
- `/formulation/sitopaladi-churna/` alone is **39%** of attributed impressions and the top three
  pages are 60%. Any month-on-month comparison of the site total is noise.
- Query demand is specialist and often misspelled, and brand-plus-formulation queries already reach
  us: `dhootapapeshwar sitopaladi choorna hindi uses` at position 4,
  `oushadhi dhanwantaram tailum pharmaayush` at 10.
- **Bing's AI surface is the channel that actually works, and it is an order of magnitude more
  active than the blue links.** From the **AI Performance** export, 19 Sep to 11 Oct:
  **239 AI citations over 23 days**, citations on 18 of those 23 days, peaking at **58 citations
  across 12 cited pages on 2 Oct**, and the last seven days averaging **11.6 a day**. Over almost
  exactly the same window the ordinary search surface produced **20 clicks**. So this content is
  being consumed by Copilot roughly twelve times as often as it is being clicked, which is what
  this project was built to do.
  - The comparison columns are useless: `Prev Date` is `1/1/0001`, the .NET `DateTime.MinValue`
    sentinel that `scripts/lib/bing-coverage.mjs` already has a floor guard for, and every
    `Prev Citations` is 0. There is no previous period, this is the first.
  - **The AI Search Queries report is not the same thing and badly understates it.** It lists one
    grounding query, `sitopaladi churna benefits`, with 6 citations and a share rounding to 0.00%,
    against 239 citations on the AI Performance report for an overlapping period. Treat the query
    report as heavily thresholded and never as a total.
  - **There is no API for this.** `GetAIPerformanceStats`, `GetAICitationStats`, `GetCopilotStats`,
    `GetAIStats` and `GetGroundingQueryStats` all return 404. It has to be exported by hand from
    Bing Webmaster Tools as `..._AIPerformanceCompareOverviewStats_<date>.csv`. Exports are kept in
    gitignored `measurement/bing-queries/`.

### Citations: zero, on both engines
- **Distinguish our instrument from the phenomenon. This was got wrong twice in two days.** Our own
  panel finds no citations: 291 prompt rows across the four citation logs, 27 cited, 34 citations,
  every one to `ageayurveda.com` and none to this site (counted 13 Oct); the brand-comparison market
  map, 50 questions at `--reps 3`, not cited on any; monograph, composition and property intents
  0 of 120 asks. **Those are synthetic prompts through the Gemini API, and they are not Google
  Search.** The production surfaces, measured by the two reports above, show 382 Google AI-feature
  impressions and 239 Bing AI citations over the same weeks. "Our panel sees nothing" was twice
  reported as "the engine does not surface us". It does not follow, and it was wrong both times.
- The brand-comparison market map, 50 questions at `--reps 3` on 12 Oct: **not cited on any
  question**. Incumbent shares are in gitignored `measurement/`, not here.
- Monograph, composition and property intents scored **0 of 120 asks** on Gemini. The designated
  negative control scored 33%.
- **Consequence for planning, corrected twice on 14 Oct.** Both engines have an outcome measure
  with signal, and neither is the citation panel: **239 Bing AI citations** and **382 Google
  AI-feature impressions** over the same few weeks. Those two hand exports are the baselines any
  experiment should be read against. The citation panel measures the Gemini API, which has returned
  zero throughout and has no demonstrated relationship to either production surface.

### Answer blocks and corpus integrity
Across 802 answers: 1 filler opener (`vamshalochana`), **0** gate violations, 0 under the 10-word
floor, 0 em dashes, 0 list dumps, 0 bibliography fragments, 0 apparatus, 0 dosing fragments.
`answerViolations(answer, {kind})` in `scripts/lib/answer-safety.mjs` is the gate.

### Build determinism
`build-downloads.sh` runs `compounds.mjs` twice and pass 2 used to merge on InChIKeys derived from
pass 1, so three builds on identical content gave 838/466, 849/455, 838/466 while
`compoundsResolved` was a deploy gate pinned at 455. Fixed by reading the committed
`data/enrichment/pubchem.json` cache. Converged, and checked again on 13 Oct:
`chemistry.json` reports **838 constituents, 455 resolved, 383 unmatched, 0 mergeable names**, and
`compounds.json` **838 compounds, 188 linkable, 22,084 edges**.

---

## 4. Decided and closed. Do not re-open without new evidence

| Question | Decision | Where it lives |
|---|---|---|
| Name competitors on the site at all? | Yes, under five rules: conflict disclosed first, organised by preparation never brand-against-brand, every figure the company's own with a checked-on date, no score or rank or winner, standing correction offer that runs against our own interest. | `guides/choosing-equipment.md`, `editorial-standards.astro` |
| Name Baidyanath? | **Yes, settled by publication.** It is named on the live disclosure page. Only the "est. 1917 / house of Baidyanath" heritage framing is gated, not the company name. | `content/choosing/who-publishes-the-composition.md` |
| Cross-canonicals on the 29 alias pairs? | **Dropped.** Bing holds both halves of 22 of 29 pairs with crawl dates on both, so both engines treat them as distinct records. 3 pages where Google *was* honouring the canonical now stand alone. | `Monograph.astro` (`const canonical = selfUrl`), `data/duplicates.json` |
| Is `primary` in `duplicates.json` the better page? | **No.** It is the preferred *name*. The primary is the shorter record on 14 of 29. | `data/duplicates.json` note |
| Where does the per-formulation comparison go? | On the existing formulation monographs, not new URLs. They already carry the formulary table, already earn 4x the impressions, and Google has never crawled 59 of them, so a new URL is the worst possible vehicle. | `src/components/Disclosure.astro` |
| Deposit datasets individually or as a repo archive? | Individually. 43 files at v2.0.0. | `.github/workflows/zenodo-deposit.yml` |
| Drop the thin collections from the sitemap? | **Not yet.** Proposed on 12 Oct and withdrawn the same day: the lexicon was three days old in the only data we have. Revisit when Bing has a full month on it. | this file |

---

## 5. Scheduled, nothing to do

| When | What | Where |
|---|---|---|
| Fridays 09:17 | Bing weekly coverage series, launchd `com.ageayurveda.bing-coverage` | `StartCalendarInterval` Weekday 5, Hour 9, Minute 17; verified 13 Oct |
| 17 Oct | Google coverage re-read, with four predictions written down before the run | `measurement/gsc-recheck/RUN.md` is the durable instruction. A session-only cron (`810e8e8c`, 10:23) will fire it if this session is still alive; if not, run it from RUN.md by hand. |
| 8 Nov | Comparative-pages verdict | |
| 14 Nov | Snippet difference-in-differences on the 399/403 cohorts | `scripts/snippet-experiment.mjs` |
| Monthly, by hand | Bing **AI Performance** export. No API exists, so nothing will remind you. | `measurement/bing-queries/` |
| Monthly, by hand | Search Console **Performance on Search, Generative AI Features** export. No API either. | `measurement/gsc-genai/` |

Those two hand exports are the project's only outcome measures with signal. Everything else is an
input measure.

Read each against the predictions recorded **before** the run, not after.

---

## 6. Open, and on whom

**Needs the user, not the model**
- Four entries hold two names joined by a full stop and need a splitting decision: `kusumbha`
  ("Parrot seed. Bastard saffron"), `nikochaka`, `udumbara`, and `surana`'s Telugu.
- Five names look like character confusions and need a source: `eranda` "Pahchangul", `draksha`
  "Munkka", `bijapura` "Bijoura", `ishwari` "Gandhnakuli", `apamarga` "Kharamanjar".
- `vamshalochana`'s botanical needs a source. It is the last filler-opener page.
- Dr. Singh's `sameAs`: council registration, ORCID or SBRI page. Offered, not supplied.
- **The four contextual store links and the footer anchor on `ageayurveda.com`.** Shopify-side, not
  in this repo, and on current evidence **the highest-value unpulled item on this list**: the store
  holds all 45 recorded citations and whatever authority this project has, and a followed editorial
  link from it is the one kind of link we do not have.
- Wikidata references on individual plant items. Hundreds of possible edits, needs an account, and a
  large self-referencing batch from a new account reads as link spam and gets reverted. If done at
  all, do it small, by hand, and only where our page is genuinely the best source for the statement.

**Refused pending explicit informed consent**
- The Cloudflare zone move. Live DNS for the business's Shopify storefront and email, and it needs
  the GoDaddy zone export first.

**Known and unfixed**
- 24 thin answers remain, with no `whoStatus` to draw on.
- **89** of the 1,240 sitemap URLs ship with no `lastmod`, deliberately: `/family/<x>`,
  `/dravyaguna/<facet>`, `/research/<tier>` and `/verification/<run>` are facets over the herb
  corpus and over run data, and one shared date moving whenever any of 505 herbs changes is a
  freshness signal with no information in it. Counted 13 Oct; an older note said 88, before the
  corpus reached 1,240 pages. This figure tracks the page count, so re-count it rather than quote
  it.

---

## 7. Standing rules that have been violated at least once

- **This repository is public.** Competitive intelligence, strategy and analysis stay out of it and
  out of commit messages. Measurement artefacts belong in gitignored paths.
- **`grep -c` counts lines, not matches.** Three occurrences.
- **A pipe swallows the exit status.** `node … | tail -5; echo $?` reported 0 for a script that
  exited 1. Two occurrences.
- **A hash-definition change is not a content change.** Widening the date ledger's hash made 819
  pages look revised when 189 had changed. `--rehash` adopts new hashes and advances no date.
- **A partial API run is biased, not smaller.** The calls that succeed are the ones asked earliest,
  so every reader here refuses to report rather than publish a skewed count.
- **Test whether a number is stable before explaining it.** Two confident explanations were written
  up for an 11-compound difference that two builds on identical content then refuted.
