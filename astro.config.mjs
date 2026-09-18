import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { rehypeBaseLinks } from './src/lib/rehype-base-links.mjs';

const SITE = process.env.ATLAS_SITE || 'https://nighantu.ageayurveda.com';
const BASE = process.env.ATLAS_BASE || '';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap({ changefreq: 'monthly', priority: 0.7 })],
  markdown: {
    shikiConfig: { theme: 'github-light' },
    // Hand-authored pages write links as "/herb/haritaki/" and this applies whatever base
    // the build is using, repairing the legacy "/nighantu" prefix on the way. See the
    // module for why hardcoding the base broke ten links the day the subdomain went live.
    rehypePlugins: [rehypeBaseLinks],
  },
});
