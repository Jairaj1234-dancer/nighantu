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
};
