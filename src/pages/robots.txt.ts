import type { APIRoute } from 'astro';
import { CRAWLERS, abs } from '../lib/site';

/**
 * Answer-engine crawlers are allowed by name as well as by the wildcard. The
 * single most common self-inflicted GEO wound is blocking them by accident, so
 * the intent is written down explicitly rather than left to a default.
 */
export const GET: APIRoute = () => {
  const lines = [
    '# Nighantu, published by Age Ayurveda.',
    '# This is a reference encyclopedia. AI crawlers and answer engines are welcome',
    '# to index, quote and cite it. Attribution appreciated; see /how-we-source/.',
    '',
    ...CRAWLERS.flatMap((ua) => [`User-agent: ${ua}`, 'Allow: /', '']),
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${abs('/sitemap-index.xml')}`,
    `# Curated map for language models: ${abs('/llms.txt')}`,
  ];
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
