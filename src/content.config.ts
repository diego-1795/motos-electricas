import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Content collections = "base de datos" del MVP (git como CMS).
 * Los esquemas reflejan src/domain/types.ts y validan en build.
 * El repositorio (src/data) es la única capa que los consume.
 */

const money = z.object({ amount: z.number().int().nonnegative(), currency: z.literal('PEN') });

const image = z.object({
  src: z.string(),
  alt: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const availability = z.enum(['en-stock', 'bajo-pedido', 'proximamente', 'agotado']);
const categorySlug = z.enum(['bicimotos', 'trimotos', 'repuestos', 'promociones']);
const useCase = z.enum(['ciudad', 'trabajo', 'reparto', 'ocio', 'trayectos-largos', 'dos-personas', 'carga']);

const battery = z.object({
  voltage: z.number(),
  capacityAh: z.number(),
  capacityKwh: z.number(),
  chemistry: z.enum(['LiFePO4', 'NMC', 'plomo-acido', 'otro']),
  removable: z.boolean(),
  chargeHours: z.tuple([z.number(), z.number()]),
  cycles: z.number().optional(),
  lifeMonths: z.number().optional(),
  brand: z.string().optional(),
});

const specs = z.object({
  rangeKm: z.number(),
  rangeMinKm: z.number().optional(),
  topSpeedKmh: z.number(),
  powerW: z.number(),
  peakPowerW: z.number().optional(),
  battery,
  weightKg: z.number().optional(),
  maxLoadKg: z.number(),
  seats: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  license: z.enum(['sin-licencia', 'B-I', 'B-IIa', 'B-IIb', 'B-IIc']),
  dimensionsMm: z.tuple([z.number(), z.number(), z.number()]).optional(),
  tires: z.string().optional(),
  wheelInches: z.number().optional(),
  brakes: z.string(),
  suspension: z.string(),
  lighting: z.string(),
  display: z.string(),
  drivingModes: z.array(z.string()),
  motorType: z.string(),
  controller: z.string().optional(),
  ipRating: z.string().optional(),
  warrantyMonths: z.number(),
  batteryWarrantyMonths: z.number(),
  features: z.array(z.string()).default([]),
});

const products = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/products' }),
  schema: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    subtitle: z.string(),
    claim: z.string(),
    description: z.string(),
    category: categorySlug,
    brand: z.string(),
    images: z.array(image).min(1),
    heroImage: image.optional(),
    specs,
    variants: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          tier: z.enum(['estandar', 'premium']),
          description: z.string().optional(),
          price: money,
          specsOverride: specs.pick({ rangeKm: true, rangeMinKm: true, topSpeedKmh: true, powerW: true, battery: true, weightKg: true, controller: true }).partial().optional(),
          availability,
          sku: z.string().optional(),
          isDefault: z.boolean().optional(),
        }),
      )
      .min(1),
    colors: z.array(z.object({ id: z.string(), name: z.string(), hex: z.string(), image: image.optional(), priceDelta: money.optional() })),
    accessories: z.array(z.string()),
    related: z.array(z.string()),
    useCases: z.array(useCase),
    highlights: z.array(z.string()),
    technology: z.array(z.object({ title: z.string(), text: z.string() })),
    faqs: z.array(z.object({ question: z.string(), answer: z.string() })),
    reviews: z
      .array(z.object({ author: z.string(), rating: z.number().int().min(1).max(5), text: z.string(), date: z.string() }))
      .optional(),
    featured: z.number(),
    isNew: z.boolean().optional(),
    isHero: z.boolean().optional(),
    publishedAt: z.string(),
    seo: z.object({ title: z.string().optional(), description: z.string().optional() }).optional(),
    datasheetUrl: z.string().optional(),
    manualUrl: z.string().optional(),
    videoUrl: z.string().optional(),
  }),
});

const repuestos = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/repuestos' }),
  schema: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    price: money,
    image: image.optional(),
    availability,
    kind: z.enum(['bateria', 'motor', 'controlador', 'cargador', 'iluminacion', 'frenos', 'cables', 'mandos', 'seguridad', 'llantas', 'otro']),
    unit: z.enum(['UND', 'PAR']).default('UND'),
    code: z.string().optional(),
    compatibleWith: z.array(z.string()),
  }),
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
