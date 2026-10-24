import { describe, it, expect } from 'vitest';
import { rowsFor, specTable, specTiles, specTilesFor, variantSpecs } from '../../src/domain/specTable';
import { baseSpecs, makeProduct, premiumVariant, variant } from './fixtures';

const estandar = variant({ id: 'estandar', tier: 'estandar', isDefault: true });
const premium = premiumVariant();
const p = makeProduct({ variants: [estandar, premium] });

describe('variantSpecs', () => {
  it('devuelve las specs efectivas de cada versión con la etiqueta comercial y la predeterminada', () => {
    const vs = variantSpecs(p);
    expect(vs.map((v) => [v.id, v.label, v.isDefault])).toEqual([
      ['estandar', 'Estándar', true],
      [premium.id, 'Premium', false],
    ]);
    expect(vs[1]!.specs.powerW).toBe(premium.specsOverride!.powerW);
  });

  it('sin isDefault, la primera es la predeterminada', () => {
    const q = makeProduct({ variants: [variant({ id: 'a', isDefault: false }), variant({ id: 'b', isDefault: false })] });
    expect(variantSpecs(q).map((v) => v.isDefault)).toEqual([true, false]);
  });
});

describe('rowsFor', () => {
  const vs = variantSpecs(p);
  it('una fila con un solo valor cuando todas las versiones coinciden', () => {
    const rows = rowsFor([{ label: 'Velocidad', get: (s) => `${s.topSpeedKmh} km/h` }], vs);
    expect(rows).toEqual([{ label: 'Velocidad', value: '25 km/h' }]);
  });

  it('una fila por versión cuando difieren', () => {
    const rows = rowsFor([{ label: 'Potencia', get: (s) => `${s.powerW} W` }], vs);
    expect(rows[0]!.value).toBeUndefined();
    expect(rows[0]!.byVariant).toEqual([
      { id: 'estandar', label: 'Estándar', value: '350 W', isDefault: true },
      { id: premium.id, label: 'Premium', value: `${premium.specsOverride!.powerW} W`, isDefault: false },
    ]);
  });

  it('omite la fila si ninguna versión tiene valor; "—" si solo falta en alguna', () => {
    const none = rowsFor([{ label: 'Peso', get: (s) => (s.weightKg === undefined ? undefined : `${s.weightKg} kg`) }], vs);
    expect(none).toEqual([]);
    const some = rowsFor([{ label: 'X', get: (s) => (s.powerW > 400 ? 'sí' : undefined) }], vs);
    expect(some[0]!.byVariant!.map((v) => v.value)).toEqual(['—', 'sí']);
  });
});

describe('specTiles / specTable', () => {
  it('los tiles de autonomía y potencia van por versión; velocidad y carga, únicos', () => {
    const tiles = specTiles(p);
    const by = Object.fromEntries(tiles.map((t) => [t.label, t]));
    expect(by['Autonomía']!.byVariant).toHaveLength(2);
    expect(by['Potencia']!.byVariant).toHaveLength(2);
    expect(by['Velocidad']!.value).toBe('25 km/h');
    expect(by['Carga']!.value).toBe('6-8 h');
    expect(tiles.map((t) => t.label)).toEqual(['Autonomía', 'Velocidad', 'Potencia', 'Batería', 'Carga', 'Carga máx.']);
  });

  it('compacto: sin carga máx. ni peso', () => {
    expect(specTiles(p, true).map((t) => t.label)).toEqual(['Autonomía', 'Velocidad', 'Potencia', 'Batería', 'Carga']);
  });

  it('la tabla incluye garantía y licencia como valores únicos', () => {
    const rows = specTable(p);
    const by = Object.fromEntries(rows.map((t) => [t.label, t]));
    expect(by['Licencia']!.value).toBe('Sin licencia');
    expect(by['Garantía']!.value).toMatch(/meses/);
    expect(by['Autonomía (declarada)']!.byVariant).toHaveLength(2);
  });

  it('specTilesFor: specs sueltas → solo valores únicos', () => {
    const rows = specTilesFor(baseSpecs(), true);
    expect(rows.every((r) => r.value !== undefined && r.byVariant === undefined)).toBe(true);
  });
});
