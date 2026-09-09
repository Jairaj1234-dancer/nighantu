# Zero-budget traffic plan

Produced by a 14-agent research and verification pass on 9 September 2026. Seven channels were
researched in parallel, each result then handed to an independent skeptic instructed to check
free tiers, current platform policy and real-world effectiveness with live searches, and to
default to rejecting anything it could not confirm.

**68 tactics survived. 33 were rejected.** Rejection reasons: 21 ineffective, 4 not actually
free, 4 not one-person-deployable, 3 factually wrong, 1 terms-of-service violation.

## Known gap in this research

The **entity and knowledge-graph channel failed** with an API error and was not researched or
verified. That channel covered Wikidata, Wikipedia notability, Google Business Profile, Bing
Places, Apple Business Connect, OpenStreetMap and Crunchbase. Google Business Profile, Bing
Places and Apple Business survived via the free-listings channel and appear in the plan below,
but **Wikidata, OpenStreetMap and Crunchbase were never assessed.** Wikidata in particular is a
free, high-leverage entity registry that answer engines use for grounding. Treat its absence as
an open question, not as a judgement that it is not worth doing.

## One disagreement worth recording

The plan rejects automating IndexNow on the grounds that Bing URL Submission already covers it.
That reasoning assumes a Bing Webmaster Tools account exists. It does not, and creating one needs
a login nobody had at the time. IndexNow needs no account at all, so it was the only available
route to Bing, and all 778 URLs were accepted by both the Bing endpoint and the aggregator on
9 September. The automation is in `scripts/indexnow.mjs` and runs after every deploy. If a Bing
Webmaster account is later created, the plan's reasoning becomes correct and the automation
becomes redundant rather than wrong.

---

# Age Ayurveda: zero-budget traffic plan

**Before anything else, three corrections to the brief.** They are load-bearing and every URL, count and outreach email downstream depends on them.

1. **The site is not called "Ayurveda Atlas" and is not at that URL.** `https://jairaj1234-dancer.github.io/ayurveda-atlas/` returns 404. The live site is `https://jairaj1234-dancer.github.io/nighantu/`, the repo is `github.com/Jairaj1234-dancer/nighantu`, `astro.config.mjs` sets base `/nighantu`, and the site is branded **Age Ayurveda Nighantu**. Keep that name. Your own `data/citation-log.csv` already records why: `theayurvedaatlas.com` is a live site on the same topic.
2. **The counts in the brief are wrong on four of five figures.** Verified by file and directory count: 504 herb, 143 formulation (not 168), 37 device (not 44), 14 glossary (not 13), 53 pharmacological-reference, 778 built HTML pages (not 777), 766 Markdown twins. The Shirodhara guide is 13 source files in `./guides/` rendering as 12 pages under `/nighantu/shirodhara/` (not `/guides/`). Quoting 168 and 44 to a librarian or an academic is a factual error they can check in one click.
3. **The monographs are not original prose.** Every herb file's frontmatter and the site's own `llms.txt` state that monograph text incorporates the **Amidha Ayurveda Herb Database under CC BY 4.0**. That makes CC BY 4.0 the only honest licence, rules out CC0, ODC-BY and any NonCommercial or NoDerivs option, and makes attributing Amidha a legal condition on every deposit, dataset card and syndicated copy.

---

## 1. The three things to do first

### First: freeze the name and the URL, and take the free subdomain

**Why it is first.** Every other tactic here is an attempt to get one URL written down permanently on somebody else's page: a DOI record, a Hugging Face dataset card, a library research guide, a MERLOT record, a Commons attribution string. A second rename destroys all of them at once, and GitHub does not reliably redirect the `github.io` Pages path when a repo is renamed, so an acquired link becomes a 404 rather than a redirect. `README.md` currently plans a base-path change, which is a live grenade. Separately, `jairaj1234-dancer.github.io` is on the Public Suffix List, so Google treats your site as a subdirectory of a shared host with no accumulated authority, and Bing Webmaster Tools, Pinterest and Ahrefs all verify at host level, which you cannot do on someone else's `github.io`.

