/**
 * Make root-relative links in markdown survive a change of base path.
 *
 * Vault-derived pages get their links written by scripts/ingest.mjs, which applies
 * withBase() at ingest time. Hand-authored pages (content/practice, content/choosing) are
 * written by a person, and every one of them hardcoded "/nighantu/..." because that was the
 * base when they were written. Moving the site to its own subdomain, where the base becomes
 * "/", broke ten of those links at once and the link check caught it.
 *
 * Rewriting them by hand would have worked exactly until the next base change. This strips a
 * stale base prefix and applies the current one, so a link written as "/herb/haritaki/" is
 * correct under any base and a legacy "/nighantu/herb/haritaki/" is repaired on the way out.
 *
 * External links, anchors, mailto and protocol-relative URLs are left alone.
 *
 * IN-CONTENT LINKS ARE ALSO MADE ABSOLUTE, and that is deliberate.
 *
 * When a page of this site is copied wholesale, which is the normal fate of a reference corpus,
 * every relative link in the copy resolves against the COPYIST'S domain. The stolen page then
 * links to pages the thief does not have, so the theft costs us the link equity and costs them
 * nothing but a few 404s. Absolute in-content links invert that: a copied monograph arrives on
 * their site carrying forty-odd links back here, and a reader who follows any of them lands on
 * the original. It is the oldest trick publishers have and it needs no script, which matters
 * because crawl-audit.mjs fails the build on any script that is not JSON-LD.
 *
 * It only applies to MARKDOWN BODY links, because that is the part that gets copied. Navigation,
 * stylesheets and layout chrome keep their relative paths: they are rewritten by the layouts, not
 * here, and a copyist takes the article rather than the furniture.
 *
 * Same-origin absolute links are neutral for the site's own readers and for search engines. The
 * one real cost is that scripts/linkcheck.mjs skipped anything matching a URL scheme as external,
 * so this change would have silently removed 40,000-odd internal links from the deploy gate. That
 * script now recognises its own origin and checks them, which had to land in the same change.
 */
const LEGACY_BASES = ['/nighantu'];

export function rehypeBaseLinks() {
  const base = (import.meta.env?.BASE_URL ?? process.env.ATLAS_BASE ?? '').replace(/\/$/, '');
  const site = (process.env.ATLAS_SITE ?? 'https://nighantu.ageayurveda.com').replace(/\/$/, '');

  return (tree) => {
    const visit = (node) => {
      if (node.type === 'element' && (node.tagName === 'a' || node.tagName === 'img')) {
        const key = node.tagName === 'a' ? 'href' : 'src';
        const value = node.properties?.[key];
        if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
          let path = value;
          for (const legacy of LEGACY_BASES) {
            if (path === legacy || path.startsWith(`${legacy}/`)) path = path.slice(legacy.length) || '/';
          }
          node.properties[key] = `${site}${base}${path}`;
        }
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}
