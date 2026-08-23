import { describe, it, expect } from 'vitest';
import { add, eur, formatMoney, multiply, pen, sum } from '../../src/domain/money';

describe('money', () => {
  it('pen crea Money en céntimos con moneda PEN', () => {
    expect(pen(1234)).toEqual({ amount: 1234, currency: 'PEN' });
  });

  it('eur es un alias deprecado de pen (misma moneda PEN)', () => {
    expect(eur(1234)).toEqual(pen(1234));
    expect(eur(1).currency).toBe('PEN');
  });

  it('add suma importes', () => {
    expect(add(pen(100), pen(250))).toEqual(pen(350));
  });

  it('multiply escala por cantidad', () => {
    expect(multiply(pen(499900), 3)).toEqual(pen(1499700));
    expect(multiply(pen(499900), 0)).toEqual(pen(0));
  });

  it('sum agrega una lista y devuelve 0 para lista vacía', () => {
    expect(sum([pen(1), pen(2), pen(3)])).toEqual(pen(6));
    expect(sum([])).toEqual(pen(0));
  });

  it('formatMoney usa formato peruano "S/ N" sin decimales para importes redondos', () => {
    expect(formatMoney(pen(0))).toBe('S/ 0');
    expect(formatMoney(pen(1215500))).toBe('S/ 12,155');
    expect(formatMoney(pen(150000000))).toBe('S/ 1,500,000');
  });

  it('formatMoney conserva 2 decimales con punto cuando el importe no es entero', () => {
    expect(formatMoney(pen(1215550))).toBe('S/ 12,155.50');
    expect(formatMoney(pen(5))).toBe('S/ 0.05');
    expect(formatMoney(pen(499950))).toBe('S/ 4,999.50');
  });

  it('formatMoney agrupa miles con coma también en precios de 4 cifras', () => {
    expect(formatMoney(pen(499900))).toBe('S/ 4,999');
  });

  it('formatMoney: sin agrupación bajo 1,000 y agrupación correcta en límites', () => {
    expect(formatMoney(pen(99900))).toBe('S/ 999');
    expect(formatMoney(pen(100000))).toBe('S/ 1,000');
    expect(formatMoney(pen(123456700))).toBe('S/ 1,234,567');
  });

  it('formatMoney no usa espacios duros (NBSP) ni el símbolo €', () => {
    const s = formatMoney(pen(499900));
    expect(s).not.toMatch(/[  €]/);
    expect(s.startsWith('S/ ')).toBe(true);
  });
});