**First session, about 90 minutes.**
- Add a CNAME record at your DNS provider pointing `nighantu.ageayurveda.com` at `jairaj1234-dancer.github.io`. You already own `ageayurveda.com`, so this costs nothing. It is a DNS record, not a Shopify theme edit.
- Set the custom domain in the repo's Pages settings and tick Enforce HTTPS. The Let's Encrypt certificate is free.
- Set `ATLAS_BASE=/` in `astro.config.mjs` and `.github/workflows/deploy.yml`, rebuild, then confirm `sitemap-index.xml`, `llms.txt`, `llms-full.txt`, `robots.txt`, `rss.xml` and one sample `.md` twin all return 200 on the new host.
- Purge "Ayurveda Atlas", "777 pages", "168 formulations" and "44 instruments" from `README.md`, `src/pages/llms.txt.ts` and every draft outreach template. Write the frozen canonical URL into those files as one copy-paste string.

**Result and when.** Nothing visible, ever. What you have bought is that every permanent identifier minted from this point resolves to a host you control, and that three later tactics (Bing verification, Pinterest claiming of the reference site, domain-level backlink tools) stop being impossible. Do not send a single outreach email before this is done.

### Second: Google Search Console, then import it into Bing

**Why.** 778 pages published this week are invisible until Google discovers them. Sitemap submission plus manual URL inspection is the only free lever that shortens discovery from months to days. The Performance report is then the input to every content decision you make for the next year: it tells you which of the 504 herb pages actually earn impressions. Bing matters separately because its index is one of several sources behind Copilot, DuckDuckGo and ChatGPT search, and its free Site Scan is a technical audit across all 778 pages at no cost.

**First session, about two hours, then ten minutes a day for a fortnight.**
- Add `nighantu.ageayurveda.com` as a **Domain property**, verify by DNS TXT. Add `ageayurveda.com` as a second Domain property so the store and the reference site can be compared.
- Submit `/sitemap-index.xml`. It is live and `sitemap-0.xml` contains 778 URLs, so Search Console should report roughly that number discovered.
- URL Inspection, Request indexing, on the ten most commercially useful pages first: the Shirodhara guide hub and its pages, which carry the UTM-tagged links to Surya Shirodhara, then the herb monographs matching your best-selling SKUs. The manual limit is roughly ten to twelve per property per day and Google does not publish it, so treat it as ten and repeat daily for two weeks.
- Then `bing.com/webmasters`, "Import your sites from Google Search Console". Submit both sitemaps. Push the URL list via URL Submission, reading the remaining-quota figure the UI shows rather than assuming the documented 10,000 ceiling, which a new site will not get. Run Site Scan on both properties.

**Result and when.** First pages indexed in three to ten days, the bulk over four to eight weeks, first usable Performance data at week four to six. At week three, check Settings, Crawl stats: your `robots.txt` explicitly allows Googlebot, so a flat line means a Pages or canonical fault, not a robots problem.

### Third: the supplement-policy hygiene pass on all 29 SKUs

**Why.** Google Merchant Center, the Meta catalogue and Pinterest Rich Pins all read the same Shopify product fields. One disapproval-proof rewrite unlocks three free product surfaces at once and, more importantly, prevents the account-level misrepresentation suspension that would zero the whole channel. It also raises free-listing match rate directly, because Google matches queries against title and description text. Meta relaxed its rules on 22 July 2026 to permit vitamins, supplements and protein products in ads, commerce and organic content, so the same rewrite now clears Meta commerce too.

**First session, about three hours of the ten.**
- Products, Export, All products, CSV. Save an untouched copy as a rollback before changing anything.
- Grep the export for `treat, treats, cure, cures, heal, heals, prevent, prevents, remedy, therapy for, medicine for`, every disease noun (diabetes, arthritis, cancer, hypertension, insomnia, anxiety, infertility, thyroid, piles, asthma), and the title superlatives Google disapproves (`best, cheapest, sale, #1, free shipping`).
- Rewrite each flagged line into structure-function phrasing sourced from the **24 English product monographs**. Never rename a product to fix a claim; change only the surrounding copy.
- Rebuild titles as Brand + Product name + key ingredient + form + pack size, highest-intent words first inside the 150-character limit.
- Bring descriptions to 500 to 1,000 characters of plain fact, including "Manufactured by Nitya Naturals Pvt Ltd, Prayagraj" and the AYUSH licence number stated as a fact, never as an endorsement of a benefit.
- Test the re-import on a two-SKU CSV first. Shopify's importer matches on handle, and a full overwrite that omits columns can blank live fields.
- Check Settings, Policies: refund, shipping, privacy and contact must all be populated. New-store Merchant Center suspensions hinge on exactly these.

