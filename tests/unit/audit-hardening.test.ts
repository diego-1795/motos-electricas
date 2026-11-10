import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commitMessage } from '../../src/domain/adminPolicy';
import { parseFrontmatter, serializeFrontmatter } from '../../src/domain/frontmatter';
import { fleetFacts } from '../../src/domain/product';
import { parseProduct } from '../../src/content/schemas';
import { $toast, TOAST_MS, dismissToast, pauseToast, resumeToast, toast } from '../../src/stores/toast';
import { decodeBase64 } from '../../functions/api/admin/_lib/uploads';
import { HttpError } from '../../functions/api/admin/_lib/http';
import { baseSpecs, makeProduct, premiumVariant, variant } from './fixtures';

/**
 * Casos que la auditoría del 2026-11-08 señaló como "hoy se resuelven bien, pero ningún test lo afirma"
 * (docs/25-auditoria-2026-11-08.md, apéndice) y las piezas nuevas de la ronda de detalles menores.
 */

describe('mensaje de commit: nada de lo que escribe el panel puede añadir líneas ni trailers', () => {
  it('un nombre de variante con saltos de línea queda en una sola línea de cambios', () => {
    const m = commitMessage('actualizar', 'golden-eagle', 'wiliam@example.com', {
      changes: ['Premium\n\nSigned-off-by: Intruso <x@evil.example>: 150000 → 160000', 'ocultar'],
      reason: 'ajuste',
    });
    const lines = m.split('\n');
    expect(lines[0]).toBe('chore(catalog): actualizar golden-eagle por wiliam@example.com');
    // Ninguna línea del cuerpo empieza por un trailer de git
    expect(lines.filter((l) => /^(Signed-off-by|Co-authored-by|Reviewed-by):/i.test(l))).toEqual([]);
    expect(m).toContain('Premium Signed-off-by: Intruso <x@evil.example>: 150000 → 160000\nocultar');
    expect(m.endsWith('Motivo: ajuste')).toBe(true);
  });

  it('cambios vacíos o solo con caracteres de control no dejan líneas en blanco', () => {
    expect(commitMessage('actualizar', 'x', 'a@b.c', { changes: ['\n\t', ''] })).toBe('chore(catalog): actualizar x por a@b.c');
  });
});

describe('frontmatter: un campo de texto no puede cerrar el bloque ni inyectar claves', () => {
  it('título con "---", comillas, dos puntos, U+2028 y saltos de línea sobrevive a escribir → leer', () => {
    const data = {
      title: 'Ruptura\n---\nauthor: "intruso"\nhidden: true',
      description: 'Comillas " y \' · dos puntos: sí · separador   de línea · barra \\ final',
      relatedProducts: ['golden-eagle'],
    };
    const text = serializeFrontmatter(data, 'Cuerpo del artículo.\n');
    // El bloque sigue teniendo exactamente dos delimitadores: el salto de línea del título va escapado
    expect(text.split('\n').filter((l) => l === '---')).toHaveLength(2);
    const parsed = parseFrontmatter(text);
    expect(parsed.data).toEqual(data);
    expect(Object.keys(parsed.data)).toEqual(['title', 'description', 'relatedProducts']);
    expect(parsed.body.trim()).toBe('Cuerpo del artículo.');
  });
});

describe('subidas: el base64 es base64, sin prefijos de data: URL', () => {
  const rejects = (input: string) => {
    try {
      decodeBase64(input);
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      return (e as HttpError).status;
    }
    return 200;
  };

  it('un "data:application/pdf;base64,…" pegado tal cual se rechaza con 400 (no se interpreta)', () => {
    const body = Buffer.from('%PDF-1.4\n').toString('base64');
    expect(rejects(`data:application/pdf;base64,${body}`)).toBe(400);
    expect(rejects(`${body}"}`)).toBe(400);
    expect(rejects('JVBERi0x-LjQK')).toBe(400); // base64url no es base64
    expect(rejects(body)).toBe(200);
  });
});

