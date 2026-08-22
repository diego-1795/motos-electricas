import { describe, it, expect } from 'vitest';
import {
  availabilityLabel,
  batteryLabel,
  chargeLabel,
  defaultVariant,
  effectiveSpecs,
  fromPrice,
  kw,
  licenseLabel,
  maxRange,
  productAvailability,
  variantPrice,
} from '../../src/domain/product';
import { eur } from '../../src/domain/money';
import { baseSpecs, makeProduct, norm, variant } from './fixtures';

const v40 = variant({ id: 'v40', name: '40Ah', price: eur(499900), isDefault: false });
const v50 = variant({
  id: 'v50',
  name: '50Ah',
  price: eur(549900),
  isDefault: true,
  specsOverride: { rangeKm: 150, weightKg: 130 },
});
const v32 = variant({ id: 'v32', name: '32Ah', price: eur(459900), specsOverride: { rangeKm: 80 } });
const p = makeProduct({ variants: [v40, v50, v32] });

describe('defaultVariant', () => {
  it('devuelve la marcada como isDefault', () => {
    expect(defaultVariant(p).id).toBe('v50');
  });
  it('sin isDefault devuelve la primera', () => {
    expect(defaultVariant(makeProduct({ variants: [v40, v32] })).id).toBe('v40');
  });
});

describe('fromPrice', () => {
  it('elige la variante más barata, no la default ni la primera', () => {
    expect(fromPrice(p)).toEqual(eur(459900));
  });
  it('con una sola variante devuelve su precio', () => {
    expect(fromPrice(makeProduct({ variants: [v50] }))).toEqual(eur(549900));
  });
});

describe('variantPrice', () => {
  it('sin color devuelve el precio de la variante', () => {
    expect(variantPrice(v40)).toEqual(eur(499900));
  });
  it('color sin priceDelta no altera el precio', () => {
    expect(variantPrice(v40, { id: 'c', name: 'C', hex: '#fff' })).toEqual(eur(499900));
  });
  it('color con priceDelta lo suma', () => {
    expect(variantPrice(v40, { id: 'c', name: 'C', hex: '#fff', priceDelta: eur(10000) })).toEqual(eur(509900));
  });
  it('priceDelta 0 se ignora sin romper', () => {
    expect(variantPrice(v40, { id: 'c', name: 'C', hex: '#fff', priceDelta: eur(0) })).toEqual(eur(499900));
  });
});

describe('effectiveSpecs', () => {
  it('usa la variante por defecto cuando no se indica', () => {
    const s = effectiveSpecs(p);
    expect(s.rangeKm).toBe(150);
    expect(s.weightKg).toBe(130);
    expect(s.topSpeedKmh).toBe(80); // heredado del base
  });
  it('aplica override de la variante indicada', () => {
    expect(effectiveSpecs(p, v32).rangeKm).toBe(80);
    expect(effectiveSpecs(p, v40).rangeKm).toBe(100);
  });
  it('no muta las specs base', () => {
    effectiveSpecs(p, v50);
    expect(p.specs.rangeKm).toBe(100);
  });
});

describe('maxRange', () => {
  it('devuelve la autonomía máxima entre todas las variantes', () => {
    expect(maxRange(p)).toBe(150);
    expect(maxRange(makeProduct({ variants: [v32] }))).toBe(80);
  });
});

describe('productAvailability', () => {
  const mk = (...avs: Array<'en-stock' | 'bajo-pedido' | 'proximamente' | 'agotado'>) =>
    makeProduct({ variants: avs.map((availability, i) => variant({ id: `v${i}`, availability })) });

  it('prefiere el mejor estado disponible en orden en-stock > bajo-pedido > proximamente > agotado', () => {
    expect(productAvailability(mk('agotado', 'en-stock'))).toBe('en-stock');
    expect(productAvailability(mk('agotado', 'proximamente', 'bajo-pedido'))).toBe('bajo-pedido');
    expect(productAvailability(mk('agotado', 'proximamente'))).toBe('proximamente');
    expect(productAvailability(mk('agotado'))).toBe('agotado');
  });
  it('sin variantes → agotado', () => {
    expect(productAvailability(makeProduct({ variants: [] }))).toBe('agotado');
  });
});

describe('labels', () => {
  it('availabilityLabel y licenseLabel cubren todos los valores', () => {
    expect(availabilityLabel['en-stock']).toBe('En stock');
    expect(availabilityLabel.agotado).toBe('Agotado');
    expect(licenseLabel['sin-carnet']).toBe('Sin carnet');
    expect(licenseLabel.A1).toBe('Carnet A1');
  });
  it('kw formatea con coma decimal es-ES y máx 1 decimal', () => {
    expect(norm(kw(5000))).toBe('5 kW');
    expect(norm(kw(2500))).toBe('2,5 kW');
    expect(norm(kw(1250))).toBe('1,3 kW');
  });
  it('batteryLabel y chargeLabel', () => {
    expect(batteryLabel(baseSpecs())).toBe('72V 40Ah');
    expect(chargeLabel(baseSpecs())).toBe('5-7 h');
    expect(chargeLabel(baseSpecs({ battery: { ...baseSpecs().battery, chargeHours: [4, 4] } }))).toBe('4 h');
  });
});
