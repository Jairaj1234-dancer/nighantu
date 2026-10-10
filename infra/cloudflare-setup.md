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

## Steps

1. **Add the zone.** In Cloudflare, add `ageayurveda.com` (or just the `nighantu` hostname if the
   apex is managed elsewhere and you would rather not move it). Free plan is sufficient.

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
