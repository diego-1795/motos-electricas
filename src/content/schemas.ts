import { z } from 'astro/zod';
import type { Part, Product } from '../domain/types';
import { partRules, productRules, type CatalogContext } from '../domain/catalogRules';

/**
 * Esquemas zod del catálogo (productos y repuestos). Única definición, usada por:
 *  - src/content.config.ts (validación en build de las content collections)
 *  - functions/api/admin/* (validación de lo que escribe el panel, ADR-018)
 * Reflejan src/domain/types.ts. `astro/zod` es el mismo zod que `astro:content`,
 * pero importable fuera de Astro (Pages Functions, Vitest).
 */

export const money = z.object({ amount: z.number().int().nonnegative(), currency: z.literal('PEN') });

/**
 * URLs que acaban en atributos href/src del HTML público. Solo rutas del sitio (`/…`), assets del
 * repo (`~/assets/…`) o https. Bloquea `javascript:`/`data:` aunque llegue por el panel (ADR-018).
 */
const SAFE_SRC_RE = /^(~\/assets\/|\/(?!\/)|https:\/\/)/;
export const safeUrl = z.string().regex(SAFE_SRC_RE, 'debe empezar por ~/assets/, / o https://');

export const image = z.object({
  src: safeUrl,
  alt: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const availability = z.enum(['en-stock', 'bajo-pedido', 'proximamente', 'agotado']);
export const categorySlug = z.enum(['bicimotos', 'trimotos', 'repuestos', 'promociones']);
export const useCase = z.enum(['ciudad', 'trabajo', 'reparto', 'ocio', 'trayectos-largos', 'dos-personas', 'carga']);
export const partKind = z.enum(['bateria', 'motor', 'controlador', 'cargador', 'iluminacion', 'frenos', 'cables', 'mandos', 'seguridad', 'llantas', 'otro']);

export const battery = z.object({
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

export const specs = z.object({
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

export const variant = z.object({
  id: z.string(),
  name: z.string(),
  tier: z.enum(['estandar', 'premium']),
  description: z.string().optional(),
  price: money,
  specsOverride: specs.pick({ rangeKm: true, rangeMinKm: true, topSpeedKmh: true, powerW: true, battery: true, weightKg: true, controller: true }).partial().optional(),
  availability,
  sku: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export const color = z.object({ id: z.string(), name: z.string(), hex: z.string(), image: image.optional(), priceDelta: money.optional() });

export const productSchema = z.object({
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
  variants: z.array(variant).min(1),
  colors: z.array(color),
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
  datasheetUrl: safeUrl.optional(),
  manualUrl: safeUrl.optional(),
  videoUrl: safeUrl.optional(),
  /** Oculto desde el panel (ADR-018). Opcional; ausente = visible. */
  hidden: z.boolean().optional(),
});

export const partSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  price: money,
  image: image.optional(),
  availability,
  kind: partKind,
  unit: z.enum(['UND', 'PAR']).default('UND'),
  code: z.string().optional(),
  compatibleWith: z.array(z.string()),
  hidden: z.boolean().optional(),
});

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const issues = (e: z.ZodError): string[] => e.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`);

/** Esquema + reglas de negocio (src/domain/catalogRules.ts). Es lo que ejecuta el servidor del panel antes de escribir. */
export function parseProduct(input: unknown, ctx: CatalogContext = {}): ParseResult<Product> {
  const r = productSchema.strict().safeParse(input);
  if (!r.success) return { ok: false, errors: issues(r.error) };
  const value = r.data as Product;
  const errors = productRules(value, ctx);
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

export function parsePart(input: unknown, ctx: CatalogContext = {}): ParseResult<Part> {
  const r = partSchema.strict().safeParse(input);
  if (!r.success) return { ok: false, errors: issues(r.error) };
  const value = r.data as Part;
  const errors = partRules(value, ctx);
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
