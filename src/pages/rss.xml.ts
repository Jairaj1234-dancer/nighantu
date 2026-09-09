import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { KINDS, SECTION_META } from '../lib/collections';
import { SITE_NAME, TAGLINE } from '../lib/site';

export async function GET(context: APIContext) {
  const items = [];
  for (const kind of KINDS) {
    for (const e of await getCollection(kind)) {
      items.push({
        title: e.data.title,
        description: e.data.answer,
        link: `${SECTION_META[kind].href}${e.data.slug}/`,
        pubDate: new Date(),
      });
    }
  }
  items.sort((a, b) => a.title.localeCompare(b.title, 'en'));
  return rss({
    title: SITE_NAME,
    description: TAGLINE,
    site: context.site!,
    items: items.slice(0, 400),
  });
}
