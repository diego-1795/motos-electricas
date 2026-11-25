import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Part, Product } from '../../src/domain/types';
import { parsePart, parseProduct } from '../../src/content/schemas';
import { applyPartPatch, applyProductPatch } from '../../src/domain/adminPolicy';
import {
  cleanPartSpecs,
  kwhOf,
  overrideFromForm,
  overrideToForm,
  parseNumber,
  partSpecsErrors,
  specsChanges,
  specsFromForm,
  specsToForm,
} from '../../src/domain/specsEdit';

/** Especificaciones editables desde el panel (ADR-032). */

const dir = (d: string) => join(process.cwd(), 'src/content', d);
const readAll = <T>(d: string): T[] =>
  readdirSync(dir(d))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir(d), f), 'utf8')) as T);
const products = readAll<Product>('products');
const parts = readAll<Part>('repuestos');

describe('parseNumber', () => {
  it('acepta enteros, decimales con punto o coma y miles con coma; rechaza texto', () => {
    expect(parseNumber('60')).toBe(60);
    expect(parseNumber(' 1.5 ')).toBe(1.5);
    expect(parseNumber('1,5')).toBe(1.5);
    expect(parseNumber('1,200')).toBe(1200);
    expect(parseNumber('12,155.5')).toBe(12155.5);
    expect(parseNumber('')).toBeUndefined();
    expect(parseNumber('60 km')).toBeNull();
    expect(parseNumber('-3')).toBeNull();
  });
});

describe('formulario de especificaciones: ida y vuelta con el catálogo real', () => {
  it('abrir y guardar sin tocar nada devuelve exactamente las mismas especificaciones (sin cambios fantasma)', () => {
    expect(products.length).toBeGreaterThan(0);
    for (const p of products) {
      const r = specsFromForm(specsToForm(p.specs), p.specs);
      expect(r.ok, p.slug).toBe(true);
      if (!r.ok) continue;
      expect(r.value, p.slug).toEqual(p.specs);
      expect(specsChanges(p.specs, r.value), p.slug).toEqual([]);
      for (const v of p.variants) {
        const o = overrideFromForm(overrideToForm(v.specsOverride, p.specs.battery), v.name, v.specsOverride);
        expect(o.ok && o.value, `${p.slug}/${v.id}`).toEqual(v.specsOverride ?? null);
      }
    }
  });

  it('el kWh se calcula de voltaje × Ah; un dato erróneo o vacío da errores en llano', () => {
    expect(kwhOf(48, 12)).toBe(0.58);
    const f = specsToForm(products[0]!.specs);
    const changed = specsFromForm({ ...f, battery: { ...f.battery, voltage: '60', capacityAh: '20' } });
    expect(changed.ok && changed.value.battery.capacityKwh).toBe(1.2);
    const bad = specsFromForm({ ...f, rangeKm: '', topSpeedKmh: 'rápida', rangeMinKm: '999', lengthMm: '1800', widthMm: '', heightMm: '' });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors).toEqual(
      expect.arrayContaining([
        'Autonomía máxima (km): es obligatorio',
        'Velocidad máxima (km/h): escribe solo un número (p. ej. 60 o 1.5)',
        'Medidas: escribe largo, ancho y alto, o deja las tres vacías',
      ]),
    );
  });

  it('versión: solo lo que cambia; todo vacío = null (usa la ficha)', () => {
    const base = products[0]!.specs.battery;
    const empty = overrideToForm(undefined, base);
    expect(overrideFromForm(empty, 'Premium')).toEqual({ ok: true, value: null });
    const r = overrideFromForm({ ...empty, rangeKm: '70', features: 'Alarma\n- Freno de disco\n\n' }, 'Premium');
    expect(r).toEqual({ ok: true, value: { rangeKm: 70, features: ['Alarma', 'Freno de disco'] } });
    const e = overrideFromForm({ ...empty, topSpeedKmh: 'mucho' }, 'Premium');
    expect(!e.ok && e.errors[0]).toMatch(/^Premium · Velocidad máxima/);
  });

  it('specsChanges nombra lo que cambia, también dentro de la batería', () => {
    const s = products[0]!.specs;
    expect(specsChanges(s, { ...s, rangeKm: s.rangeKm + 5, features: [...s.features, 'Nueva'] })).toEqual(['autonomía máxima', 'características']);
    expect(specsChanges(s, { ...s, battery: { ...s.battery, capacityAh: 99 } })).toEqual(['batería: capacidad']);
    expect(specsChanges(undefined, { rangeKm: 1 })).toEqual(['autonomía máxima']);
  });
});

