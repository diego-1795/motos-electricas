import { describe, it, expect } from 'vitest';
import { recommend, scoreProduct, useCaseLabel, type FinderAnswers } from '../../src/domain/recommendation';
import { pen } from '../../src/domain/money';
import { baseSpecs, makeProduct, variant } from './fixtures';

const none: FinderAnswers = { useCases: [], types: [] };
const city = makeProduct({
  slug: 'city',
  useCases: ['ciudad', 'trabajo'],
  variants: [variant({ price: pen(300000) })],
  specs: baseSpecs({ rangeKm: 100, topSpeedKmh: 80, powerW: 4000 }),
});

describe('scoreProduct', () => {
  it('sin respuestas devuelve 50 y sin razones', () => {
    const r = scoreProduct(city, none);
    expect(r.score).toBe(50);
    expect(r.reasons).toEqual([]);
  });

  it('useCases: proporción de usos coincidentes', () => {
    expect(scoreProduct(city, { ...none, useCases: ['ciudad'] }).score).toBe(100);
    expect(scoreProduct(city, { ...none, useCases: ['ciudad', 'carga'] }).score).toBe(50);
    expect(scoreProduct(city, { ...none, useCases: ['carga'] }).score).toBe(0);
    expect(scoreProduct(city, { ...none, useCases: ['ciudad', 'trabajo'] }).reasons[0]).toBe('Ideal para ciudad, trabajo');
  });

  it('presupuesto: dentro → 100; fuera → penalización proporcional al exceso', () => {
    expect(scoreProduct(city, { ...none, budgetMax: 300000 }).score).toBe(100);
    expect(scoreProduct(city, { ...none, budgetMax: 300000 }).reasons).toContain('Dentro de tu presupuesto');
    // S/ 3,000 con presupuesto S/ 2,000 → exceso 50 % → s = 0.5
    expect(scoreProduct(city, { ...none, budgetMax: 200000 }).score).toBe(50);
    // exceso ≥ 100 % → 0
    expect(scoreProduct(city, { ...none, budgetMax: 100000 }).score).toBe(0);
    expect(scoreProduct(city, { ...none, budgetMax: 100000 }).reasons).toEqual([]);
  });

  it('autonomía, velocidad y potencia usan ratio acotado a 1', () => {
    expect(scoreProduct(city, { ...none, rangeMin: 50 }).score).toBe(100);
    expect(scoreProduct(city, { ...none, rangeMin: 200 }).score).toBe(50);
    expect(scoreProduct(city, { ...none, rangeMin: 100 }).reasons).toContain('Hasta 100 km de autonomía');
    expect(scoreProduct(city, { ...none, speedMin: 160 }).score).toBe(50);
    expect(scoreProduct(city, { ...none, speedMin: 80 }).reasons).toContain('80 km/h de velocidad máxima');
    expect(scoreProduct(city, { ...none, powerMin: 8000 }).score).toBe(50);
    expect(scoreProduct(city, { ...none, powerMin: 0 }).score).toBe(100);
  });

  it('rangeMin usa la autonomía máxima entre variantes', () => {
    const p = makeProduct({ variants: [variant({ id: 'a' }), variant({ id: 'b', specsOverride: { rangeKm: 200 } })] });
    expect(scoreProduct(p, { ...none, rangeMin: 200 }).score).toBe(100);
  });

  it('tipo: coincide o no', () => {
    expect(scoreProduct(city, { ...none, types: ['bicimotos'] }).score).toBe(100);
    expect(scoreProduct(city, { ...none, types: ['trimotos'] }).score).toBe(0);
    expect(scoreProduct(city, { ...none, types: ['bicimotos', 'trimotos'] }).score).toBe(100);
  });

  it('combina criterios con pesos (useCases 3, budget 2.5, range 2, speed 1.5, power 1, type 2)', () => {
    // useCases 0 (peso 3) + budget 1 (peso 2.5) → 2.5 / 5.5 = 45.45 → 45
    expect(scoreProduct(city, { ...none, useCases: ['carga'], budgetMax: 300000 }).score).toBe(45);
    // type 0 (2) + range 1 (2) + speed 1 (1.5) → 3.5/5.5 → 64
    expect(scoreProduct(city, { ...none, types: ['trimotos'], rangeMin: 10, speedMin: 10 }).score).toBe(64);
  });

  it('máximo 3 razones', () => {
    const r = scoreProduct(city, { useCases: ['ciudad'], budgetMax: 999999, rangeMin: 10, speedMin: 10, types: [] });
    expect(r.reasons).toHaveLength(3);
  });
});

describe('recommend', () => {
  const a = makeProduct({ slug: 'a', featured: 10, useCases: ['ciudad'] });
  const b = makeProduct({ slug: 'b', featured: 90, useCases: ['ciudad'] });
  const c = makeProduct({ slug: 'c', featured: 100, useCases: ['carga'] });
  const acc = makeProduct({ slug: 'acc', category: 'repuestos', featured: 999, useCases: ['ciudad'] });

  it('excluye repuestos y ordena por score desc', () => {
    const r = recommend([c, a, b, acc], { ...none, useCases: ['ciudad'] });
    expect(r.map((x) => x.product.slug)).toEqual(['b', 'a', 'c']);
    expect(r[0]!.score).toBe(100);
    expect(r[2]!.score).toBe(0);
  });

  it('desempata por featured descendente', () => {
    const r = recommend([a, b], none);
    expect(r.map((x) => x.product.slug)).toEqual(['b', 'a']);
  });

  it('respeta el límite', () => {
    expect(recommend([a, b, c], none, 2)).toHaveLength(2);
    expect(recommend([], none)).toEqual([]);
  });
});

describe('useCaseLabel', () => {
  it('etiqueta todos los casos de uso', () => {
    expect(useCaseLabel('ciudad')).toBe('Ciudad');
    expect(useCaseLabel('trayectos-largos')).toBe('Trayectos largos');
    expect(useCaseLabel('carga')).toBe('Transporte de carga');
  });
});
