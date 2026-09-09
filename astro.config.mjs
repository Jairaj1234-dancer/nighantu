import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const SITE = process.env.ATLAS_SITE || 'https://jairaj1234-dancer.github.io';
const BASE = process.env.ATLAS_BASE || '/ayurveda-atlas';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap({ changefreq: 'monthly', priority: 0.7 })],
  markdown: {
    shikiConfig: { theme: 'github-light' },
  },
});