describe('PATCH de especificaciones (gestor y admin)', () => {
  const p = products.find((x) => x.variants.length > 1) ?? products[0]!;

  it('specs + variantSpecs: aplica, describe el cambio y la ficha resultante pasa el esquema y las reglas', () => {
    const v = p.variants[0]!;
    const r = applyProductPatch(p, { sha: 'x', specs: { ...p.specs, rangeKm: p.specs.rangeKm + 1 }, variantSpecs: { [v.id]: { ...v.specsOverride, topSpeedKmh: 30 } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changes).toEqual(['especificaciones: autonomía máxima', `especificaciones de ${v.name}: velocidad máxima`]);
    expect(r.value.variants[0]!.specsOverride).toEqual({ ...v.specsOverride, topSpeedKmh: 30 });
    expect(parseProduct(r.value, {}).ok).toBe(true);
    // null quita todo lo que la versión cambiaba
    const back = applyProductPatch(r.value, { sha: 'x', variantSpecs: { [v.id]: null } });
    expect(back.ok && 'specsOverride' in back.value.variants[0]!).toBe(false);
  });

  it('sin cambios reales no hay cambios; variante desconocida o forma errónea → errores', () => {
    expect(applyProductPatch(p, { sha: 'x', specs: p.specs })).toMatchObject({ ok: true, changes: [] });
    expect(applyProductPatch(p, { sha: 'x', variantSpecs: { nope: null } })).toEqual({ ok: false, errors: ['variante desconocida: nope'] });
    expect(applyProductPatch(p, { sha: 'x', specs: 'x' as never }).ok).toBe(false);
    expect(applyProductPatch(p, { sha: 'x', name: 'Otro' } as never).ok).toBe(false);
  });

  it('el esquema completo atrapa unas especificaciones inválidas que lleguen por PATCH', () => {
    const r = applyProductPatch(p, { sha: 'x', specs: { ...p.specs, seats: 7 as never } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(parseProduct(r.value, {}).ok).toBe(false);
  });

  it('repuestos: lista nombre/valor; [] la quita; reglas de vacíos, repetidos y longitudes', () => {
    const a = parts[0]!;
    const r = applyPartPatch(a, { sha: 'x', specs: [{ label: 'Voltaje', value: '48 V' }] });
    expect(r.ok && r.value.specs).toEqual([{ label: 'Voltaje', value: '48 V' }]);
    expect(r.ok && r.changes).toEqual(['especificaciones']);
    if (r.ok) expect(parsePart(r.value, {}).ok).toBe(true);
    const off = r.ok ? applyPartPatch(r.value, { sha: 'x', specs: [] }) : null;
    expect(off?.ok && 'specs' in off.value).toBe(false);
    expect(applyPartPatch(a, { sha: 'x', specs: [{ label: 'a', value: 'b', extra: 1 }] as never }).ok).toBe(false);
    expect(partSpecsErrors([{ label: 'Peso', value: '' }, { label: 'peso', value: '3 kg' }, { label: 'x'.repeat(61), value: 'y' }])).toEqual([
      'Especificación 1: falta el valor',
      'Especificación repetida: peso',
      'Especificación 3: el nombre tiene más de 60 caracteres',
    ]);
    expect(cleanPartSpecs([{ label: ' Peso ', value: ' 3 kg ' }, { label: '', value: '' }])).toEqual([{ label: 'Peso', value: '3 kg' }]);
  });

  it('todo el catálogo real sigue pasando el esquema estricto (un PATCH de especificaciones no se bloquea por datos viejos)', () => {
    for (const x of products) expect(parseProduct(x, {}).ok, x.slug).toBe(true);
    for (const x of parts) expect(parsePart(x, {}).ok, x.slug).toBe(true);
  });
});
