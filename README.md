# Ayurveda Atlas

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
scripts/config.mjs    all policy: allow list, deny list, thresholds, redactions
scripts/ingest.mjs    vault -> content/ (the only path in)
scripts/answer.mjs    composes the 40-60 word answer block on each page
scripts/audit.mjs     compliance gate; fails the build on a violation
scripts/linkcheck.mjs verifies every internal link in dist/
scripts/geo-audit.mjs citation panel, run monthly
guides/               hand-written guide pages (the Shirodhara hub)
content/              generated, committed, published
```

## Commands

```bash
npm run ingest:dry     # show the publish set and the deny set, write nothing
npm run ingest         # regenerate content/ from the vault
npm run audit          # compliance gate (also runs inside npm run build)
npm run build          # audit + astro build
npm run dev            # local dev server
node scripts/linkcheck.mjs        # after a build
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

Site URL and base path come from `ATLAS_SITE` and `ATLAS_BASE`, set in the workflow. Moving to
a subdomain later (`atlas.ageayurveda.com`) is a CNAME at the registrar plus setting
`ATLAS_BASE=/`, then re-running `npm run ingest` so the baked-in link prefixes update.

## GEO surface

- `robots.txt` allows the answer-engine crawlers by name as well as by wildcard.
- `llms.txt` (curated index) and `llms-full.txt` (every answer block and key fact).
- A plain-Markdown twin of every page at its URL with `.md` appended.
- `sitemap-index.xml` and an RSS feed.
- Per page: a 40-60 word answer block above everything else, a key-facts table, question-form
  headings, a citation block, and JSON-LD `Article` + `DefinedTerm` + `BreadcrumbList`.
  `FAQPage` only where a real Q&A block exists.
- Deliberately not `MedicalWebPage`, `Drug` or `MedicalIndication` schema: those invite a
  regulatory reading of educational text and buy nothing in citation terms.

## Licensing

Monograph text incorporates material from the Amidha Ayurveda Herb Database under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution is carried site-wide in
the footer, on `/how-we-source/`, and in every Markdown twin.
