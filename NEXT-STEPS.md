# What to do next, in order

Everything here is free. Items 1 to 3 need your login or your registrar and cannot be done for
you. Item 4 onward is work I can do once you say go.

Current state: the Nighantu is live at https://jairaj1234-dancer.github.io/nighantu/ with 806
pages, including a published verification ledger at `/verification/` and a structured
Dravyaguna dataset at `/dravyaguna/`. A root `robots.txt` and `llms.txt` now exist at
https://jairaj1234-dancer.github.io/ so the sitemap is discoverable. Nothing on the web links
to the site yet, and it is not registered with any search engine.

---

## 1. Add the DNS record (15 minutes, unblocks everything else)

ageayurveda.com is registered at **GoDaddy**, and GoDaddy's own nameservers
(`ns25/ns26.domaincontrol.com`) hold the DNS, so this is done in the GoDaddy account.

### Option A: let me do it, via the GoDaddy API

GoDaddy lowered its API threshold to a single domain in April 2026, so your account qualifies.

1. Go to https://developer.godaddy.com/keys and create a **Production** key (not OTE, which is
   the test environment).
2. Save it to a file, so the credentials never pass through a chat transcript:

   ```bash
   printf '%s\n%s\n' 'YOUR_KEY' 'YOUR_SECRET' > ~/.godaddy-api
   chmod 600 ~/.godaddy-api
   ```

3. Tell me it is there, and I run `./scripts/add-dns-record.sh nighantu ageayurveda.com`.

The script reads existing records first and prints the ones it will not touch, sets only the one
new CNAME, then waits for propagation. Your root A record and the `www` CNAME pointing at
Shopify, and your MX mail records, are never modified.

### Option B: do it by hand in the GoDaddy UI

**Domains, then DNS, then Add New Record:**

| Field | Value |
| --- | --- |
| Type | `CNAME` |
| Host / Name | `nighantu` |
| Value / Points to | `jairaj1234-dancer.github.io.` |
| TTL | leave default |

Notes that trip people up:

- The **Host** field takes only the label, `nighantu`, not the full
  `nighantu.ageayurveda.com`. Some registrars want the full name; if the form shows the domain
  suffix greyed out next to the box, enter just `nighantu`.
- The **Value** ends with a dot. Most registrars add it themselves; if yours rejects the dot,
  drop it.
- Do **not** use an A record, and do not point it at an IP address.
- This does not touch the Shopify store. The root domain `ageayurveda.com` and `www` keep
  pointing wherever they point now. You are only adding a new subdomain.

Check it worked by running `host nighantu.ageayurveda.com` in a terminal. When it answers with
`jairaj1234-dancer.github.io`, it is ready. Propagation is usually minutes, occasionally hours.

Then tell me, and I run:

```bash
./scripts/use-subdomain.sh nighantu.ageayurveda.com
```

That writes the CNAME file, flips the base path to root, re-ingests so all 38,000 internal
links update, rebuilds, re-runs the gates and pushes. The script refuses to run until DNS
actually resolves, so it cannot break the live site by going early.

**Why this matters more than anything else on the list.** Right now every citation the site
earns credits `jairaj1234-dancer.github.io`, a personal GitHub handle, not Age Ayurveda. On a
subdomain, the reference work and the store are visibly one brand, you get a domain-level
Search Console property, and the site serves its own root `robots.txt` and `llms.txt`.

---

## 2. Register with search engines (20 minutes)

**Already done, no login needed: IndexNow.** All 778 URLs have been pushed to Bing directly
(HTTP 200) and through the IndexNow aggregator, which fans out to Yandex, Naver and Seznam. A
self-generated key is hosted at the host root, and `scripts/indexnow.mjs` now runs automatically
after every deploy, so new and changed pages are pushed without anyone doing anything.

This matters because Bing feeds ChatGPT's search results, so the fastest route into an answer
engine did not need an account at all.

**Still needs your login:** Google has no equivalent. Search Console is the only way in, and
Request Indexing is the fastest way to get a new site crawled.

Do this after the subdomain if it is coming soon, otherwise do it now on the current URL and
redo it later.

**Google Search Console** at https://search.google.com/search-console

1. Add property. Use **URL prefix** and enter the site URL exactly, with the trailing slash.
2. Verify. On the current github.io URL, use the HTML file method and send me the file, or the
   meta tag method and send me the tag; I will deploy it. On a subdomain you own, DNS
   verification is easiest.