**Result and when.** No traffic on its own. Merchant Center approvals become visible 24 to 72 hours after the first feed sync, and free listings begin serving in the following two to three weeks on long-tail queries: specific formulation names, "Surya Shirodhara", pack sizes. You will not beat Dabur or Baidyanath on "chyawanprash". Keep the rewritten CSV in the repo as the canonical claim-safe copy and reuse it for Meta and Pinterest.

---

## 2. Ranked table of every surviving tactic

**What I ranked on**, in this order of weight:

1. **Prerequisite multiplier.** How many other tactics are blocked or damaged without it. A three-hour item that unblocks fifteen outranks a ten-hour item that stands alone.
2. **Verified mechanism versus hoped-for mechanism.** Anything whose payoff depends on an unverifiable channel (external AI crawling of Reddit, for instance, which is blocked by a blanket `Disallow: /`) is discounted hard against anything with a mechanism that was checked at source.
3. **Buyer proximity.** The Surya Shirodhara device is the highest-margin item and its buyers are practitioners, spas and hotels. A surface that reaches them beats a surface that reaches a larger, non-buying audience.
4. **Durability per hour.** Compounding beats one-off beats ongoing grind, because there is only one part-time operator and a grind is the first thing that dies.
5. **Raw hours**, as the tiebreaker.

Duplicates across the source channels have been merged (Zenodo appeared three times, Hugging Face three times, Wikimedia Commons twice, curated-list placement three times).

