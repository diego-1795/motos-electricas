/**
 * Stock (ADR-035). Puro: recibe los umbrales (src/config/site.ts → `site.stock`) como parámetro.
 *
 * El stock es opcional: sin número, manda la disponibilidad puesta a mano (como antes). Con número:
 *  - 0 unidades → "Agotado", salvo que la ficha diga "Bajo pedido" o "Próximamente" (se puede seguir pidiendo);
 *  - 1..umbral → "En stock" con el aviso "¡Últimas unidades!";
 *  - más → "En stock".
 * La web nunca muestra el número de unidades, solo el aviso; el número exacto se ve en el panel.
 */
import type { Availability, Part, Product, ProductVariant } from './types';

export interface StockThresholds {
  /** Motos: con este número de unidades o menos, "¡Últimas unidades!" */
  lowProducts: number;
  /** Repuestos: con este número de unidades o menos, "¡Últimas unidades!" */
  lowParts: number;
}

export const MAX_STOCK = 9999;
export const LOW_STOCK_LABEL = '¡Últimas unidades!';

/** Disponibilidad real a partir del stock (si lo hay) y de la disponibilidad puesta a mano */
export function effectiveAvailability(availability: Availability, stock: number | undefined): Availability {
  if (stock === undefined) return availability;
  if (stock > 0) return 'en-stock';
  return availability === 'bajo-pedido' || availability === 'proximamente' ? availability : 'agotado';
}

/** Quedan pocas unidades (y alguna) */
export const isLowStock = (stock: number | undefined, threshold: number): boolean => stock !== undefined && stock > 0 && stock <= threshold;

/** Versión con su disponibilidad real (la capa de datos la aplica al cargar el catálogo) */
export const withStock = (v: ProductVariant): ProductVariant => ({ ...v, availability: effectiveAvailability(v.availability, v.stock) });
export const productWithStock = (p: Product): Product => ({ ...p, variants: p.variants.map(withStock) });
export const partWithStock = (a: Part): Part => ({ ...a, availability: effectiveAvailability(a.availability, a.stock) });

/**
 * Un producto está en "últimas unidades" si todas sus versiones disponibles llevan stock y entre todas
 * no pasan del umbral (si alguna versión disponible no lleva número, no se sabe: sin aviso).
 */
export function productLowStock(p: Product, threshold: number): boolean {
  const inStock = p.variants.filter((v) => effectiveAvailability(v.availability, v.stock) === 'en-stock');
  if (!inStock.length || inStock.some((v) => v.stock === undefined)) return false;
  const total = inStock.reduce((n, v) => n + (v.stock ?? 0), 0);
  return total > 0 && total <= threshold;
}

/** Errores de un número de stock escrito a mano o recibido por el API */
export function stockErrors(stock: unknown, label: string): string[] {
  if (stock === undefined || stock === null) return [];
  if (typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0) return [`${label}: el stock debe ser un número entero de 0 o más`];
  if (stock > MAX_STOCK) return [`${label}: el stock no puede pasar de ${MAX_STOCK}`];
  return [];
}
