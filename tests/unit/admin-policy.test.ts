import { describe, it, expect } from 'vitest';
import { applyPartPatch, applyProductPatch, canPerform, commitMessage, parseEmailList, resolveRole } from '../../src/domain/adminPolicy';
import { isVisible, visibleOnly } from '../../src/domain/catalog';
import { makePart, makeProduct, premiumVariant, variant } from './fixtures';

/** Política del panel de administración (ADR-018): puro, lo aplica el servidor. */
describe('roles', () => {
  it('parseEmailList normaliza comas, espacios, punto y coma y mayúsculas', () => {
    expect(parseEmailList(' Diego@Example.com, wiliam@example.com;otro@x.pe \n')).toEqual(['diego@example.com', 'wiliam@example.com', 'otro@x.pe']);
    expect(parseEmailList(undefined)).toEqual([]);
    expect(parseEmailList('sin-arroba')).toEqual([]);
  });

  it('resolveRole: admin prevalece, editor en su lista, desconocido sin acceso', () => {
    const lists = { admins: ['diego@example.com'], editors: ['wiliam@example.com', 'diego@example.com'] };
    expect(resolveRole('Diego@example.com', lists)).toBe('admin');
    expect(resolveRole('wiliam@example.com', lists)).toBe('editor');
    expect(resolveRole('intruso@example.com', lists)).toBeNull();
    expect(resolveRole(undefined, lists)).toBeNull();
  });

  it('canPerform: el editor solo lee y parchea; el admin todo', () => {
    expect(canPerform('editor', 'read')).toBe(true);
    expect(canPerform('editor', 'patch')).toBe(true);
    expect(canPerform('editor', 'put')).toBe(false);
    expect(canPerform('editor', 'delete')).toBe(false);
    for (const op of ['read', 'patch', 'put', 'delete'] as const) expect(canPerform('admin', op)).toBe(true);
  });
});

describe('applyProductPatch', () => {
  const p = makeProduct({ slug: 'golden', variants: [variant({ isDefault: true }), premiumVariant()] });

  it('cambia solo los precios indicados y registra el cambio', () => {
    const r = applyProductPatch(p, { sha: 'abc', prices: { estandar: 125000 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.variants.map((v) => v.price.amount)).toEqual([125000, 150000]);
    expect(r.value.variants[1]).toBe(p.variants[1]); // la no tocada es la misma referencia
    expect(r.changes).toEqual(['Estándar: 120000 → 125000']);
    expect(p.variants[0]!.price.amount).toBe(120000); // no muta el original
  });

  it('oculta y muestra; sin cambios reales no hay "changes"', () => {
    const hide = applyProductPatch(p, { sha: 'abc', hidden: true });
    expect(hide.ok && hide.value.hidden).toBe(true);
    expect(hide.ok && hide.changes).toEqual(['ocultar']);
    const show = applyProductPatch({ ...p, hidden: true }, { sha: 'abc', hidden: false });
    expect(show.ok && 'hidden' in show.value).toBe(false);
    const same = applyProductPatch(p, { sha: 'abc', hidden: false, prices: { estandar: 120000 } });
    expect(same.ok && same.changes).toEqual([]);
  });

  it('rechaza claves fuera del alcance del editor, variantes desconocidas y precios inválidos', () => {
    expect(applyProductPatch(p, { sha: 'abc', name: 'Otro' } as never)).toEqual({ ok: false, errors: ['campo no permitido en PATCH: name'] });
    const r = applyProductPatch(p, { sha: 'abc', prices: { nope: 1000, estandar: 12.5 } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toContain('variante desconocida: nope');
    expect(r.errors.some((e) => e.includes('variante estandar'))).toBe(true);
    expect(applyProductPatch(p, { sha: 'abc', prices: { estandar: 0 } }).ok).toBe(false);
    expect(applyProductPatch(p, { sha: 'abc', hidden: 'sí' as never }).ok).toBe(false);
  });

  it('solo lee claves propias de prices: una variante con id "constructor" no hereda Object.prototype', () => {
    const raro = makeProduct({ slug: 'raro', variants: [variant({ id: 'constructor', isDefault: true })] });
    const r = applyProductPatch(raro, { sha: 'abc', prices: {} });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changes).toEqual([]);
    expect(r.value.variants[0]!.price.amount).toBe(120000);
    const r2 = applyProductPatch(raro, { sha: 'abc', prices: { constructor: 130000 } });
    expect(r2.ok && r2.value.variants[0]!.price.amount).toBe(130000);
  });

  it('la Premium nunca queda más barata que la Estándar (ADR-017)', () => {
    const r = applyProductPatch(p, { sha: 'abc', prices: { estandar: 160000 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/Premium/);
    expect(applyProductPatch(p, { sha: 'abc', prices: { estandar: 160000, premium: 160000 } }).ok).toBe(true);
  });
});

describe('applyPartPatch', () => {
  const a = makePart({ slug: 'motor' });
  it('precio y visibilidad; rechaza lo demás', () => {
    const r = applyPartPatch(a, { sha: 'x', price: 36000, hidden: true, reason: 'subida proveedor' });
    expect(r.ok && r.value.price).toEqual({ amount: 36000, currency: 'PEN' });
    expect(r.ok && r.value.hidden).toBe(true);
    expect(r.ok && r.changes).toEqual(['precio: 35000 → 36000', 'ocultar']);
    expect(applyPartPatch(a, { sha: 'x', name: 'Otro' } as never).ok).toBe(false);
    expect(applyPartPatch(a, { sha: 'x', price: -1 }).ok).toBe(false);
    expect(applyPartPatch(a, { sha: 'x', price: 100.5 }).ok).toBe(false);
  });
});

describe('commitMessage', () => {
  it('chore(catalog): <acción> <slug> por <email> + cuerpo con cambios y motivo', () => {
    expect(commitMessage('actualizar', 'golden-eagle', 'wiliam@example.com')).toBe('chore(catalog): actualizar golden-eagle por wiliam@example.com');
    const m = commitMessage('borrar', 'motor-350w', 'diego@example.com', { changes: ['a → b'], reason: ' descatalogado ' });
    expect(m.split('\n')[0]).toBe('chore(catalog): borrar motor-350w por diego@example.com');
    expect(m).toContain('a → b');
    expect(m).toContain('Motivo: descatalogado');
  });

  it('el motivo se acota a una línea de 300 caracteres como máximo (sin control chars)', () => {
    const m = commitMessage('actualizar', 'x', 'a@b.c', { reason: 'línea 1\nlínea 2\u0007' + 'z'.repeat(500) });
    const motivo = m.split('Motivo: ')[1]!;
    expect(motivo).not.toMatch(/[\n\u0007]/);
    expect(motivo.length).toBe(300);
    expect(motivo.startsWith('línea 1 línea 2')).toBe(true);
  });
});

describe('visibilidad pública (hidden)', () => {
  it('isVisible: solo hidden === true oculta', () => {
    expect(isVisible(makeProduct())).toBe(true);
    expect(isVisible(makeProduct({ hidden: false }))).toBe(true);
    expect(isVisible(makeProduct({ hidden: true }))).toBe(false);
    expect(isVisible(makePart({ hidden: true }))).toBe(false);
  });
  it('visibleOnly filtra productos y repuestos ocultos', () => {
    const items = [makeProduct({ slug: 'a' }), makeProduct({ slug: 'b', hidden: true }), makeProduct({ slug: 'c' })];
    expect(visibleOnly(items).map((p) => p.slug)).toEqual(['a', 'c']);
    expect(visibleOnly([makePart({ slug: 'x', hidden: true })])).toEqual([]);
  });
});
