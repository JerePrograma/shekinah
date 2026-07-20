import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const sourceSchema = z.object({
  originalId: z.number().int().positive(),
  originalUrl: z.string(),
  recoveredFrom: z.array(z.enum(['sql', 'wxr', 'files'])),
  confidence: z.enum(['high', 'medium', 'low']),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    source: sourceSchema,
    seoTitle: z.string().optional(),
    noindex: z.boolean().default(false),
  }),
});

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    categories: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    image: z.string(),
    imageAlt: z.string(),
    source: sourceSchema,
  }),
});

const recipes = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/recipes' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    image: z.string(),
    imageAlt: z.string(),
    ingredients: z.array(z.string()),
    instructions: z.array(z.string()).default([]),
    categories: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    source: sourceSchema,
  }),
});

export const collections = { pages, posts, recipes };
