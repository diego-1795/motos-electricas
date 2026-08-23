import { describe, it, expect } from 'vitest';
import { applyFilters, parseFilters, sortProducts, AVAILABILITIES, TYPES, USE_CASES, sortLabels } from '../../src/domain/catalog';
import { pen } from '../../src/domain/money';
import { baseSpecs, makeProduct, variant } from './fixtures';

const cheap = makeProduct({
  slug: 'cheap',
  category: 'bicimotos',
  featured: 10,
  publishedAt: '2024-01-01',
  useCases: ['ciudad'],
  variants: [variant({ price: pen(150000), availability: 'en-stock' })],
  specs: baseSpecs({ rangeKm: 50, topSpeedKmh: 25, powerW: 500, seats: 1, battery: { ...baseSpecs().battery, capacityKwh: 1 } }),
});
const mid = makeProduct({
  slug: 'mid',
  category: 'scooters-electricos',
  featured: 80,
  publishedAt: '2025-03-01',
  useCases: ['ciudad', 'trabajo'],
  variants: [variant({ price: pen(300000), availability: 'bajo-pedido' }), variant({ id: 'v2', price: pen(350000), availability: 'agotado' })],
  specs: baseSpecs({ rangeKm: 90, topSpeedKmh: 45, powerW: 3000, seats: 2, battery: { ...baseSpecs().battery, capacityKwh: 2.5 } }),
});
const big = makeProduct({
  slug: 'big',
  category: 'motos-electricas',
  featured: 100,
  publishedAt: '2025-01-01',
  useCases: ['trayectos-largos', 'dos-personas'],
  variants: [variant({ price: pen(600000), availability: 'proximamente' }), variant({ id: 'v2', price: pen(550000), availability: 'proximamente', specsOverride: { rangeKm: 160 } })],
  specs: baseSpecs({ rangeKm: 120, topSpeedKmh: 110, powerW: 8000, seats: 2, battery: { ...baseSpecs().battery, capacityKwh: 4 } }),
});
const all = [mid, big, cheap];
const slugs = (ps: typeof all) => ps.map((p) => p.slug);

describe('applyFilters', () => {
  it('sin filtros devuelve todo', () => {
    expect(applyFilters(all, {})).toHaveLength(3);
  });
  it('type', () => {
    expect(slugs(applyFilters(all, { type: 'bicimotos' }))).toEqual(['cheap']);
  });
  it('priceMax usa el precio "desde" (variante más barata)', () => {
    expect(slugs(applyFilters(all, { priceMax: 300000 }))).toEqual(['mid', 'cheap']);
    expect(slugs(applyFilters(all, { priceMax: 550000 }))).toEqual(['mid', 'big', 'cheap']);
    expect(slugs(applyFilters(all, { priceMax: 100 }))).toEqual([]);
  });
  it('rangeMin usa la autonomía máxima entre variantes', () => {
    expect(slugs(applyFilters(all, { rangeMin: 100 }))).toEqual(['big']);
    expect(slugs(applyFilters(all, { rangeMin: 160 }))).toEqual(['big']);
    expect(slugs(applyFilters(all, { rangeMin: 161 }))).toEqual([]);
  });
  it('speedMin / powerMin / batteryKwhMin', () => {
    expect(slugs(applyFilters(all, { speedMin: 45 }))).toEqual(['mid', 'big']);
    expect(slugs(applyFilters(all, { powerMin: 3000 }))).toEqual(['mid', 'big']);
    expect(slugs(applyFilters(all, { batteryKwhMin: 3 }))).toEqual(['big']);
  });
  it('seats es mínimo', () => {
    expect(slugs(applyFilters(all, { seats: 2 }))).toEqual(['mid', 'big']);
    expect(slugs(applyFilters(all, { seats: 1 }))).toHaveLength(3);
  });
  it('useCase', () => {
    expect(slugs(applyFilters(all, { useCase: 'ciudad' }))).toEqual(['mid', 'cheap']);
    expect(slugs(applyFilters(all, { useCase: 'carga' }))).toEqual([]);
  });
  it('availability usa el mejor estado del producto', () => {
    expect(slugs(applyFilters(all, { availability: 'en-stock' }))).toEqual(['cheap']);
    expect(slugs(applyFilters(all, { availability: 'bajo-pedido' }))).toEqual(['mid']);
    expect(slugs(applyFilters(all, { availability: 'agotado' }))).toEqual([]);
  });
  it('combina filtros con AND', () => {
    expect(slugs(applyFilters(all, { useCase: 'ciudad', speedMin: 40 }))).toEqual(['mid']);
  });
});

