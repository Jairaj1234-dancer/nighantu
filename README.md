# Nighantu

A static reference encyclopedia of Ayurvedic herbs, classical formulations and instruments,
published by Age Ayurveda. It exists to earn citations in answer engines (ChatGPT, Claude,
Perplexity, Google AI Overviews) and to pass qualified readers through to product pages with
tracked links. It is deliberately separate from the Shopify storefront and never touches it.

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
scripts/geo-audit.mjs   citation panel, monthly
guides/                 hand-written guide pages (the Shirodhara hub)
content/                generated, committed, published
data/                   monitor state, citation log, DASHBOARD.md
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
node scripts/geo-audit.mjs --list # print the citation panel
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
4. No heritage framing (Baidyanath, 1917) on the editorial site. That framing has a real job on
   B2B sales collateral; on a reference site it undercuts the neutrality that earns citations.
5. No wikilink syntax may survive into published content.
6. Every page has an answer block of a sensible length.
7. No herb count for Chyawanprash while the classical source is contested (45 vs 50 vs 18), and
   no Bhasma-plus-pregnancy guidance on those pages. Counts are also redacted at ingest.
8. No disease term or claim verb inside a product module. Exact product titles are exempted
   from this scan because product names are fixed and are never changed to fix a claim.

All three gates have been negative-tested: each fails on an injected fault and passes clean.

## Deployment

Push to `main`. The workflow audits, builds, link-checks and deploys to GitHub Pages.

Site URL and base path come from `ATLAS_SITE` and `ATLAS_BASE`, set in the workflow. The
move to `nighantu.ageayurveda.com` is one command once the DNS CNAME exists:
`./scripts/use-subdomain.sh nighantu.ageayurveda.com`. It refuses to run until DNS
actually resolves, so it cannot break the live site by going early. See
[NEXT-STEPS.md](NEXT-STEPS.md).

## GEO surface

- `robots.txt` allows the answer-engine crawlers by name as well as by wildcard.
- `llms.txt` and `llms-full.txt` are served, but **do not count them as a retrieval
  mechanism**. An Ahrefs study across 137,000 sites found 97% of `llms.txt` files received
  zero requests in May 2026; no major AI provider has confirmed reading the format; Google's
  John Mueller has said server logs show AI bots do not even request it. SE Ranking found no
  correlation with AI citations across ~300,000 domains. They stay because serving them costs
  nothing and the convention may yet be adopted. They are not evidence of AI-readiness and
  should not be presented as such.
- A plain-Markdown twin of every page at its URL with `.md` appended.
- `sitemap-index.xml` and an RSS feed.
- Per page: a 40-60 word answer block above everything else, a key-facts table, question-form
  headings, a citation block, and JSON-LD `Article` + `DefinedTerm` + `BreadcrumbList`.
  `FAQPage` only where a real Q&A block exists.
- Deliberately not `MedicalWebPage`, `Drug` or `MedicalIndication` schema: those invite a
  regulatory reading of educational text and buy nothing in citation terms.

## Which index feeds which assistant

Worth knowing before optimising for "AI visibility", which is not one thing:

| Assistant | Retrieval layer |
| --- | --- |
| ChatGPT | Bing's index, blended with OpenAI's OAI-SearchBot |
| Claude | Brave Search (per Anthropic's subprocessor listing, 19 March 2025) |
| Google AI Overviews | Google's index |
| Perplexity | Google SERP data plus its own crawler |

Three separate indexes. Google is load-bearing for two of the four. Brave has no
webmaster tool and no submission route at all, so Claude is reached only by being
crawlable and linked.

## Automation

Runs on GitHub Actions cron, which is free and unlimited on public repos and, unlike any
local scheduler, survives the machine being closed.

| Workflow | When | What |
| --- | --- | --- |
| `deploy.yml` | on push | build, three gates, deploy, submit changed URLs |
| `monitor.yml` | daily 01:43 UTC | health, product links, competitor specs, freshness, public feeds |
| `search-health.yml` | Mondays 06:41 UTC | Bing Webmaster figures |
| `citation-panel.yml` | 1st, 05:23 UTC | the 53-prompt citation panel |

Findings become GitHub issues labelled `monitor`; trends go to
[data/DASHBOARD.md](data/DASHBOARD.md), which is committed rather than published so the
competitors named in the comparison table cannot read our own scoreboard.

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
