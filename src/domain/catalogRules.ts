import type { Part, Product } from './types';

/**
 * Reglas de integridad del catálogo que el esquema (tipos) no expresa. Puras y sin
 * dependencias: las ejecuta el servidor del panel de administración antes de escribir
 * (ADR-018) y reflejan lo que scripts/validate-content.mjs comprueba en CI.
 * Devuelven una lista de errores legibles (vacía = válido).
 */

export interface CatalogContext {
  /** Slugs de productos existentes (para `related`, `compatibleWith`) */
  productSlugs?: string[];
  /** Slugs de repuestos existentes (para `accessories`) */
  partSlugs?: string[];
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isValidSlug = (s: string): boolean => SLUG_RE.test(s);

/** Importe válido: entero en céntimos, no negativo, en soles */
export function moneyErrors(m: { amount: number; currency: string } | undefined, label: string): string[] {
  if (!m) return [];
  const errs: string[] = [];
  if (m.currency !== 'PEN') errs.push(`${label}: la moneda debe ser PEN`);
  if (!Number.isInteger(m.amount) || m.amount < 0) errs.push(`${label}: el importe debe ser un entero ≥ 0 (céntimos de sol)`);
  return errs;
}

export function productRules(p: Product, ctx: CatalogContext = {}): string[] {
  const errs: string[] = [];
  if (!isValidSlug(p.slug)) errs.push(`slug "${p.slug}" debe ser kebab-case (a-z, 0-9 y guiones)`);
  if (p.category === 'repuestos') errs.push('un producto no puede tener la categoría "repuestos"');
  if (!p.variants.length) errs.push('debe haber al menos una variante');

  const defaults = p.variants.filter((v) => v.isDefault);
  if (defaults.length !== 1) errs.push(`debe haber exactamente 1 variante isDefault (hay ${defaults.length})`);

  const ids = new Set<string>();
  for (const v of p.variants) {
    if (ids.has(v.id)) errs.push(`variante duplicada: ${v.id}`);
    ids.add(v.id);
    errs.push(...moneyErrors(v.price, `variante ${v.id}`));
    if (v.price.amount <= 0) errs.push(`variante ${v.id}: el precio debe ser mayor que 0`);
  }
  const estandar = p.variants.find((v) => v.tier === 'estandar');
  const premium = p.variants.find((v) => v.tier === 'premium');
  if (estandar && premium && premium.price.amount < estandar.price.amount) {
    errs.push(`la versión Premium (${premium.price.amount}) no puede ser más barata que la Estándar (${estandar.price.amount}) — ADR-017`);
  }

  const colorIds = new Set<string>();
  for (const c of p.colors) {
    if (colorIds.has(c.id)) errs.push(`color duplicado: ${c.id}`);
    colorIds.add(c.id);
    errs.push(...moneyErrors(c.priceDelta, `color ${c.id}`));
  }

  const b = p.specs.battery;
  const kwh = (b.voltage * b.capacityAh) / 1000;
  if (Math.abs(kwh - b.capacityKwh) > 0.05) errs.push(`specs.battery.capacityKwh ${b.capacityKwh} ≠ V·Ah/1000 (${kwh.toFixed(2)})`);
  if (p.specs.license === 'sin-licencia' && p.specs.topSpeedKmh > 32) errs.push(`"sin-licencia" con ${p.specs.topSpeedKmh} km/h: revisar con el asesor legal (MTC)`);

  if (p.related.includes(p.slug)) errs.push('related no puede incluir el propio producto');
  if (ctx.productSlugs) for (const r of p.related) if (!ctx.productSlugs.includes(r)) errs.push(`related desconocido: ${r}`);
  if (ctx.partSlugs) for (const a of p.accessories) if (!ctx.partSlugs.includes(a)) errs.push(`accesorio desconocido: ${a}`);
  return errs;
}

export function partRules(a: Part, ctx: CatalogContext = {}): string[] {
  const errs: string[] = [];
  if (!isValidSlug(a.slug)) errs.push(`slug "${a.slug}" debe ser kebab-case (a-z, 0-9 y guiones)`);
  errs.push(...moneyErrors(a.price, 'price'));
  if (a.price.amount <= 0) errs.push('price: el precio debe ser mayor que 0');
  if (ctx.productSlugs) for (const c of a.compatibleWith) if (!ctx.productSlugs.includes(c)) errs.push(`compatibleWith desconocido: ${c}`);
  return errs;
}
