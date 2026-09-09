# What to do next, in order

Everything here is free. Items 1 to 3 need your login or your registrar and cannot be done for
you. Item 4 onward is work I can do once you say go.

Current state: the Nighantu is live at https://jairaj1234-dancer.github.io/nighantu/ with 778
pages. A root `robots.txt` and `llms.txt` now exist at
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

## Still open

- **A named reviewer.** `/reviewers/` states plainly that no practitioner has signed off. A named
  vaidya credited for reviewing even one section would raise citation odds materially. Needs a
  real person willing to be named.
- **Chyawanprash facts.** The classical herb count is contested across sources and the Bhasma in
  pregnancy question is unresolved. Counts are redacted automatically until settled.
- **The Surya one-pager** still carries the false "only portable Shirodhara device" claim.
  Corrected copy is at `~/Desktop/Surya-Shirodhara/Dropship-Kit/positioning-correction.md`.
