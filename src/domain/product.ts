import type { Availability, Product, ProductColor, ProductVariant, Specs } from './types';
import { add, eur } from './money';
import type { Money } from './types';

export function defaultVariant(p: Product): ProductVariant {
  return p.variants.find((v) => v.isDefault) ?? p.variants[0]!;
}

/** Precio "desde": variante más barata */
export function fromPrice(p: Product): Money {
  return p.variants.reduce((min, v) => (v.price.amount < min.amount ? v.price : min), p.variants[0]!.price);
}

export function variantPrice(variant: ProductVariant, color?: ProductColor): Money {
  return color?.priceDelta ? add(variant.price, color.priceDelta) : variant.price;
}

/** Specs efectivas de una variante (base + override) */
export function effectiveSpecs(p: Product, variant?: ProductVariant): Specs {
  const v = variant ?? defaultVariant(p);
  return { ...p.specs, ...(v.specsOverride ?? {}) };
}

export function maxRange(p: Product): number {
  return Math.max(...p.variants.map((v) => effectiveSpecs(p, v).rangeKm));
}

export function productAvailability(p: Product): Availability {
  const order: Availability[] = ['en-stock', 'bajo-pedido', 'proximamente', 'agotado'];
  return p.variants
    .map((v) => v.availability)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? 'agotado';
}

export const availabilityLabel: Record<Availability, string> = {
  'en-stock': 'En stock',
  'bajo-pedido': 'Bajo pedido',
  proximamente: 'Próximamente',
  agotado: 'Agotado',
};

export const licenseLabel = {
  'sin-carnet': 'Sin carnet',
  AM: 'Carnet AM',
  A1: 'Carnet A1',
  A2: 'Carnet A2',
  B: 'Carnet B',
} as const;

export function kw(powerW: number): string {
  return `${(powerW / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} kW`;
}

export function batteryLabel(s: Specs): string {
  return `${s.battery.voltage}V ${s.battery.capacityAh}Ah`;
}

export function chargeLabel(s: Specs): string {
  const [a, b] = s.battery.chargeHours;
  return a === b ? `${a} h` : `${a}-${b} h`;
}

export const zeroMoney = eur(0);
