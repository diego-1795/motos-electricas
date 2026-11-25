import { describe, expect, it } from 'vitest';
import { applyPartPatch, applyProductPatch } from '../../src/domain/adminPolicy';
import { effectiveAvailability, isLowStock, partWithStock, productLowStock, productWithStock, stockErrors } from '../../src/domain/stock';
import { productAvailability } from '../../src/domain/product';
import { site } from '../../src/config/site';
import { makePart, makeProduct, premiumVariant, variant } from './fixtures';

/** Stock y "¡Últimas unidades!" (ADR-035) */
describe('disponibilidad a partir del stock', () => {
  it('sin número manda la disponibilidad puesta a mano; 0 = agotado salvo bajo pedido o próximamente', () => {
    expect(effectiveAvailability('bajo-pedido', undefined)).toBe('bajo-pedido');
    expect(effectiveAvailability('agotado', 3)).toBe('en-stock');
    expect(effectiveAvailability('en-stock', 0)).toBe('agotado');
    expect(effectiveAvailability('bajo-pedido', 0)).toBe('bajo-pedido');
    expect(effectiveAvailability('proximamente', 0)).toBe('proximamente');
  });

  it('umbral de la configuración: motos 2, repuestos 5', () => {
    expect(site.stock).toEqual({ lowProducts: 2, lowParts: 5 });
    expect([0, 1, 2, 3].map((n) => isLowStock(n, site.stock.lowProducts))).toEqual([false, true, true, false]);
    expect(isLowStock(undefined, 5)).toBe(false);
    expect(isLowStock(5, site.stock.lowParts)).toBe(true);
  });

  it('productos y repuestos cargados ya llevan la disponibilidad real; aviso de producto solo si todas sus versiones disponibles llevan número', () => {
    const p = makeProduct({ variants: [variant({ isDefault: true, stock: 0, availability: 'en-stock' }), premiumVariant({ stock: 1 })] });
    const loaded = productWithStock(p);
    expect(loaded.variants.map((v) => v.availability)).toEqual(['agotado', 'en-stock']);
    expect(productAvailability(loaded)).toBe('en-stock');
    expect(productLowStock(p, 2)).toBe(true);
    expect(productLowStock(makeProduct({ variants: [variant({ isDefault: true, stock: 1 }), premiumVariant()] }), 2)).toBe(false);
    expect(productLowStock(makeProduct({ variants: [variant({ isDefault: true, stock: 2 }), premiumVariant({ stock: 2 })] }), 2)).toBe(false);
    expect(partWithStock(makePart({ stock: 0 })).availability).toBe('agotado');
  });

  it('stockErrors: entero de 0 a 9999 o null', () => {
    expect(stockErrors(null, 'x')).toEqual([]);
    expect(stockErrors(3, 'x')).toEqual([]);
    expect(stockErrors(-1, 'x')).toHaveLength(1);
    expect(stockErrors(1.5, 'x')).toHaveLength(1);
    expect(stockErrors('3', 'x')).toHaveLength(1);
    expect(stockErrors(10000, 'x')).toHaveLength(1);
  });
});

describe('PATCH de stock (gestor y admin)', () => {
  const p = makeProduct({ variants: [variant({ isDefault: true }), premiumVariant({ stock: 4 })] });
  it('por versión: fija, cambia y quita (null = sin control), con cambio legible', () => {
    const r = applyProductPatch(p, { sha: 'x', stock: { estandar: 3, premium: null } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.variants.map((v) => v.stock)).toEqual([3, undefined]);
    expect('stock' in r.value.variants[1]!).toBe(false);
    expect(r.changes).toEqual(['stock Estándar: sin control → 3', 'stock Premium: 4 → sin control']);
    expect(applyProductPatch(p, { sha: 'x', stock: { premium: 4 } })).toMatchObject({ ok: true, changes: [] });
    expect(applyProductPatch(p, { sha: 'x', stock: { nope: 1 } }).ok).toBe(false);
    expect(applyProductPatch(p, { sha: 'x', stock: { estandar: -2 } }).ok).toBe(false);
  });
  it('repuesto: número o null', () => {
    const a = makePart();
    const r = applyPartPatch(a, { sha: 'x', stock: 7 });
    expect(r.ok && r.value.stock).toBe(7);
    expect(r.ok && r.changes).toEqual(['stock: sin control → 7']);
    const off = r.ok ? applyPartPatch(r.value, { sha: 'x', stock: null }) : null;
    expect(off?.ok && 'stock' in off.value).toBe(false);
    expect(applyPartPatch(a, { sha: 'x', stock: 2.5 }).ok).toBe(false);
  });
});
