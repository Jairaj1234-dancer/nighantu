# Credentials the automation can use

Every job runs without these and degrades gracefully, so none of this blocks anything.
Each one unlocks a specific capability, listed with what it buys and what it costs.

Nothing here is ever pasted into a chat. Repository secrets are encrypted, are never
readable by visitors to a public repo, and are passed to scripts as environment
variables rather than interpolated into shell strings, so they cannot leak into a run
log.

---

## 1. Anthropic API key — the citation panel

**Buys:** the 53-prompt panel runs monthly, unattended, with web search, and logs whether
Age Ayurveda or the Nighantu was cited. Without it the panel only runs when you remember
to run it by hand, and on a new domain where movement takes 8 to 12 weeks a missed month
is a real hole in the data.

**Costs:** roughly a few dollars a month. This is the only paid thing here and the only
place a model is called anywhere in the automation.

1. Get a key at <https://console.anthropic.com/settings/keys>.
2. In the repo: **Settings → Secrets and variables → Actions → New repository secret**.
3. Name it exactly `ANTHROPIC_API_KEY`. Paste the value. Save.

Verify: **Actions → Citation panel → Run workflow**. Without the secret it logs a notice
and exits cleanly rather than failing.

Rotate any time; nothing caches it.

---

## 2. Bing Webmaster API key — search health

**Buys:** submission quota, impressions and clicks pulled into the dashboard weekly, so
search health becomes something you read rather than something you remember to check.
Bing matters more than its search share suggests because its index is one of the sources
behind Copilot and ChatGPT search.

**Costs:** nothing. Self-serve, no approval.

1. Sign in at <https://www.bing.com/webmasters> and verify the site.
2. **Settings** (top right) → **API Access** → accept the terms → **Generate API Key**.
3. Add it as the repository secret `BING_API_KEY`.

Two things worth knowing. Bing retired its SOAP and POX APIs on 31 August 2026, so any
code from an older tutorial is dead; `scripts/search-health.mjs` uses REST. And the
documented 10,000 URLs a day is not what a new site gets, so the script reads the real
quota at runtime rather than printing the headline number.

If you also set up IndexNow inside Bing Webmaster, **keep the existing key**
(`bf9a6ad9a651b9775c941d4fd074a13a`) rather than generating a new one, or the key file
served at the host root stops matching.

---

## 3. Zenodo — a DOI for every release

**Buys:** tagging a git release mints a permanent, citable DOI, automatically. The traffic
plan ranks this among the highest impact-per-hour items available, because a DOI enters
DataCite and therefore OpenAlex, which is how a reference work becomes formally citable
rather than merely linkable.

**Costs:** nothing.

1. Sign in to <https://zenodo.org> with GitHub.
2. **Settings → GitHub**, find `Jairaj1234-dancer/nighantu`, toggle it **on**.
3. In GitHub, publish a release (tag `v1.0.0`). Zenodo archives it and issues a DOI.
4. Add the DOI badge to `README.md`.

`.zenodo.json` already sits at the repo root and supplies the metadata, so you do not have
to fill the form. It states the provenance honestly, including that no practitioner has
reviewed the monographs. Leave that in: a false provenance statement inside a permanent
DOI record cannot be retracted.

Do not deposit marketing material. Zenodo is a research repository and curators remove
things that are not genuinely citable artefacts.

---

## 4. GoDaddy API key — the subdomain, one command

**Buys:** `./scripts/add-dns-record.sh nighantu ageayurveda.com` adds the CNAME for you.
GoDaddy lowered its API threshold to a single domain in April 2026, so the account
qualifies.

**Costs:** nothing.

1. Create a **Production** key (not OTE, the test environment) at
   <https://developer.godaddy.com/keys>.
2. Save it locally, never as a repo secret, since this one only ever runs from your
   machine:

   ```bash
   printf '%s\n%s\n' 'YOUR_KEY' 'YOUR_SECRET' > ~/.godaddy-api
   chmod 600 ~/.godaddy-api
   ```

The script reads your existing records and prints the ones it will not touch before it
writes anything. Your root A record, the `www` CNAME pointing at Shopify, and your MX mail
records are never modified.

---

## Deliberately not requested

**Shopify.** You declined it, so nothing in this repo touches the store. Worth knowing if
you reconsider: the admin-created custom app route closed on 1 January 2026, so it is now
a Dev Dashboard app using the client-credentials grant, with tokens that expire every 24
hours.

**Google Search Console.** The API can submit sitemaps and read inspection status via a
service account, but property verification is manual and Google does not officially
document service-account auth for this API. The "Request indexing" button has no API at
all. Left manual on purpose.

**Reddit, Quora and every other community platform.** No credential will be requested,
because none should exist. Reddit's Data API terms bar commercial use without a negotiated
licence and its Responsible Builder Policy forbids mixing an automation account with a
human one. Quora has no API and its terms name scripted content creation specifically. The
real exposure is a domain-level ban, which would silently poison every future mention of
the site including genuine third-party recommendations. The feed monitor reads public RSS
and files an issue; you reply as yourself, by hand, or not at all.
