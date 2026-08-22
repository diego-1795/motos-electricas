import type { Accessory, BlogPost, Category, CategorySlug, FAQ, Product } from '../domain/types';

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

export interface AccessoryRepository {
  all(): Promise<Accessory[]>;
  bySlug(slug: string): Promise<Accessory | undefined>;
  bySlugs(slugs: string[]): Promise<Accessory[]>;
  compatibleWith(productSlug: string): Promise<Accessory[]>;
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

export interface Repositories {
  products: ProductRepository;
  accessories: AccessoryRepository;
  categories: CategoryRepository;
  blog: BlogRepository;
  faqs: FaqRepository;
}
