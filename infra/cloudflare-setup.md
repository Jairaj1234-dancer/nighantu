# Putting Cloudflare in front of nighantu.ageayurveda.com

Canonical version of this page: https://nighantu.ageayurveda.com/

This is the one infrastructure change with a measurable case behind it, and the DNS part has to be
made by a person, so it is written down rather than automated.

## What it buys, in order of how much it matters

**1. Visibility into whether AI crawlers read this site at all.** GitHub Pages serves no access
logs. As a result this project cannot see a single GPTBot, ClaudeBot, OAI-SearchBot or
PerplexityBot request, and cannot see a ChatGPT referral even though OpenAI documents
`utm_source=chatgpt.com` as the publisher's tracking path. Every statement made here so far about
whether the content is being read has been an inference from citation panels. Cloudflare's bot
analytics answers it directly, on the free tier, with no code.

That gap is the reason the index probe exists. The probe asks an engine whether it can retrieve the
pages; crawler logs would say whether anything fetched them in the first place. Those are different
questions and the second one is currently unanswerable.

**2. Response headers, which Pages drops.** The build publishes 1,128 Markdown twins and 741
`.jsonld` records as alternate representations of pages. They declare their canonical in body text
because that is all Pages permits. `infra/cloudflare-worker.js` sends a real
`Link: <...>; rel="canonical"` header instead, and fixes the content types: Pages serves `.md` as
`text/plain` and `.jsonld` as `application/octet-stream`, and an octet-stream is something a
consumer downloads rather than parses.

**3. Caching in front of a static host**, which is free and changes nothing about correctness.

## What it must not be used for

No serving different content to crawlers than to readers, no blocking any crawler, no body
rewriting. A reference corpus whose output varies by user agent is cloaking, and this project's
entire position is that its claims are checkable by anyone who looks. The Worker annotates headers
and passes every byte through.

## What this costs, which is not nothing

READ THIS BEFORE THE STEPS. An earlier version of this file said the zone could be added as "just
the `nighantu` hostname if the apex is managed elsewhere and you would rather not move it". That is
wrong, and it is wrong in the direction that matters: it made this look like an isolated change.

Cloudflare's free plan must be authoritative for an entire zone. The two setups that would isolate
one hostname are both gated above it: partial CNAME setup is Business plan, and subdomain setup,
which delegates a single hostname with NS records at the parent, is Enterprise. Neither is
available here.

So putting `nighantu.ageayurveda.com` behind Cloudflare means moving the WHOLE `ageayurveda.com`
zone's nameservers off GoDaddy, and that zone is not just this site:

| Record | Points at | What breaks if it is lost |
| --- | --- | --- |
| apex `A` | `23.227.38.32`, Shopify | the live store |
| `www` `CNAME` | `shops.myshopify.com` | the live store |
| `MX` | `smtp.secureserver.net`, `mailstore1.secureserver.net` | all `@ageayurveda.com` mail |
| `TXT` SPF | `include:secureserver.net` | outbound mail starts failing SPF |
| `TXT` `_dmarc` | `p=quarantine` | DMARC alignment |
| `TXT` | `google-site-verification=…` | the Search Console property |

A missed record during the import is an outage in something that earns money, to buy a measurement
for something that does not yet earn anything. That trade may still be worth making, but it has to
be made knowingly, which is what this section exists for.

**The specific trap.** The apex and `www` must stay **DNS-only, grey cloud**. Shopify already
fronts every store with its own Cloudflare: the `cf-ray` header on `https://ageayurveda.com/` is
Shopify's, not yours. Proxying your Cloudflare on top of theirs breaks the store's TLS. Only
`nighantu` goes orange.

**The cheaper alternative, for most of the value.** Googlebot crawl statistics are in Search
Console under Settings, and Bingbot's are in Bing Webmaster Tools, which this project already has an
API key for. Neither needs a DNS change. What they do not cover, and what nothing but logs covers,
is GPTBot, ClaudeBot, OAI-SearchBot and PerplexityBot. If the question is "does Google fetch this",
do not move the zone. If it is "does any AI crawler fetch this", there is no other way.

## Steps

0. **Export the zone from GoDaddy first, and keep the file.** In GoDaddy's DNS management, export
   the zone file for `ageayurveda.com` before changing anything. Cloudflare's scanner finds most
   records and regularly misses some, and the export is the only way to check its import against
   the truth rather than against memory. Do not proceed without it. It is also the rollback: the
   way back is to point the nameservers at `ns25`/`ns26.domaincontrol.com` again, which only helps
   if the records are still known.

