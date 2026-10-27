import { describe, it, expect } from 'vitest';
import { isValidSlug, partRules, productRules } from '../../src/domain/catalogRules';
import { parsePart, parseProduct } from '../../src/content/schemas';
import { makePart, makeProduct, premiumVariant, variant } from './fixtures';

/** Reglas de integridad del catálogo que ejecuta el servidor del panel (ADR-018). */
describe('catalogRules', () => {
  const ok = makeProduct({ slug: 'golden-eagle', variants: [variant({ isDefault: true }), premiumVariant()] });

  it('un producto válido no produce errores', () => {
    expect(productRules(ok)).toEqual([]);
    expect(productRules(ok, { productSlugs: ['golden-eagle'], partSlugs: [] })).toEqual([]);
  });

  it('slug kebab-case', () => {
    expect(isValidSlug('golden-eagle-2')).toBe(true);
    for (const bad of ['Golden', 'golden eagle', '-golden', 'golden-', 'golden--eagle', 'ñandu', ''] ) expect(isValidSlug(bad), bad).toBe(false);
    expect(productRules(makeProduct({ slug: 'Mal Slug', variants: [variant({ isDefault: true })] }))[0]).toMatch(/kebab-case/);
  });

  it('exactamente una variante por defecto, ids únicos, precios > 0 en PEN', () => {
    const none = productRules(makeProduct({ variants: [variant()] }));
    expect(none.some((e) => e.includes('isDefault (hay 0)'))).toBe(true);
    const two = productRules(makeProduct({ variants: [variant({ isDefault: true }), premiumVariant({ isDefault: true })] }));
    expect(two.some((e) => e.includes('isDefault (hay 2)'))).toBe(true);
    const dup = productRules(makeProduct({ variants: [variant({ isDefault: true }), variant({ id: 'estandar' })] }));
    expect(dup).toContain('variante duplicada: estandar');
    const zero = productRules(makeProduct({ variants: [variant({ isDefault: true, price: { amount: 0, currency: 'PEN' } })] }));
    expect(zero.some((e) => e.includes('mayor que 0'))).toBe(true);
    const eur = productRules(makeProduct({ variants: [variant({ isDefault: true, price: { amount: 1000, currency: 'EUR' as 'PEN' } })] }));
    expect(eur.some((e) => e.includes('PEN'))).toBe(true);
  });

  it('Premium ≥ Estándar, batería coherente, licencia vs velocidad, categoría y referencias', () => {
    const cheapPremium = makeProduct({ variants: [variant({ isDefault: true, price: { amount: 150000, currency: 'PEN' } }), premiumVariant({ price: { amount: 120000, currency: 'PEN' } })] });
    expect(productRules(cheapPremium).some((e) => e.includes('Premium'))).toBe(true);
    const badBattery = makeProduct({ variants: [variant({ isDefault: true })] });
    badBattery.specs = { ...badBattery.specs, battery: { ...badBattery.specs.battery, capacityKwh: 2 } };
    expect(productRules(badBattery).some((e) => e.includes('capacityKwh'))).toBe(true);
    const fast = makeProduct({ variants: [variant({ isDefault: true })] });
    fast.specs = { ...fast.specs, topSpeedKmh: 45 };
    expect(productRules(fast).some((e) => e.includes('sin-licencia'))).toBe(true);
    expect(productRules(makeProduct({ category: 'repuestos', variants: [variant({ isDefault: true })] }))).toContain('un producto no puede tener la categoría "repuestos"');
    const refs = productRules(makeProduct({ slug: 'a', related: ['a', 'zz'], accessories: ['no-existe'], variants: [variant({ isDefault: true })] }), { productSlugs: ['a', 'b'], partSlugs: ['motor-350w'] });
    expect(refs).toContain('related no puede incluir el propio producto');
    expect(refs).toContain('related desconocido: zz');
    expect(refs).toContain('accesorio desconocido: no-existe');
  });

  it('partRules: slug, precio y compatibilidad', () => {
    expect(partRules(makePart())).toEqual([]);
    expect(partRules(makePart({ slug: 'Motor 1' }))[0]).toMatch(/kebab-case/);
    expect(partRules(makePart({ price: { amount: 0, currency: 'PEN' } }))).toContain('price: el precio debe ser mayor que 0');
    expect(partRules(makePart({ compatibleWith: ['nope'] }), { productSlugs: ['golden-eagle'] })).toContain('compatibleWith desconocido: nope');
  });
});

describe('parseProduct / parsePart (esquema zod + reglas)', () => {
  it('acepta una ficha válida y aplica los valores por defecto del esquema', () => {
    const input = JSON.parse(JSON.stringify(makeProduct({ slug: 'golden-eagle', variants: [variant({ isDefault: true }), premiumVariant()] })));
    const r = parseProduct(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.slug).toBe('golden-eagle');
    const part = parsePart(JSON.parse(JSON.stringify(makePart())));
    expect(part.ok && part.value.unit).toBe('UND');
  });

  it('rechaza claves desconocidas (strict), tipos incorrectos y reglas de negocio, con rutas legibles', () => {
    const bad = JSON.parse(JSON.stringify(makeProduct({ variants: [variant({ isDefault: true })] })));
    bad.extra = 1;
    bad.variants[0].price.amount = 12.5;
    const r = parseProduct(bad);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes('extra'))).toBe(true);
    expect(r.errors.some((e) => e.startsWith('variants.0.price.amount'))).toBe(true);
    const rules = parseProduct(JSON.parse(JSON.stringify(makeProduct({ variants: [variant()] }))));
    expect(!rules.ok && rules.errors.some((e) => e.includes('isDefault'))).toBe(true);
    expect(parsePart({ slug: 'x' }).ok).toBe(false);
  });

  it('URLs de imágenes y recursos: solo ~/assets/, / o https:// (nunca javascript:, data: ni http:)', () => {
    const base = () => JSON.parse(JSON.stringify(makeProduct({ variants: [variant({ isDefault: true })] })));
    for (const ok of ['~/assets/products/x.jpg', '/img/x.jpg', 'https://cdn.example.com/x.jpg']) {
      const p = base();
      p.images[0].src = ok;
      p.videoUrl = 'https://www.youtube.com/watch?v=1';
      expect(parseProduct(p).ok, ok).toBe(true);
    }
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'http://insecure.example/x.jpg', '//evil.example/x.jpg', 'x.jpg']) {
      const p = base();
      p.images[0].src = bad;
      expect(parseProduct(p).ok, bad).toBe(false);
      const q = base();
      q.manualUrl = bad;
      expect(parseProduct(q).ok, `manualUrl ${bad}`).toBe(false);
    }
    const part = JSON.parse(JSON.stringify(makePart()));
    part.image = { src: 'javascript:1', alt: 'x', width: 1, height: 1 };
    expect(parsePart(part).ok).toBe(false);
  });

  it('hidden es opcional y booleano', () => {
    const p = JSON.parse(JSON.stringify(makeProduct({ hidden: true, variants: [variant({ isDefault: true })] })));
    expect(parseProduct(p).ok).toBe(true);
    p.hidden = 'sí';
    expect(parseProduct(p).ok).toBe(false);
  });
});
