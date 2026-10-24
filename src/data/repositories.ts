import type { BlogPost, Category, CategorySlug, FAQ, Part, Product } from '../domain/types';
import type { Testimonial } from '../domain/testimonials';

/**
 * Contratos de acceso a datos. La UI y los servicios dependen de estas
 * interfaces, no de Astro content collections ni de Supabase.
 * - MVP: JsonRepositories (src/data/json.ts) — build estático.
 * - Futuro: SupabaseRepositories (src/data/supabase.ts) — misma interfaz.
 */

export interface ProductRepository {
  all(): Promise<Product[]>;
  bySlug(slug: string): Promise<Product | undefined>;
  byCategory(category: CategorySlug): Promise<Product[]>;
  bySlugs(slugs: string[]): Promise<Product[]>;
  hero(): Promise<Product | undefined>;
  featured(limit?: number): Promise<Product[]>;
}

/** Repuestos (antes accesorios) */
export interface PartRepository {
  all(): Promise<Part[]>;
  bySlug(slug: string): Promise<Part | undefined>;
  bySlugs(slugs: string[]): Promise<Part[]>;
  compatibleWith(productSlug: string): Promise<Part[]>;
}

export interface CategoryRepository {
  all(): Promise<Category[]>;
  bySlug(slug: CategorySlug): Promise<Category | undefined>;
}

export interface BlogRepository {
  all(): Promise<(BlogPost & { body: string })[]>;
  bySlug(slug: string): Promise<(BlogPost & { body: string }) | undefined>;
}

export interface FaqRepository {
  groups(): Promise<{ group: string; items: FAQ[] }[]>;
}

/** Reseñas públicas reales del negocio (Google Maps…), para "Comunidad RAIDEN" */
export interface TestimonialRepository {
  all(): Promise<Testimonial[]>;
}

export interface Repositories {
  products: ProductRepository;
  parts: PartRepository;
  categories: CategoryRepository;
  blog: BlogRepository;
  faqs: FaqRepository;
  testimonials: TestimonialRepository;
}
