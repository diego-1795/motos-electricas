import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { categorySlug, image, partSchema, productSchema } from './content/schemas';

/**
 * Content collections = "base de datos" del MVP (git como CMS).
 * Los esquemas de productos y repuestos viven en src/content/schemas.ts (compartidos con
 * el panel de administración, ADR-018); el resto se define aquí. Reflejan src/domain/types.ts.
 * El repositorio (src/data) es la única capa que los consume.
 */

const products = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/products' }),
  schema: productSchema,
});

const repuestos = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/repuestos' }),
  schema: partSchema,
});

const categories = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/categories' }),
  schema: z.object({
    slug: categorySlug,
    name: z.string(),
    title: z.string(),
    description: z.string(),
    tagline: z.string(),
    image: image.optional(),
    order: z.number(),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(['guias', 'comparativas', 'autonomia', 'baterias', 'mantenimiento', 'legislacion', 'movilidad', 'compra']),
    publishedAt: z.string(),
    updatedAt: z.string().optional(),
    author: z.string(),
    // readingMinutes NO va en el frontmatter: lo calcula src/domain/reading.ts del cuerpo
    image: image.optional(),
    relatedProducts: z.array(z.string()).default([]),
  }),
});

const faqs = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/faqs' }),
  schema: z.object({
    group: z.string(),
    order: z.number(),
    items: z.array(z.object({ question: z.string(), answer: z.string() })),
  }),
});

/** Testimonios reales (reseñas públicas, p. ej. Google Maps). Un archivo por origen. */
const testimonials = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/testimonials' }),
  schema: z.object({
    source: z.string(),
    label: z.string(),
    note: z.string().optional(),
    items: z.array(z.object({ author: z.string(), rating: z.number().int().min(1).max(5), text: z.string(), date: z.string() })),
  }),
});

export const collections = { products, repuestos, categories, blog, faqs, testimonials };