describe('ficha de producto: el color es un #rrggbb (acaba en un style="background:…")', () => {
  const withHex = (hex: string) => JSON.parse(JSON.stringify(makeProduct({ variants: [variant({ isDefault: true })], colors: [{ id: 'negro', name: 'Negro', hex }] }))) as unknown;

  it('acepta #rrggbb en mayúsculas o minúsculas', () => {
    for (const ok of ['#000000', '#E8A0BF', '#f2f2f0']) expect(parseProduct(withHex(ok)).ok, ok).toBe(true);
  });

  it('rechaza formas cortas, nombres, rgb() y cualquier intento de inyectar CSS', () => {
    for (const bad of ['#000', 'red', 'rgb(0,0,0)', '#00000080', '#000000;background:url(https://evil.example/x)', '#000000 !important', '']) {
      const r = parseProduct(withHex(bad));
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.errors.join(' ')).toMatch(/hex/);
    }
  });
});

describe('fleetFacts: cifras de la gama desde el catálogo', () => {
  const bike = (slug: string, over = {}) =>
    makeProduct({
      slug,
      category: 'bicimotos',
      specs: baseSpecs({ rangeMinKm: 30, rangeKm: 35, topSpeedKmh: 25 }),
      variants: [variant({ isDefault: true }), premiumVariant({ specsOverride: { rangeMinKm: 40, rangeKm: 50 } })],
      ...over,
    });
  const trike = makeProduct({ slug: 'titan', category: 'trimotos', specs: baseSpecs({ rangeMinKm: 35, rangeKm: 40, topSpeedKmh: 25 }), variants: [variant({ isDefault: true })] });

  it('autonomía mínima y máxima entre todas las versiones de las bicimotos, su velocidad y el máximo de las trimotos', () => {
    expect(fleetFacts([bike('a'), bike('b'), trike])).toEqual({ bikeRangeMinKm: 30, bikeRangeMaxKm: 50, bikeTopSpeedKmh: 25, trikeRangeMaxKm: 40 });
  });

  it('sin rangeMinKm usa rangeKm; sin trimotos devuelve null en su cifra; sin bicimotos, null', () => {
    const only = bike('c', { specs: baseSpecs({ rangeMinKm: undefined, rangeKm: 45, topSpeedKmh: 32 }), variants: [variant({ isDefault: true })] });
    expect(fleetFacts([only])).toEqual({ bikeRangeMinKm: 45, bikeRangeMaxKm: 45, bikeTopSpeedKmh: 32, trikeRangeMaxKm: null });
    expect(fleetFacts([trike])).toBeNull();
    expect(fleetFacts([])).toBeNull();
  });

  it('las promociones no cuentan como bicimotos del catálogo', () => {
    const promo = bike('promo', { category: 'promociones', specs: baseSpecs({ rangeMinKm: 5, rangeKm: 99, topSpeedKmh: 80 }), variants: [variant({ isDefault: true })] });
    expect(fleetFacts([bike('a'), promo])).toMatchObject({ bikeRangeMinKm: 30, bikeRangeMaxKm: 50, bikeTopSpeedKmh: 25 });
  });
});

describe('toast: visible al menos 5 s, se puede pausar y cerrar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dismissToast();
  });
  afterEach(() => vi.useRealTimers());

  it('dura TOAST_MS (≥ 5000) y después desaparece', () => {
    expect(TOAST_MS).toBeGreaterThanOrEqual(5000);
    toast('Añadido', { label: 'Ver', href: '/carrito' });
    expect($toast.get()).toMatchObject({ text: 'Añadido', actionLabel: 'Ver', actionHref: '/carrito' });
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect($toast.get()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect($toast.get()).toBeNull();
  });

  it('en pausa (ratón o foco encima) no se cierra; al reanudar vuelve a contar entero; cerrar es inmediato', () => {
    toast('Límite del comparador');
    pauseToast();
    vi.advanceTimersByTime(TOAST_MS * 3);
    expect($toast.get()).not.toBeNull();
    resumeToast();
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect($toast.get()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect($toast.get()).toBeNull();

    toast('Otro');
    dismissToast();
    expect($toast.get()).toBeNull();
    vi.advanceTimersByTime(TOAST_MS);
    expect($toast.get()).toBeNull();
    // Reanudar sin aviso visible no programa nada
    resumeToast();
    expect(vi.getTimerCount()).toBe(0);
  });
});
