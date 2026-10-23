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
  powerLabel,
  productAvailability,
  rangeLabel,
  tierLabel,
  variantPrice,
} from '../../src/domain/product';
import { pen } from '../../src/domain/money';
import { baseSpecs, makeProduct, norm, premiumVariant, variant } from './fixtures';

const v40 = variant({ id: 'v40', name: '40Ah', price: pen(499900), isDefault: false });
const v50 = variant({
  id: 'v50',
  name: '50Ah',
  price: pen(549900),
  isDefault: true,
  specsOverride: { rangeKm: 150, weightKg: 130 },
});
const v32 = variant({ id: 'v32', name: '32Ah', price: pen(459900), specsOverride: { rangeKm: 80 } });
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
    expect(fromPrice(p)).toEqual(pen(459900));
  });
  it('con una sola variante devuelve su precio', () => {
    expect(fromPrice(makeProduct({ variants: [v50] }))).toEqual(pen(549900));
  });
});

describe('variantPrice', () => {
  it('sin color devuelve el precio de la variante', () => {
    expect(variantPrice(v40)).toEqual(pen(499900));
  });
  it('color sin priceDelta no altera el precio', () => {
    expect(variantPrice(v40, { id: 'c', name: 'C', hex: '#fff' })).toEqual(pen(499900));
  });
  it('color con priceDelta lo suma', () => {
    expect(variantPrice(v40, { id: 'c', name: 'C', hex: '#fff', priceDelta: pen(10000) })).toEqual(pen(509900));
  });
  it('priceDelta 0 se ignora sin romper', () => {
    expect(variantPrice(v40, { id: 'c', name: 'C', hex: '#fff', priceDelta: pen(0) })).toEqual(pen(499900));
  });
});

describe('effectiveSpecs', () => {
  it('usa la variante por defecto cuando no se indica', () => {
    const s = effectiveSpecs(p);
    expect(s.rangeKm).toBe(150);
    expect(s.weightKg).toBe(130);
    expect(s.topSpeedKmh).toBe(25); // heredado del base
  });
  it('aplica override de la variante indicada', () => {
    expect(effectiveSpecs(p, v32).rangeKm).toBe(80);
    expect(effectiveSpecs(p, v40).rangeKm).toBe(35);
  });
  it('no muta las specs base', () => {
    effectiveSpecs(p, v50);
    expect(p.specs.rangeKm).toBe(35);
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
    expect(licenseLabel['sin-licencia']).toBe('Sin licencia');
    expect(licenseLabel['B-IIb']).toBe('Licencia B-IIb');
  });
  it('kw formatea con punto decimal es-PE y máx 1 decimal', () => {
    expect(norm(kw(5000))).toBe('5 kW');
    expect(norm(kw(2500))).toBe('2.5 kW');
    expect(norm(kw(1250))).toBe('1.3 kW');
  });
  it('batteryLabel y chargeLabel', () => {
    expect(batteryLabel(baseSpecs())).toBe('48V 12Ah');
    expect(chargeLabel(baseSpecs())).toBe('6-8 h');
    expect(chargeLabel(baseSpecs({ battery: { ...baseSpecs().battery, chargeHours: [4, 4] } }))).toBe('4 h');
  });
  it('tierLabel cubre Estándar y Premium', () => {
    expect(tierLabel.estandar).toBe('Estándar');
    expect(tierLabel.premium).toBe('Premium');
    expect(Object.keys(tierLabel)).toEqual(['estandar', 'premium']);
  });
  it('rangeLabel: "min-max km" si hay rango, "max km" si no o si coinciden', () => {
    expect(rangeLabel(baseSpecs({ rangeKm: 35, rangeMinKm: 30 }))).toBe('30-35 km');
    expect(rangeLabel(baseSpecs({ rangeKm: 40, rangeMinKm: undefined }))).toBe('40 km');
    expect(rangeLabel(baseSpecs({ rangeKm: 40, rangeMinKm: 40 }))).toBe('40 km');
    expect(rangeLabel(baseSpecs({ rangeKm: 40, rangeMinKm: 0 }))).toBe('40 km');
  });
  it('rangeLabel respeta el override de la variante vía effectiveSpecs', () => {
    const prod = makeProduct({ variants: [variant(), premiumVariant()] });
    expect(rangeLabel(effectiveSpecs(prod, prod.variants[1]))).toBe('40-50 km');
    expect(rangeLabel(effectiveSpecs(prod, prod.variants[0]))).toBe('30-35 km');
  });
  it('powerLabel: W por debajo de 1 kW, kW a partir de 1000 W', () => {
    expect(powerLabel(350)).toBe('350 W');
    expect(powerLabel(500)).toBe('500 W');
    expect(powerLabel(999)).toBe('999 W');
    expect(norm(powerLabel(1000))).toBe('1 kW');
    expect(norm(powerLabel(1500))).toBe('1.5 kW');
    expect(norm(powerLabel(5000))).toBe('5 kW');
  });
});

describe('catálogo con versiones (tier)', () => {
  const ge = makeProduct({ slug: 'golden-eagle', variants: [variant({ isDefault: true }), premiumVariant()] });
  const rt = makeProduct({ slug: 'royal-tiger', variants: [premiumVariant({ price: pen(140000), isDefault: true }), variant({ price: pen(180000) })] });

  it('la versión por defecto manda sobre el orden', () => {
    expect(defaultVariant(ge).tier).toBe('estandar');
    expect(defaultVariant(rt).tier).toBe('premium');
  });
  it('fromPrice elige la más barata aunque sea la Premium', () => {
    expect(fromPrice(ge)).toEqual(pen(120000));
    expect(fromPrice(rt)).toEqual(pen(140000));
  });
  it('maxRange usa el override de la Premium', () => {
    expect(maxRange(ge)).toBe(50);
    expect(effectiveSpecs(ge).powerW).toBe(350);
    expect(effectiveSpecs(ge, ge.variants[1]).powerW).toBe(500);
  });
  it('specs sin peso ni dimensiones son válidas y features es obligatorio', () => {
    const s = effectiveSpecs(ge);
    expect(s.weightKg).toBeUndefined();
    expect(s.dimensionsMm).toBeUndefined();
    expect(Array.isArray(s.features)).toBe(true);
    expect(s.features.length).toBeGreaterThan(0);
  });
});
