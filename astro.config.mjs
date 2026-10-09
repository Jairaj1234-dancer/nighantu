import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { rehypeBaseLinks } from './src/lib/rehype-base-links.mjs';
import { rehypeTableScope } from './src/lib/rehype-table-scope.mjs';
import PAGE_DATES from './src/data/page-dates.json' with { type: 'json' };

const SITE = process.env.ATLAS_SITE || 'https://nighantu.ageayurveda.com';
const BASE = process.env.ATLAS_BASE || '';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'always',
  build: { format: 'directory' },
  /**
   * The sitemap carries a real lastmod per URL, from the date ledger.
   *
   * It previously sent changefreq and priority and no lastmod at all, which is the worst of
   * both: Google's documentation states plainly that it ignores changefreq and priority, and
   * uses lastmod as a recrawl signal. So 905 URLs were advertising only the two hints Google
   * discards while withholding the one it reads. Pages edited on 19 September gave Googlebot
   * no indication anything had changed, which is a plausible reason none of those edits moved.
   *
   * src/data/page-dates.json already tracks published and modified per page, hashed on
   * content and gated in CI by stamp-dates.mjs --check, so the dates are honest rather than
   * build timestamps. A URL with no ledger entry gets no lastmod rather than a guess: an
   * invented date is a worse signal than an absent one, because it trains the crawler to
   * distrust the field.
   */
  integrations: [sitemap({
    /**
     * No changefreq and no priority, because both engines that matter say in writing that they
     * ignore them. Bing stated flatly on 31 July 2025 that "changefreq and priority are ignored by
     * Bing", and Google's sitemap documentation says the same of both. They were set here to
     * 'monthly' and 0.7 on all 1,234 URLs, which told every crawler the same uninformative thing
     * about every page and made the file larger for nothing.
     *
     * lastmod is the one field both engines document reading, and it is set per URL below from the
     * committed date ledger.
     */
    serialize(item) {
      const base = BASE.replace(/\/$/, '');
      let p = new URL(item.url).pathname;
      if (base && p.startsWith(base)) p = p.slice(base.length);
      const key = p.replace(/^\/|\/$/g, '');
      // Guide pages live at /shirodhara/<slug>/ but are keyed guide/<slug> in the ledger.
      const candidates = [key, key.replace(/^shirodhara\//, 'guide/')];
      if (key === 'shirodhara') candidates.push('guide/shirodhara');
      for (const c of candidates) {
        const entry = PAGE_DATES[c];
        if (entry?.modified) { item.lastmod = `${entry.modified}T00:00:00+00:00`; break; }
      }
      return item;
    },
  })],
  markdown: {
    shikiConfig: { theme: 'github-light' },
    // Hand-authored pages write links as "/herb/haritaki/" and this applies whatever base
    // the build is using, repairing the legacy "/nighantu" prefix on the way. See the
    // module for why hardcoding the base broke ten links the day the subdomain went live.
    rehypePlugins: [rehypeBaseLinks, rehypeTableScope],
  },
});
