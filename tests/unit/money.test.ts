import { describe, it, expect } from 'vitest';
import { add, eur, formatMoney, multiply, sum } from '../../src/domain/money';
import { norm } from './fixtures';

describe('money', () => {
  it('eur crea Money en céntimos con moneda EUR', () => {
    expect(eur(1234)).toEqual({ amount: 1234, currency: 'EUR' });
  });

  it('add suma importes', () => {
    expect(add(eur(100), eur(250))).toEqual(eur(350));
  });

  it('multiply escala por cantidad', () => {
    expect(multiply(eur(499900), 3)).toEqual(eur(1499700));
    expect(multiply(eur(499900), 0)).toEqual(eur(0));
  });

  it('sum agrega una lista y devuelve 0 para lista vacía', () => {
    expect(sum([eur(1), eur(2), eur(3)])).toEqual(eur(6));
    expect(sum([])).toEqual(eur(0));
  });

  it('formatMoney usa formato es-ES sin decimales para importes redondos', () => {
    expect(norm(formatMoney(eur(0)))).toBe('0 €');
    expect(norm(formatMoney(eur(1215500)))).toBe('12.155 €');
    expect(norm(formatMoney(eur(150000000)))).toBe('1.500.000 €');
  });

  it('formatMoney conserva decimales cuando el importe no es entero en euros', () => {
    expect(norm(formatMoney(eur(1215550)))).toBe('12.155,50 €');
    expect(norm(formatMoney(eur(5)))).toBe('0,05 €');
  });

  /**
   * BUG (src/domain/money.ts): CLDR "es" usa minimumGroupingDigits=2, así que
   * Intl no agrupa cifras de 4 dígitos → "4999 €" en lugar del "4.999 €" del brief.
   * Fix: añadir `useGrouping: 'always'` a ambos NumberFormat. Cuando se corrija,
   * este test pasará a fallar como "expected to fail" → quitar `.fails`.
   */
  it('formatMoney agrupa miles también en precios de 4 cifras (brief: "4.999 €")', () => {
    expect(norm(formatMoney(eur(499900)))).toBe('4.999 €');
    expect(norm(formatMoney(eur(499950)))).toBe('4.999,50 €');
  });
});
