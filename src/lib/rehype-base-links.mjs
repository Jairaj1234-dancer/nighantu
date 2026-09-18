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
 */
const LEGACY_BASES = ['/nighantu'];

export function rehypeBaseLinks() {
  const base = (import.meta.env?.BASE_URL ?? process.env.ATLAS_BASE ?? '').replace(/\/$/, '');

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
          node.properties[key] = `${base}${path}`;
        }
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}