describe('sortProducts', () => {
  it('precio-asc / precio-desc', () => {
    expect(slugs(sortProducts(all, 'precio-asc'))).toEqual(['cheap', 'mid', 'big']);
    expect(slugs(sortProducts(all, 'precio-desc'))).toEqual(['big', 'mid', 'cheap']);
  });
  it('autonomia y potencia descendentes', () => {
    expect(slugs(sortProducts(all, 'autonomia'))).toEqual(['big', 'mid', 'cheap']);
    expect(slugs(sortProducts(all, 'potencia'))).toEqual(['big', 'mid', 'cheap']);
  });
  it('novedades por publishedAt desc', () => {
    expect(slugs(sortProducts(all, 'novedades'))).toEqual(['mid', 'big', 'cheap']);
  });
  it('recomendados por featured desc', () => {
    expect(slugs(sortProducts(all, 'recomendados'))).toEqual(['big', 'mid', 'cheap']);
  });
  it('no muta el array de entrada', () => {
    const input = [...all];
    sortProducts(input, 'precio-asc');
    expect(slugs(input)).toEqual(['mid', 'big', 'cheap']);
  });
});

describe('parseFilters', () => {
  const parse = (qs: string) => parseFilters(new URLSearchParams(qs));

  it('vacío → todo undefined y orden recomendados', () => {
    const f = parse('');
    expect(f.sort).toBe('recomendados');
    expect(f.priceMax).toBeUndefined();
    expect(f.useCase).toBeUndefined();
    expect(f.type).toBeUndefined();
    expect(f.availability).toBeUndefined();
  });
  it('orden válido se respeta; inválido → recomendados', () => {
    for (const k of Object.keys(sortLabels)) expect(parse(`orden=${k}`).sort).toBe(k);
    expect(parse('orden=hack').sort).toBe('recomendados');
  });
  it('precio en soles → céntimos; potencia en kW → W', () => {
    expect(parse('precio=4000').priceMax).toBe(400000);
    expect(parse('potencia=2.5').powerMin).toBe(2500);
  });
  it('números no válidos, negativos o cero → undefined', () => {
    expect(parse('precio=abc').priceMax).toBeUndefined();
    expect(parse('precio=-5').priceMax).toBeUndefined();
    expect(parse('autonomia=0').rangeMin).toBeUndefined();
    expect(parse('velocidad=Infinity').speedMin).toBeUndefined();
  });
  it('numéricos directos: autonomia, velocidad, bateria, plazas', () => {
    const f = parse('autonomia=100&velocidad=45&bateria=2.5&plazas=2');
    expect(f).toMatchObject({ rangeMin: 100, speedMin: 45, batteryKwhMin: 2.5, seats: 2 });
  });
  it('enums: uso/disponibilidad/tipo válidos se aceptan, desconocidos → undefined', () => {
    expect(parse('uso=ciudad').useCase).toBe('ciudad');
    expect(parse('uso=volar').useCase).toBeUndefined();
    expect(parse('disponibilidad=en-stock').availability).toBe('en-stock');
    expect(parse('disponibilidad=x').availability).toBeUndefined();
    expect(parse('tipo=bicimotos').type).toBe('bicimotos');
    expect(parse('tipo=accesorios').type).toBeUndefined();
  });
  it('constantes exportadas', () => {
    expect(USE_CASES).toHaveLength(7);
    expect(AVAILABILITIES).toHaveLength(4);
    expect(TYPES).not.toContain('accesorios');
  });
});
