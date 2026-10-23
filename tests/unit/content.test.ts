import { describe, it, expect } from 'vitest';
import { repos } from '../../src/data';
import { TYPES } from '../../src/domain/catalog';
import { defaultVariant, fromPrice } from '../../src/domain/product';
import { productPath } from '../../src/lib/routes';

/**
 * Integridad del catálogo real (ADR-015) a través de los repositorios JSON (astro:content).
 * Protege la coherencia entre productos y repuestos que las páginas asumen en build.
 */
describe('catálogo real: productos', () => {
  it('4 vehículos: 3 bicimotos y 1 trimoto, sin categoría repuestos', async () => {
    const products = await repos.products.all();
    expect(products.map((p) => p.slug).sort()).toEqual(['golden-eagle', 'royal-tiger', 'titan-rhino', 'vortex-kobra']);
    expect((await repos.products.byCategory('bicimotos')).map((p) => p.slug).sort()).toEqual(['golden-eagle', 'royal-tiger', 'vortex-kobra']);
    expect((await repos.products.byCategory('trimotos')).map((p) => p.slug)).toEqual(['titan-rhino']);
    expect(products.every((p) => TYPES.includes(p.category))).toBe(true);
  });

  it('rutas generadas: /bicimotos/<slug> y /trimotos/<slug>', async () => {
    const products = await repos.products.all();
    expect(products.map(productPath).sort()).toEqual(['/bicimotos/golden-eagle', '/bicimotos/royal-tiger', '/bicimotos/vortex-kobra', '/trimotos/titan-rhino']);
  });

  it('precios y versión por defecto del brief del cliente (2026-10-22)', async () => {
    const p = async (slug: string) => (await repos.products.bySlug(slug))!;
    const ge = await p('golden-eagle');
    expect(defaultVariant(ge).tier).toBe('estandar');
    expect(ge.variants.map((v) => [v.tier, v.price.amount])).toEqual([
      ['estandar', 120000],
      ['premium', 150000],
    ]);
    const rt = await p('royal-tiger');
    expect(defaultVariant(rt).tier).toBe('premium');
    expect(fromPrice(rt).amount).toBe(140000);
    expect(rt.variants.find((v) => v.tier === 'estandar')!.price.amount).toBe(180000);
    const vk = await p('vortex-kobra');
    expect(defaultVariant(vk).tier).toBe('premium');
    expect(fromPrice(vk).amount).toBe(120000);
    expect(vk.variants.find((v) => v.tier === 'estandar')!.price.amount).toBe(150000);
    const tr = await p('titan-rhino');
    expect(tr.variants).toHaveLength(1);
    expect(tr.variants[0]!.price.amount).toBe(270000);
  });

  it('cada producto tiene features, heroImage, un único isDefault como máximo y 25 km/h', async () => {
    for (const p of await repos.products.all()) {
      expect(p.specs.features.length, p.slug).toBeGreaterThan(0);
      expect(p.heroImage, p.slug).toBeTruthy();
      expect(p.variants.filter((v) => v.isDefault).length, p.slug).toBeLessThanOrEqual(1);
      expect(p.specs.topSpeedKmh, p.slug).toBe(25);
      expect(p.specs.license, p.slug).toBe('sin-licencia');
      expect(p.colors.length, p.slug).toBeGreaterThan(0);
    }
  });
});

describe('catálogo real: repuestos y compatibilidad', () => {
  it('26 repuestos con kind, unit y precio válidos', async () => {
    const parts = await repos.parts.all();
    expect(parts).toHaveLength(26);
    for (const a of parts) {
      expect(['UND', 'PAR'], a.slug).toContain(a.unit);
      expect(a.price.currency, a.slug).toBe('PEN');
      expect(a.price.amount, a.slug).toBeGreaterThan(0);
    }
    expect(new Set(parts.map((a) => a.slug)).size).toBe(26);
  });

  it('compatibleWith referencia slugs de productos existentes', async () => {
    const slugs = new Set((await repos.products.all()).map((p) => p.slug));
    for (const a of await repos.parts.all()) {
      for (const s of a.compatibleWith) expect(slugs.has(s), `${a.slug} → ${s}`).toBe(true);
    }
  });

  it('product.accessories referencia repuestos existentes', async () => {
    const partSlugs = new Set((await repos.parts.all()).map((a) => a.slug));
    for (const p of await repos.products.all()) {
      for (const s of p.accessories) expect(partSlugs.has(s), `${p.slug} → ${s}`).toBe(true);
    }
  });

  it('compatibleWith(): incluye los específicos del modelo y los universales (lista vacía), excluye los de otros modelos', async () => {
    const all = await repos.parts.all();
    const ge = await repos.parts.compatibleWith('golden-eagle');
    const geSlugs = ge.map((a) => a.slug);
    expect(geSlugs).toContain('motor-350w');
    for (const a of all.filter((x) => x.compatibleWith.length === 0)) expect(geSlugs).toContain(a.slug);
    for (const a of all.filter((x) => x.compatibleWith.length && !x.compatibleWith.includes('golden-eagle'))) expect(geSlugs).not.toContain(a.slug);
    // Un slug desconocido solo recibe los universales
    const none = await repos.parts.compatibleWith('no-existe');
    expect(none.every((a) => a.compatibleWith.length === 0)).toBe(true);
  });

  it('Motor 350 W es compatible con las tres bicimotos y no con la trimoto', async () => {
    const motor = await repos.parts.bySlug('motor-350w');
    expect(motor?.name).toBe('Motor 350 W');
    expect(motor?.kind).toBe('motor');
    expect([...motor!.compatibleWith].sort()).toEqual(['golden-eagle', 'royal-tiger', 'vortex-kobra']);
    expect((await repos.parts.compatibleWith('titan-rhino')).map((a) => a.slug)).not.toContain('motor-350w');
  });

  it('categorías: bicimotos, trimotos y repuestos', async () => {
    expect((await repos.categories.all()).map((c) => c.slug).sort()).toEqual(['bicimotos', 'repuestos', 'trimotos']);
  });
});