| # | Tactic | Channel | Mechanism | Hours | Weeks to impact | Durability |
|---|---|---|---|---|---|---|
| 1 | Freeze the name and URL, move to `nighantu.ageayurveda.com` | Search | search | 3 | 1 | compounding |
| 2 | Google Search Console property, sitemap, manual URL inspection | Search | search | 4 | 2 | compounding |
| 3 | Bing Webmaster Tools via GSC import, plus Site Scan | Search | ai-citation | 3 | 2 | compounding |
| 4 | The kill-list: write down the platforms you will not touch | Decision | none | 1 | 0 | one-off |
| 5 | `SYNDICATION.md` canonical policy and syndication log | Publishing | search | 3 | 0 | compounding |
| 6 | LICENSE (CC BY 4.0), LICENSE-CODE (MIT), PROVENANCE, CITATION.cff, `/cite` page | Repo/data | ai-citation | 10 | 1 | compounding |
| 7 | Zenodo-GitHub release integration plus Software Heritage SWHID | Repo/data | ai-citation | 3 | 2 | compounding |
| 8 | Supplement-policy hygiene pass on all 29 SKUs | Listings | marketplace | 10 | 2 | one-off |
| 9 | Google Business Profile with the Products module | Listings | search | 5 | 3 | compounding |
| 10 | IndiaMART free seller catalogue (device and bulk lines first) | Listings | marketplace | 6 | 4 | compounding |
| 11 | Google Merchant Center free listings via the Google & YouTube app | Listings | marketplace | 8 | 3 | compounding |
| 12 | Pinterest domain claim by DNS TXT plus Rich Pins | Listings | social | 3 | 8 | compounding |
| 13 | Bing Places and Apple Business, imported from the Google profile | Listings | search | 2 | 4 | one-off |
| 14 | Free monitoring stack: Reddit RSS feeds plus Google Alerts | Community | referral | 3 | 1 | compounding |
| 15 | Substack free publication, fortnightly | Publishing | referral | 4 | 8 | compounding |
| 16 | Indian Business Portal (FIEO) exporter storefront | Listings | marketplace | 4 | 6 | compounding |
| 17 | Meta Commerce Manager catalogue and product tagging | Listings | marketplace | 6 | 4 | compounding |
| 18 | YouTube channel foundation and profile link routing | Video | direct | 2 | 0 | one-off |
| 19 | Hugging Face org plus the Nighantu corpus as one Parquet dataset | Repo/data | ai-citation | 14 | 4 | compounding |
| 20 | MERLOT and OER Commons listings | Links | referral | 5 | 4 | compounding |
| 21 | Developer and curated-list placement (Astro showcase, GitHub topics, awesome lists, llms.txt directories) | Links | referral | 8 | 4 | compounding |
| 22 | Publication checklist plus monthly and quarterly maintenance ritual | Repo/data | ai-citation | 6 | 2 | ongoing-grind |
| 23 | Publish the Ventive film as the channel anchor, after a gated re-render | Video | search | 6 | 3 | compounding |
| 24 | One Zenodo deposit, reserved DOI, concept-DOI versioning | Repo/data | ai-citation | 6 | 3 | compounding |
| 25 | The B2B video pair: therapist economics and room turnaround | Video | search | 10 | 6 | compounding |
| 26 | Reddit operator identity: one disclosed account as infrastructure | Community | referral | 8 | 4 | compounding |
| 27 | Modmail first: ask permission, offer to maintain the subreddit wiki | Community | referral | 10 | 3 | compounding |
| 28 | Curlie listing, and the written refusal to mass-submit directories | Links | search | 2 | 8 | one-off |
| 29 | LinkedIn Articles plus a member Newsletter | Publishing | referral | 8 | 6 | compounding |
| 30 | Shirodhara ROI calculator on a second GitHub Pages repo | Links | referral | 16 | 6 | compounding |
| 31 | dev.to, HackerNoon and Hashnode build-log series (five posts) | Publishing | referral | 12 | 4 | compounding |
| 32 | Show HN: the static generator, not the encyclopedia | Community | referral | 12 | 2 | one-off |
| 33 | Telegram channel plus participation in BAMS-student channels | Community | search | 18 | 8 | compounding |
| 34 | Reddit self-posts that ARE the reference (original tables) | Community | referral | 24 | 8 | compounding |
| 35 | Per-video caption, chapter and Hindi-subtitle discipline | Video | search | 1.5/video | 4 | ongoing-grind |
| 36 | Transcript-to-Nighantu pipeline (new Astro collection) | Video | ai-citation | 18 | 8 | compounding |
| 37 | The 13-part phone-filmed Shirodhara demonstration series | Video | ai-citation | 55 | 10 | compounding |
| 38 | Shorts engine, two a week from the existing scored reel bank | Video | social | 6/month | 4 | ongoing-grind |
| 39 | Instagram Reels: five native bio links, free Business Suite scheduling | Video | social | 4 | 4 | ongoing-grind |
| 40 | Hindi Quora and Hindi answering | Community | search | 16 | 10 | compounding |
| 41 | YouTube auto-dubbing plus hand-written translated titles | Video | search | 5 | 6 | compounding |
| 42 | schema.org/Dataset markup and a `/datasets/` section | Repo/data | search | 10 | 8 | compounding |
| 43 | One genuine AMA in r/Ayurveda | Community | referral | 14 | 8 | compounding |
| 44 | Hindi Blogger property carrying the 24 Hindi monographs | Publishing | search | 9 | 12 | compounding |
| 45 | Journalist request services (Source of Sources, Featured, Qwoted) | Links | referral | 22 | 4 | ongoing-grind |
| 46 | #JournoRequest monitoring on X and Bluesky | Links | referral | 8 | 3 | ongoing-grind |
| 47 | No TikTok, plus the reseller clip pack as the substitute | Video | referral | 3 | 6 | compounding |
| 48 | Wikimedia Commons photo and original-diagram donation | Publishing | referral | 12 | 12 | compounding |
| 49 | Quora in English, capped at 45 minutes a week | Community | search | 18 | 10 | compounding |
| 50 | The verse-citation answer engine on Reddit | Community | referral | 30 | 6 | ongoing-grind |
| 51 | Podcast guesting on other people's shows | Video | referral | 16 | 8 | compounding |
| 52 | Pinterest video Pins and 60 to 100 curated herb cards | Video | search | 10 | 12 | compounding |
| 53 | LibGuides and public-library research-guide placement | Links | referral | 25 | 8 | compounding |
| 54 | Link reclamation and unlinked-mention chasing, quarterly | Links | search | 8 | 12 | compounding |
| 55 | Guest contributions to spa and wellness trade press | Links | referral | 30 | 10 | compounding |
| 56 | `/bams` syllabus-mapped index plus a 60-80 college shortlist | Links | referral | 30 | 10 | compounding |
| 57 | Broken-link building using a fork of `scripts/linkcheck.mjs` | Links | search | 30 | 6 | ongoing-grind |
| 58 | Facebook vaidya and BAMS groups, 30 minutes twice a week | Community | referral | 20 | 4 | ongoing-grind |

**The arithmetic you need to see.** This list is roughly 550 hours. At five hours a week that is over two years. The ranking *is* the plan: work down it, and accept that the bottom fifteen rows will probably never happen. That is the correct outcome, not a failure. Two or three good artefacts beat eight adequate ones, and abandoned repos, dead Telegram channels and stale Quora Spaces are a negative signal on everything else you publish.

