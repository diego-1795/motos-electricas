import { describe, it, expect } from 'vitest';
import { ALL_PRODUCTS_PATH, COMPARE_PATH, FINDER_PATH, PARTS_PATH, categoryPath, partPath, productPath } from '../../src/lib/routes';
import { partKindLabel, partKindSingular } from '../../src/lib/labels';
import type { PartKind } from '../../src/domain/types';
import { makePart, makeProduct } from './fixtures';

/** ADR-015: rutas /bicimotos/[slug], /trimotos/[slug], /repuestos/[slug]; sin /motos-electricas ni /accesorios */
describe('lib/routes', () => {
  it('productPath compone /<categoría>/<slug>', () => {
    expect(productPath(makeProduct({ slug: 'golden-eagle', category: 'bicimotos' }))).toBe('/bicimotos/golden-eagle');
    expect(productPath(makeProduct({ slug: 'titan-rhino', category: 'trimotos' }))).toBe('/trimotos/titan-rhino');
    expect(productPath({ category: 'bicimotos', slug: 'x' })).toBe('/bicimotos/x');
  });
  it('categoryPath', () => {
    expect(categoryPath('bicimotos')).toBe('/bicimotos');
    expect(categoryPath('trimotos')).toBe('/trimotos');
    expect(categoryPath('repuestos')).toBe('/repuestos');
  });
  it('partPath acepta Part o slug', () => {
    expect(partPath(makePart({ slug: 'motor-350w' }))).toBe('/repuestos/motor-350w');
    expect(partPath('motor-350w')).toBe('/repuestos/motor-350w');
    expect(partPath('motor-350w').startsWith(PARTS_PATH + '/')).toBe(true);
  });
  it('constantes de rutas fijas', () => {
    expect(ALL_PRODUCTS_PATH).toBe('/productos');
    expect(PARTS_PATH).toBe('/repuestos');
    expect(FINDER_PATH).toBe('/encuentra-tu-moto');
    expect(COMPARE_PATH).toBe('/comparar');
  });
  it('ninguna ruta usa las rutas antiguas', () => {
    const all = [ALL_PRODUCTS_PATH, PARTS_PATH, FINDER_PATH, COMPARE_PATH, productPath(makeProduct()), partPath('x')];
    for (const r of all) {
      expect(r).not.toMatch(/motos-electricas|accesorios/);
      expect(r.startsWith('/')).toBe(true);
      expect(r.endsWith('/')).toBe(false);
    }
  });
});

describe('lib/labels', () => {
  const KINDS: PartKind[] = ['bateria', 'motor', 'controlador', 'cargador', 'iluminacion', 'frenos', 'cables', 'mandos', 'seguridad', 'llantas', 'otro'];
  it('partKindLabel y partKindSingular cubren todos los PartKind con texto no vacío', () => {
    for (const k of KINDS) {
      expect(partKindLabel[k]).toBeTruthy();
      expect(partKindSingular[k]).toBeTruthy();
    }
    expect(Object.keys(partKindLabel).sort()).toEqual([...KINDS].sort());
    expect(Object.keys(partKindSingular).sort()).toEqual([...KINDS].sort());
  });
  it('etiquetas clave', () => {
    expect(partKindLabel.bateria).toBe('Baterías');
    expect(partKindLabel.motor).toBe('Motores');
    expect(partKindSingular.motor).toBe('Motor');
    expect(partKindSingular.otro).toBe('Repuesto');
  });
});
