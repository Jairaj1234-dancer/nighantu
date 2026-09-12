import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const pageSchema = z.object({
  title: z.string(),
  slug: z.string(),
  kind: z.string(),
  section: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  group: z.string().optional(),
  answer: z.string(),
  botanical: z.string().optional(),
  family: z.string().optional(),
  sanskrit: z.string().optional(),
  ayurvedicCategory: z.string().optional(),
  whoStatus: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
  productHints: z.array(z.string()).default([]),
  words: z.number().optional(),
  srcRel: z.string().optional(),
});

const guideSchema = z.object({
  title: z.string(),
  slug: z.string(),
  order: z.number(),
  answer: z.string(),
  description: z.string().optional(),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  products: z.string().optional(),
});

const glossarySchema = z.object({
  title: z.string(),
  slug: z.string(),
  kind: z.literal('glossary'),
  group: z.string(),
  groupTitle: z.string(),
  range: z.string(),
  part: z.number(),
  partCount: z.number(),
  entryCount: z.number(),
  answer: z.string(),
});

/**
 * Practice pages: what a procedure is, who may perform it, and where it comes from.
 *
 * `level` is the load-bearing field. It decides how the page is written and framed, and
 * a vaidya-only procedure written as home instructions is the failure this section has
 * to avoid. `citationVerified` records whether the classical reference was actually
 * checked, so a page can say which it is rather than implying certainty it does not have.
 */
const practiceSchema = z.object({
  title: z.string(),
  slug: z.string(),
  kind: z.literal('practice'),
  level: z.enum(['self-care', 'supervised', 'vaidya-only']),
  sanskrit: z.string().optional(),
  answer: z.string(),
  classicalSource: z.string().optional(),
  citationVerified: z.boolean().default(false),
  citationNote: z.string().optional(),
  dravyas: z.array(z.string()).default([]),
  // Drugs the page names that have no monograph here yet, so the renderer knows not to
  // attempt a cross-link. Recorded rather than removed: the gap is real information.
  dravyasWithoutPages: z.array(z.string()).default([]),
  cautions: z.array(z.string()).default([]),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
});

const mk = (dir: string, schema: any) => defineCollection({
  loader: glob({ pattern: '**/*.md', base: `./content/${dir}` }),
  schema,
});

const guide = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './guides' }),
  schema: guideSchema,
});

export const collections = {
  guide,
  herb: mk('herb', pageSchema),
  formulation: mk('formulation', pageSchema),
  device: mk('device', pageSchema),
  reference: mk('reference', pageSchema),
  text: mk('text', pageSchema),
  glossary: mk('glossary', glossarySchema),
  practice: mk('practice', practiceSchema),
};