---

## 3. The 90-day sequence

Budget: five hours a week, roughly 60 hours across the quarter. Compounding assets and prerequisites first, grinds later or not at all.

### Weeks 1 and 2 (about 10 hours): make the site findable and permanent

| Work | Hours |
|---|---|
| Freeze the name, move to `nighantu.ageayurveda.com`, correct every count, purge "Ayurveda Atlas" from the repo | 3 |
| Google Search Console: Domain property, sitemap, ten URL inspections a day for the fortnight, plus `ageayurveda.com` as a second property | 4 |
| Bing Webmaster Tools import, both sitemaps, URL submission, Site Scan on both properties | 3 |

Nothing here produces a visitor. It produces the conditions under which the next 550 hours are not wasted.

### Weeks 3 to 6 (about 20 hours): the licence and citation layer, plus two clocks

| Work | Hours |
|---|---|
| LICENSE (CC BY 4.0 legal text) for `content/` and `guides/`, LICENSE-CODE (MIT) for `scripts/` and `src/`, `LICENSES.md` naming the Amidha upstream, PROVENANCE.md written honestly, CITATION.cff validated with `cffconvert`, repo About panel with real counts and 5 to 8 topics, plus `src/pages/cite.astro` and a per-page "Cite this page" block on the monograph template | 10 |
| `SYNDICATION.md` (Tier A original-for-platform, Tier B canonical, Tier C never syndicated) and the one-page kill-list, written in the same sitting | 4 |
| Zenodo-GitHub release integration, `.zenodo.json`, tag `v1.0.0`, DOI badge in README, then Software Heritage Save Code Now for the SWHID | 3 |
| Free monitoring stack: Reddit `/new/.rss` feeds for r/Ayurveda, r/herbalism, r/Sanskrit and r/HerbalMedicine into a free reader, plus Google Alerts for "shirodhara", "panchakarma equipment" and "Ashtanga Hridaya translation" | 3 |

**Two twenty-minute clock-starters in the same window, inside the 20 hours.** Create the single Reddit account with the disclosed bio, and post nothing. Many subreddit AutoModerator gates check account age, and that clock costs nothing to start. Do the same for the YouTube channel handle if `@AgeAyurveda` is free, matching the Instagram handle.

**Note on the PROVENANCE wording.** Do not write that the monographs are original prose with no third-party text reproduced. That contradicts your own README and every herb file's `sources` field. Write that they are derived from the Amidha Ayurveda Herb Database under CC BY 4.0, restructured and extended with classical citations and editorial layers by Age Ayurveda, with Amidha credited upstream. A false provenance statement inside a permanent DOI record cannot be retracted.

### Weeks 7 to 12 (about 30 hours): the commercial surfaces

| Work | Hours |
|---|---|
| Supplement-policy hygiene pass across all 29 SKUs, using the 24 English monographs, with a rollback export and a two-SKU test import | 10 |
| Google Merchant Center free listings: install the free Google & YouTube channel, verify by DNS TXT, set Shipping (mandatory in India or listings will not serve), set Google product categories per SKU, `identifier_exists=false` where there is no barcode, `product_type` on every SKU, work Diagnostics to zero | 8 |
| Google Business Profile: claim the Prayagraj premises, primary category "Herbal medicine store" or "Manufacturer" (not "Ayurvedic clinic"), video verification with signage visible, all 29 SKUs into the Products module with UTM-tagged links, 10 photographs, a 30-second cut of the Surya film | 5 |
| IndiaMART free seller registration: company profile with the AYUSH licence number, Surya Shirodhara plus bulk Chyawanprash plus one flagship capsule line, B2B-framed titles with the specification fields filled, therapist ROI spreadsheet staged as the standard reply attachment | 6 |

**What deliberately does not fit in 90 days, and why.** No video, no Reddit answering, no Quora, no library outreach, no Telegram. Every one of those is either a grind or a large block, and at five hours a week they would displace the prerequisites. The Reddit AMA, which needs three months of account history, therefore lands in month seven at the earliest. Say that out loud rather than pretending otherwise.

**What comes first in quarter two, in order.** Pinterest domain claim and Rich Pins (3h, permanent, upgrades every pin anyone ever makes from your domain). Bing Places and Apple Business (2h, mostly an import). Meta Commerce Manager (6h, now unblocked by the hygiene pass). FIEO Indian Business Portal (4h). Then the Hugging Face dataset (14h) and the single Zenodo deposit (6h), in that order, because the Zenodo record's `isIdenticalTo` related-identifier should point at a Hugging Face dataset that already exists.