3. Sitemaps, submit `sitemap-index.xml`.
4. URL Inspection, paste the homepage URL, click **Request indexing**. Do the same for
   `/shirodhara/` and `/shirodhara/choosing-equipment/`. This is the fastest way to get a brand
   new site crawled.

**Bing Webmaster Tools** at https://www.bing.com/webmasters

Optional now, since IndexNow submission is already working without it. Worth doing anyway for
the reporting: you can import directly from Search Console once that is set up, which takes about
a minute, and Bing will then show you which of the submitted URLs it actually indexed. If you do
sign up, keep the existing key rather than generating a new one:
`bf9a6ad9a651b9775c941d4fd074a13a`.

---

## 3. Link to it from the Shopify store (5 minutes)

You confirmed this is acceptable since it is a Navigation setting rather than a theme edit.

In Shopify admin: **Online Store, then Navigation**. Edit the **Footer menu**, click **Add menu
item**.

- Name: `Ayurvedic herb reference` (or `Nighantu` once the subdomain is live)
- Link: paste the site URL

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

To run the full 53-prompt panel you need an Anthropic API key:

```bash
ANTHROPIC_API_KEY=sk-... node scripts/geo-audit.mjs
```

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
| Formulation ingredients with proportions and roles | 1,017 rows | In the companion DB. The site has no structured ingredient data anywhere. |
| Compound co-occurrence graph | 710 nodes, weighted edges | In the vault at `_Hub/Compounds/`, currently flattened into glossary rows. Publishable close to as-is. |
| Panchakarma procedures | 73 rows, 72 new | `practitioner_level` already separates vaidya-only from spa-safe, which gives a clean publish/withhold split. Natural sibling to the Shirodhara guide. |
| Disease entities with ICD-11 TM2 codes | 140 rows | The most linkable axis available, because ICD-11 TM2 is a real external identifier system. Every row is `llm-only` provenance, so it needs the same panel treatment as safety. |
| 99 unpublished Dravyaguna tables | 99 pages | Lost to word-count thresholds rather than policy. Lowering `THRESHOLDS.herb` recovers them, but publishes 99 thin pages to do it; better to extract their pharmacology into the dataset without giving each a URL. |
| Compound co-occurrence graph | ~~710 nodes~~ | **Done.** Recomputed from the published corpus at `/compounds/`: 852 constituents, 22,176 co-occurring pairs, every weight checkable against the pages it counts. |

**Not doing, and why:** the 20,734-verse Sanskrit corpus (English column empty on every row,
and CC BY-SA 3.0 share-alike collides with the site's CC BY 4.0); the 103 machine-readable
diagnostic patterns (clinical decision rules on `llm-only` provenance); the Hindi product
monographs (SKU-branded, and Hindi is low-resource enough that queries get pivoted to English
anyway).

## 6b. External identifiers: done, and what it exposed

241 botanicals carry GBIF keys, 228 Wikidata QIDs and 236 NCBI taxids; 466 constituents
carry PubChem CIDs. 34 family browse pages at `/family/`. All cached and committed, so
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

- **202 herb pages still have no botanical name.** The verification run resolved what it could
  and correctly refused the rest; many are contested identities where picking a side would
  manufacture certainty the sources do not have. Worth a second pass with better sources, not
  worth guessing.
- **Some herb photographs are of the wrong plant.** `image-credits.csv` in the Ayurmahotsav
  folder marks `herb_Ashwagandha.jpg` as verified and describes it as ginger root, and
  `herb_Haritaki.jpg` as sun-dried bananas. Roughly 20 to 25 of the 51 images are genuinely
  the right plant and correctly credited. Do not bulk-import: on a site whose whole claim is
  verified botanical identity, a mislabelled photograph is the exact failure it exists to
  prevent.

---

## Still open

- **A named reviewer.** `/reviewers/` states plainly that no practitioner has signed off. A named
  vaidya credited for reviewing even one section would raise citation odds materially. Needs a
  real person willing to be named.
- **Chyawanprash facts.** The classical herb count is contested across sources and the Bhasma in
  pregnancy question is unresolved. Counts are redacted automatically until settled.
- **The Surya one-pager** still carries the false "only portable Shirodhara device" claim.
  Corrected copy is at `~/Desktop/Surya-Shirodhara/Dropship-Kit/positioning-correction.md`.
