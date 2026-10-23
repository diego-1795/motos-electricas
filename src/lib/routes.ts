import type { CategorySlug, Part, Product } from '../domain/types';

/**
 * Única fuente de rutas internas del catálogo. Las páginas, tarjetas e islas
 * nunca componen URLs a mano (ADR-015: /bicimotos/[slug], /trimotos/[slug], /repuestos/[slug]).
 */

export function productPath(p: Pick<Product, 'category' | 'slug'>): string {
  return `/${p.category}/${p.slug}`;
}

export function categoryPath(slug: CategorySlug): string {
  return `/${slug}`;
}

export function partPath(p: Pick<Part, 'slug'> | string): string {
  return `/repuestos/${typeof p === 'string' ? p : p.slug}`;
}

/** Listado completo de vehículos */
export const ALL_PRODUCTS_PATH = '/productos';
export const PARTS_PATH = '/repuestos';
export const FINDER_PATH = '/encuentra-tu-moto';
export const COMPARE_PATH = '/comparar';