---

## 4. What was rejected, and why it matters

You will be told to do most of these. Here is the one-line reason each is not in the plan.

| What you will be told to do | Why it is not here |
|---|---|
| Submit to 500 free directories | Link farms. At volume this is the large-scale coordinated link scheme Google's spam policies name. Curlie is the single exception, at two hours, and it is in the plan mainly to remove the temptation. |
| List on TradeIndia, ExportersIndia and JustDial | Free tiers are real but throttled to create upsell pressure; links are nofollow; the certain cost is a permanent stream of sales calls to your business number. IndiaMART alone has enough Indian B2B buyer share to be worth that tax. JustDial is a defensible 30-minute exception on a dedicated email alias. |
| Send a free press release | OpenPR's free tier is real (one per 30 days). EIN Presswire's is a gated sales funnel, not a free tier. All of it is nofollow on low-authority PR farms, and releases get republished verbatim onto sites with no edit path, so one claim-language slip on a regulated Ayurvedic product becomes permanent and uncorrectable. |
| Publish on Medium | The Import tool is the only path that sets a canonical and has been reported broken since October 2025, with no manual canonical field. Imported stories are also excluded from curated distribution. Medium's own Rules.md names "posting content primarily to drive traffic to an external site" as removable spam. Substack (dofollow, verified) and dev.to (`canonical_url` works, verified) strictly dominate. |
| Edit the Wikipedia Ayurveda article | `Talk:Ayurveda` carries contentious-topics notices for both pseudoscience/fringe science and South Asia, is under discretionary sanctions, and has a one-revert restriction. A manufacturer has a disqualifying COI. The tail risk is the domain on the global spam blacklist, which would also kill the Commons donation, the one Wikimedia item worth doing. |
| Answer on Stack Exchange | Every Stack Exchange site now serves `Content-signal: search=no, ai-train=no` and `Disallow: /`. A third party gains no search or AI-citation value from posting there, and there is no Ayurveda-relevant site anyway. |
| Publish the classical verse corpus as an open dataset | The two source channels disagreed and the licence evidence settles it. All 20,734 rows in `corpus_chunks` carry `Sanskrit mula: public domain · SARIT TEI: CC-BY-SA 3.0`. It is a re-chunking of SARIT, which is already public, so it is not a scarce new resource, and CC BY 4.0 would be a licence violation. CC BY-SA 4.0 is the only lawful option and share-alike is filtered out of exactly the permissive mixtures that were the payoff. |
| Publish the 44,360 fine-tuning pairs | 93.5% are two mechanical projections of those same SARIT verses, and the largest class is Devanagari-to-IAST transliteration, a deterministic transform regenerated in seconds with `indic-transliteration`. They inherit CC BY-SA 3.0. This is the one item in the whole plan that could create legal exposure rather than a terms problem. |
| Mirror the dataset to Kaggle | Kaggle's Terms of Use are reported to bar commercial use and the full text could not be retrieved to establish whether an openly-licensed company dataset falls inside that clause. Default to reject when unconfirmed, especially when the audience overlap with your buyers is near zero. |
| Sell on ONDC | Setup runs from zero to around Rs 50,000 depending on provider and commissions are 1 to 3 percent, so it fails zero-budget. It also creates a second order, returns and settlement queue outside Shopify, which fails the one-person test. |
| Use Google Manufacturer Center | Requires GTIN or UPC identifiers, which means a paid GS1 India allocation. Separately, manual product entry through the console was removed around 9 July 2026, so submissions now need the API, SFTP or a hosted feed. |
| Run a Hindi Merchant Center feed | Merchant Center requires feed, landing page and checkout language to match. A Hindi feed pointing at English-only Shopify pages will be disapproved. Making it work means building and maintaining Hindi storefront pages for all 29 SKUs. |
| Post to the Ayurveda forums | Checked individually: `shareayurveda.com` now redirects to a UK restaurant, `imavf.org/forums` renders "No forums were found here", and the `spiritualforums.com` Ayurveda board has 50 threads in its entire history. Only `community.ayurvedology.com` survives, and it is a JavaScript-rendered SPA whose HTML shell contains no post content. |
| Build a dosha or Prakriti quiz as a link magnet | The single most-cloned format in Ayurveda, so near-zero link magnetism, and the highest regulatory-risk item under AYUSH and DMR advertising rules. The Shirodhara ROI calculator has the opposite profile: nothing comparable exists, no health claim at all, and its audience is the actual buyer. |
| Run a BAMS student quiz | Makes one part-time operator a data fiduciary for hundreds of student records under the DPDP Act, with notice, consent, grievance and erasure obligations, in exchange for inbound links. |
| Email the 1,364-org export list and the 1,152 Pune leads about links | Burns a revenue asset for the weakest link type on the list, and cold B2B email into EU and UK contacts needs a lawful basis under GDPR and PECR. Send those lists sales outreach, not link requests. |
| Publish in an Ayurveda journal | Annals of Ayurvedic Medicine charges up to USD 250 or INR 5,000 with an explicit no-waiver policy; IJAPR charges INR 3,200 on acceptance. You would discover the fee after acceptance, having already written it. The Zenodo DOI buys the same citable credential free. |
| Automate IndexNow pings | Google does not participate. Of the engines that do, only Bing matters here, and Bing URL Submission already covers it. Revisit as a 30-minute add once the subdomain move puts the key file at a host root you control and publishing becomes frequent. |
| Run a podcast | Roughly 10 hours of setup plus four or more per episode forever, on top of a 13-episode video series. The two things it was justified on, guest relationships and transcript pages, are obtainable by recording the same conversations as ordinary YouTube uploads. |
| Open a TikTok account | Still blocked in India, and the government has restated that no order has been issued to lift it. Operating one from India means circumventing a state block, which is legal exposure for a regulated manufacturer, not a platform-terms question. |
| Join Discord servers | No indexing, no crawling, no citation mechanism, negligible direct traffic, and the payoff is an unattributable hope that someone links you later. Telegram gives the same audience with a fully crawlable archive: `t.me` serves no `robots.txt` at all. |
| Buy Screaming Frog for broken-link building | The free version caps list mode at 500 URLs *and* locks the configuration panel behind a licence, so the "crawl outside start folder" setting the tactic needs is paid-only. Fork `scripts/linkcheck.mjs` instead; it is about 40 lines of Node with no URL cap. |

