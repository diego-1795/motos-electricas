import type { Cart, CartItem, Product, ProductVariant, Specs } from '../../src/domain/types';
import { pen } from '../../src/domain/money';

/** Fixtures sintéticas: sin datos reales. */

export const baseSpecs = (over: Partial<Specs> = {}): Specs => ({
  rangeKm: 100,
  topSpeedKmh: 80,
  powerW: 5000,
  battery: { voltage: 72, capacityAh: 40, capacityKwh: 2.88, chemistry: 'NMC', removable: true, chargeHours: [5, 7] },
  weightKg: 120,
  maxLoadKg: 180,
  seats: 2,
  license: 'B-IIb',
  dimensionsMm: [2000, 760, 1100],
  brakes: 'Disco',
  suspension: 'Telescópica',
  lighting: 'LED',
  display: 'LCD',
  drivingModes: ['Eco'],
  motorType: 'Central',
  warrantyMonths: 24,
  batteryWarrantyMonths: 24,
  ...over,
});

export const variant = (over: Partial<ProductVariant> = {}): ProductVariant => ({
  id: 'v1',
  name: 'Batería 72V 40Ah',
  price: pen(499900),
  availability: 'en-stock',
  ...over,
});

export function makeProduct(over: Partial<Product> = {}): Product {
  return {
    id: 'id-' + (over.slug ?? 'test'),
    slug: 'test-moto',
    name: 'Test Moto',
    subtitle: 'Moto de prueba',
    claim: 'Claim',
    description: 'Descripción de prueba',
    category: 'motos-electricas',
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

export const odinItem = (over: Partial<CartItem> = {}): Omit<CartItem, 'key'> => ({
  kind: 'product',
  slug: 'odin-1-0',
  name: 'ODIN 1.0',
  variantId: 'bat-72v-50ah',
  variantName: 'Batería 72V 50Ah',
  colorId: 'negro-mate',
  colorName: 'Negro mate',
  unitPrice: pen(549900),
  quantity: 1,
  ...over,
});

export const accessoryItem = (slug: string, name: string, amount: number, quantity = 1): Omit<CartItem, 'key'> => ({
  kind: 'accessory',
  slug,
  name,
  unitPrice: pen(amount),
  quantity,
});

export const cartWith = (items: CartItem[], notes = ''): Cart => ({ items, notes, updatedAt: '2025-01-01T00:00:00.000Z' });

/** Normaliza espacios "raros" de Intl (U+00A0, U+202F) a espacio normal */
export const norm = (s: string): string => s.replace(/[  ]/g, ' ');