1. **Add the zone.** In Cloudflare, add `ageayurveda.com`. Free plan is sufficient. Let it scan,
   then compare its record list line by line against the export from step 0 and add by hand
   whatever it missed. Pay particular attention to `MX` and `TXT`: the scanner is least reliable
   there, and they are what mail depends on.

1a. **Set the proxy status before changing the nameservers, not after.** Apex grey, `www` grey,
   `MX` cannot be proxied at all, and `nighantu` orange. If the nameservers change while the apex
   is orange, the store breaks the moment the change propagates.

1b. **Change the nameservers at GoDaddy.** This is the irreversible-feeling step and the only one
   that affects the store and mail. In GoDaddy's nameserver settings for `ageayurveda.com`, replace
   `ns25.domaincontrol.com` and `ns26.domaincontrol.com` with the two Cloudflare gives you.
   Propagation is usually minutes and can take up to 24 hours, during which some resolvers answer
   from GoDaddy and some from Cloudflare, so **both have to be correct at once**. That is the real
   reason step 0 and step 1 come first.

1c. **Prove the store and mail still work before going any further.** Do this immediately, not at
   the end, because the fix is to revert the nameservers and that gets harder the longer it waits:

   ```
   dig +short ageayurveda.com                    # expect 23.227.38.32, Shopify
   dig +short www.ageayurveda.com                # expect shops.myshopify.com
   dig +short MX ageayurveda.com                 # expect both secureserver.net hosts
   dig +short TXT ageayurveda.com                # expect the SPF line AND the google-site-verification line
   curl -sI https://ageayurveda.com/ | head -1   # expect 200, and the store loads in a browser
   ```

   Then send a real message to an `@ageayurveda.com` address from an outside account and confirm it
   arrives. DNS answering correctly is not the same as mail being delivered, and mail is the failure
   that goes unnoticed for days.

2. **Point the record at GitHub Pages.** `nighantu` as a `CNAME` to
   `jairaj1234-dancer.github.io`, proxied (orange cloud). Proxied is the whole point: grey cloud is
   DNS-only and gives none of the above.

3. **Leave `public/CNAME` exactly as it is.** GitHub Pages uses it to know which host it serves,
   and it is unrelated to DNS. Changing or deleting it breaks the custom domain.

4. **SSL mode: Full.** Not Flexible. GitHub Pages serves valid HTTPS, and Flexible would make
   Cloudflare fetch over plain HTTP for no reason.

5. **Deploy the Worker.** `infra/cloudflare-worker.js`, with a route of
   `nighantu.ageayurveda.com/*`. The free plan's 100,000 requests a day is far above this site's
   traffic.

6. **Verify, and do not take it on trust.** The header is the thing to check:

   ```
   curl -sI https://nighantu.ageayurveda.com/herb/amla.md | grep -i '^link\|^content-type'
   ```

   Expect `Link: <https://nighantu.ageayurveda.com/herb/amla/>; rel="canonical"` and
   `Content-Type: text/markdown`. If the Link header is absent, the route did not match or the
   record is not proxied.

7. **Check the HTML is untouched.** The Worker should not alter page responses at all:

   ```
   curl -sI https://nighantu.ageayurveda.com/herb/amla/ | grep -i '^link' || echo "no Link header, correct"
   ```

## Afterwards

Two things become possible that are not possible today, and both are worth doing:

- **Record crawler hits in the monitor.** Cloudflare's analytics API can be read with a token, and
  the dashboard already has a place for it beside the Bing figures. That would replace the current
  inference with a measurement.
- **Retire the body-text canonical in the twins**, or keep it as belt and braces. It was only ever
  a workaround for the missing header, and `scripts/crawl-audit.mjs` enforces its presence on all
  1,128, so removing it is a deliberate decision rather than a tidy-up.

## What has already been done without it

Worth knowing so this is not treated as a prerequisite for everything. The sitemap already sends a
real `lastmod` per URL from the committed date ledger and no longer sends `changefreq` or
`priority`, which both Google and Bing state they ignore. Every table on all 1,077 pages carrying
one sets `th scope`. All 19 Dataset nodes carry the DOI and the Wikidata entity. None of that
needed a proxy.