---

## 5. What to measure, with free tools only

The rule underneath all of this: **measure the mechanism you verified, not the one you hoped for.** Reddit is judged on UTM clicks, never on AI citations, because Reddit's `robots.txt` is a blanket `Disallow: /` for every agent and no external answer engine crawls it openly. Shorts are judged on channel-page visits, not Shopify sessions, because Shorts description and comment links are not clickable.

| Tactic | Metric that decides it | Free tool | Cadence |
|---|---|---|---|
| URL freeze and subdomain | Indexed page count climbing toward 778; zero 404s in the coverage report | Search Console, Coverage | Weekly, first month |
| Search Console setup | Impressions by page, then pages with impressions and near-zero CTR (those titles get rewritten) | Search Console, Performance | Monthly from week 4 |
| Bing Webmaster Tools | Bingbot fetching and returning 200s; duplicate-title and missing-description counts falling | Bing WMT, Crawl Information and Site Scan | Weekly for a month, then quarterly |
| Licence, CITATION.cff, `/cite` | "Cite this repository" button rendering on the repo; `/cite` reachable from the footer on all 778 pages | GitHub UI, plus one manual spot-check | Once, then on each release |
| Zenodo-GitHub and Software Heritage | A concept DOI resolving, a SWHID retrievable, citing works appearing | `api.openalex.org` queried on your DOIs | Quarterly, logged in `data/citation-log.csv` |
| Hygiene pass | Diagnostics error and disapproval count, target zero | Merchant Center, Products, Diagnostics | First Monday of each month |
| Merchant Center free listings | Free-listing clicks and impressions by product | Merchant Center Performance, plus `utm_medium=free_listing` in Shopify analytics | Monthly |
| Google Business Profile | Discovery views versus direct views, product-card clicks, calls | GBP Insights, plus `utm_medium=gbp` | Monthly |
| IndiaMART | Enquiry count and response rate, and how many enquiries the ROI spreadsheet converts | IndiaMART seller dashboard, plus your own reply log | Weekly, 15-minute fixed slot |
| Meta catalogue | Product-tag taps only. Not Shop visits; the Shop tab left Instagram's navigation years ago | Commerce Manager, Insights | Monthly |
| Pinterest claim and Rich Pins | Outbound clicks and saves, and whether price and availability render on three spot-checked product URLs | Pinterest Analytics after claiming; the URL Debugger for the spot-check | Not before week 16 |
| Bing Places and Apple Business | Place-card views and website taps. If flat at six weeks, stop investing time but leave the listings up | Bing Places dashboard, Apple Business Insights | Once at six weeks |
| Substack | Subscriber count and open rate, plus clicks arriving at `utm_source=substack` | Substack dashboard, Shopify analytics | Per issue |
| Hugging Face dataset | Downloads and likes, and whether the dataset viewer actually renders on the live page | HF dataset page | Monthly, on the Community tab pass |
| Zenodo deposit | Views, downloads, and citing works | Zenodo record stats, `api.openalex.org` | Quarterly |
| MERLOT and OER Commons | Whether the record is published, and referrals from `.edu` and `.ac.in` | Search Console, Links report; referral rows in Shopify analytics | Quarterly |
| Curated and developer lists | Merged PRs out of PRs opened, target 20 to 40 percent; referrals from `github.io` and `astro.build` | A plain sheet, plus Shopify referral rows | Per batch |
| Ventive film and B2B video pair | Enquiries, never views. This is the highest intent-per-view content you own | YouTube Studio traffic sources, plus `utm_medium=video` | Monthly |
| Reddit identity, modmail, self-posts, AMA | UTM clicks per subreddit, using `utm_campaign=r_ayurveda` and equivalents. If a sub earns no clicks in six weeks, stop working it | Shopify analytics or GA4, campaign report | Six-week review |
| LinkedIn Articles and Newsletter | Newsletter subscribers, and clicks at `utm_source=linkedin`. Ignore the links themselves; they are all nofollow | LinkedIn analytics, Shopify analytics | Monthly |
| dev.to, HackerNoon, Hashnode | Referral sessions and, more importantly, second-order links appearing in Search Console's Links report | Search Console, Links; platform view counts | Monthly |
| Show HN | One-off: front-page or not, and what inbound links appear in the following two weeks | Search Console, Links report | Once, at two weeks |
| Telegram | Subscriber count and per-post view count, plus whether `t.me/s/<channel>` pages start appearing in Search Console impressions | Telegram channel stats, Search Console | Monthly |
| Quora, English and Hindi | Answer views and clicks at `utm_source=quora`. Cap at 45 minutes a week regardless of result | Quora stats, Shopify analytics | Monthly |
| Shorts, Reels, Pinterest video | Channel-page visits and profile-link taps for Shorts; saves, shares and DM enquiries for Reels; outbound clicks for Pinterest | YouTube Studio, Instagram Insights, Pinterest Analytics | Monthly |
| Demonstration series and transcript pipeline | Whether the transcript page ranks for the exact question the video title asks | Search Console, Performance, filtered by the `/transcript/` path | Monthly from week 8 |
| Journalist services and #JournoRequest | Placements per quarter, honestly 1 to 3 for a diligent operator; log each on a `/press` page | Google Alerts on the brand names; Search Console, Links | Quarterly |
| Wikimedia Commons | The "File usage" section on each file page. Reuse is the metric, not clicks | Commons file pages, plus a reverse image search on two uploads | Quarterly |
| LibGuides, college and trade-press outreach | Reply rate and acceptance rate per 10 emails sent. Kill any list segment below 5 percent | A plain sheet | Per batch of 10 |
| Broken-link building | Links won per 10 emails, expected 5 to 10 percent | Search Console, Links report | Per session |
| Link reclamation | Unlinked mentions found, and inbound links pointing at 404s | Google Alerts, Search Console coverage and Links | Quarterly, 90 minutes |
| Facebook groups | Inbound DM enquiries from practitioners only. Nothing else here is measurable, which is why it is last and is the first thing to cut | Your own inbox | Monthly |

**One shared instrument.** Use a single UTM scheme everywhere so Shopify analytics can separate the channels without guesswork: `utm_source=<platform>`, `utm_medium=<free_listing|gbp|syndication|comment|video|reel|pin|apple_maps>`, `utm_campaign=<slug>`. One exception, and it is non-negotiable: **no UTM parameters in the `url` column of the Hugging Face dataset or in the Zenodo record links.** Use the clean canonical URL there. You still see the referral in analytics, and a UTM-tagged link inside a research dataset is the single most likely thing to get the card flagged as advertising.