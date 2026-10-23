import type { Cart, CartItem, Part, Product, ProductVariant, Specs } from '../../src/domain/types';
import { pen } from '../../src/domain/money';

/** Fixtures sintéticas: sin datos reales ni teléfonos reales (ADR-015: bicimotos/trimotos/repuestos). */

export const baseSpecs = (over: Partial<Specs> = {}): Specs => ({
  rangeKm: 35,
  rangeMinKm: 30,
  topSpeedKmh: 25,
  powerW: 350,
  battery: { voltage: 48, capacityAh: 12, capacityKwh: 0.58, chemistry: 'plomo-acido', removable: true, chargeHours: [6, 8] },
  maxLoadKg: 150,
  seats: 2,
  license: 'sin-licencia',
  brakes: 'Tambor',
  suspension: 'Hidráulica',
  lighting: 'LED',
  display: 'LCD',
  drivingModes: ['Velocidad 1'],
  motorType: 'Brushless en rueda',
  warrantyMonths: 12,
  batteryWarrantyMonths: 12,
  features: ['Pantalla LCD', 'Alarma antirrobo'],
  ...over,
});

export const variant = (over: Partial<ProductVariant> = {}): ProductVariant => ({
  id: 'estandar',
  name: 'Estándar',
  tier: 'estandar',
  description: '350 W · 48V 12Ah',
  price: pen(120000),
  availability: 'en-stock',
  ...over,
});

export const premiumVariant = (over: Partial<ProductVariant> = {}): ProductVariant =>
  variant({
    id: 'premium',
    name: 'Premium',
    tier: 'premium',
    description: '500 W · 48V 20Ah',
    price: pen(150000),
    specsOverride: { powerW: 500, rangeKm: 50, rangeMinKm: 40 },
    ...over,
  });

export function makeProduct(over: Partial<Product> = {}): Product {
  return {
    id: 'id-' + (over.slug ?? 'test'),
    slug: 'test-bicimoto',
    name: 'Test Bicimoto',
    subtitle: 'Bicimoto de prueba',
    claim: 'Claim',
    description: 'Descripción de prueba',
    category: 'bicimotos',
    brand: 'Raiden',
    images: [{ src: '~/assets/test.svg', alt: 'test', width: 800, height: 500 }],
    specs: baseSpecs(),
    variants: [variant()],
    colors: [{ id: 'negro', name: 'Negro', hex: '#000' }],
    accessories: [],
    related: [],
    useCases: ['ciudad'],
    highlights: [],
    technology: [],
    faqs: [],
    featured: 50,
    publishedAt: '2025-01-01',
    ...over,
  };
}

export function makePart(over: Partial<Part> = {}): Part {
  return {
    id: 'rp-test',
    slug: 'motor-test',
    name: 'Motor de prueba',
    description: 'Repuesto de prueba',
    price: pen(35000),
    availability: 'en-stock',
    kind: 'motor',
    unit: 'UND',
    compatibleWith: [],
    ...over,
  };
}

export const bikeItem = (over: Partial<CartItem> = {}): Omit<CartItem, 'key'> => ({
  kind: 'product',
  slug: 'aguila-test',
  name: 'Águila Test',
  variantId: 'premium',
  variantName: 'Premium',
  colorId: 'negro',
  colorName: 'Negro',
  unitPrice: pen(150000),
  quantity: 1,
  ...over,
});

/** @deprecated alias histórico; usar bikeItem */
export const odinItem = bikeItem;

/** Repuesto en el carrito (kind interno 'accessory' por compatibilidad del estado persistido) */
export const partItem = (slug: string, name: string, amount: number, quantity = 1): Omit<CartItem, 'key'> => ({
  kind: 'accessory',
  slug,
  name,
  unitPrice: pen(amount),
  quantity,
});

/** @deprecated alias histórico; usar partItem */
export const accessoryItem = partItem;

export const cartWith = (items: CartItem[], notes = ''): Cart => ({ items, notes, updatedAt: '2025-01-01T00:00:00.000Z' });

/** Normaliza espacios "raros" de Intl (U+00A0, U+202F) a espacio normal */
export const norm = (s: string): string => s.replace(/[  ]/g, ' ');
