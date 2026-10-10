/**
 * A Cloudflare Worker to sit in front of GitHub Pages, for the one thing Pages cannot do.
 *
 * WHY THIS IS NEEDED. GitHub Pages serves static files and drops any response header set at build
 * time, so this site cannot send an HTTP `Link: rel="canonical"`. That matters because the build
 * publishes 1,128 Markdown twins at /herb/amla.md and so on, each a near-duplicate of its HTML
 * page. Bing's own guidance describes clustering near-duplicates and picking one representative
 * without asking the publisher which; if it picks a twin, a citation lands on a page with no
 * navigation and no markup. The twins state their canonical in the body text because that is all
 * Pages allows. A header is the mechanism the standard actually defines.
 *
 * It also closes the measurement gap that matters more than any of it. Pages serves no logs, so
 * this project cannot see a single GPTBot, ClaudeBot, OAI-SearchBot or PerplexityBot request, and
 * cannot see a ChatGPT referral even though OpenAI documents utm_source=chatgpt.com as the
 * publisher's tracking path. Putting Cloudflare in front gives bot analytics for free, and this
 * Worker is where anything beyond that would go.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not rewrite bodies, redirect, block any crawler, or
 * vary what it serves by user agent. A reference corpus that shows different content to a crawler
 * than to a reader is cloaking, and this project's whole position is that its claims are
 * checkable. Every crawler gets exactly what a person gets.
 *
 * DEPLOY: see infra/cloudflare-setup.md. The DNS change is the part a person has to make.
 */

const SITE = 'https://nighantu.ageayurveda.com';

/**
 * Content types we annotate, and nothing else.
 *
 * Only the alternate representations get a canonical header: the .md twins and the per-record
 * .jsonld endpoints. HTML pages already carry <link rel="canonical"> in the head, which is the
 * right place for them, and duplicating it in a header risks the two disagreeing after a build
 * change. One source per claim.
 */
const ALTERNATE = [
  { suffix: '.md', type: 'text/markdown; charset=utf-8' },
  { suffix: '.jsonld', type: 'application/ld+json; charset=utf-8' },
];

/**
 * The collections whose .md and .jsonld files are twins of an HTML page.
 *
 * AN ALLOWLIST, NOT A PATH-SHAPE RULE, because a rule gets this wrong and a wrong canonical is
 * worse than none. The first version of this stripped the suffix and added a slash for any .md,
 * which turns /CORPUS-FILES.md into a canonical of /CORPUS-FILES/ and that page does not exist:
 * the header would have named a 404 for every standalone document the site publishes. Caught by
 * running the real URL shapes through it rather than reading the code.
 *
 * Derived from the build: 505 herb, 277 lexicon, 143 formulation, 53 reference, 43 practice, 37
 * device, 28 concept, 15 shirodhara, 14 glossary, 5 choosing and 2 text twins. If a new collection
 * starts emitting twins it must be added here, and until it is those twins simply get no header,
 * which is the safe direction to fail in.
 */
const TWIN_COLLECTIONS = new Set([
  'herb', 'lexicon', 'formulation', 'reference', 'practice',
  'device', 'concept', 'shirodhara', 'glossary', 'choosing', 'text',
]);

/**
 * Root-level files that ARE twins, and are the exception to the rule above.
 *
 * /shirodhara.md is the twin of /shirodhara/, the guide's own page, so it is legitimate despite
 * sitting at the root. /knowledge-graph.jsonld and /CORPUS-FILES.md also sit at the root and are
 * NOT twins: they are standalone documents whose canonical is themselves. Naming them here keeps
 * the distinction explicit rather than resting on a path-length accident.
 */
const ROOT_TWINS = new Set(['/shirodhara.md']);

/**
 * The canonical HTML address for an alternate representation, or null if there is not one.
 *
 * /herb/amla.md is the twin of /herb/amla/ and /herb/amla.jsonld is its machine record, so both
 * point at the same directory URL. The site uses trailingSlash: 'always', so the slash matters:
 * without it the canonical would 301 and the header would name a redirect rather than a document.
 */
function canonicalFor(pathname) {
  const match = ALTERNATE.find(({ suffix }) => pathname.endsWith(suffix));
  if (!match) return null;
  if (ROOT_TWINS.has(pathname)) {
    return `${SITE}${pathname.slice(0, -match.suffix.length)}/`;
  }
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  if (!TWIN_COLLECTIONS.has(segments[0])) return null;
  return `${SITE}${pathname.slice(0, -match.suffix.length)}/`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const response = await fetch(request);

    const canonical = canonicalFor(url.pathname);
    if (!canonical) return response;

    // Headers are immutable on a fetch response, so clone before touching them.
    const headers = new Headers(response.headers);
    headers.set('Link', `<${canonical}>; rel="canonical"`);

    /**
     * The content type is set alongside it because GitHub Pages serves .md as text/plain and
     * .jsonld as application/octet-stream, and an octet-stream is something a consumer downloads
     * rather than parses. llms.txt tells crawlers the twins are the plain-text rendering of each
     * page, which is only true if they arrive as text.
     */
    const match = ALTERNATE.find(({ suffix }) => url.pathname.endsWith(suffix));
    if (match) headers.set('Content-Type', match.type);

    // These files are generated per build and immutable between builds.
    headers.set('Cache-Control', 'public, max-age=3600, must-revalidate');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
