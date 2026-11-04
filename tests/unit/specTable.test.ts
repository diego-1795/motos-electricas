import { describe, it, expect } from 'vitest';
import { featureGroups, rowsFor, specTable, specTiles, specTilesFor, variantSpecs } from '../../src/domain/specTable';
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

  it('la tabla rotula "Asientos", no muestra licencia y da la garantía como valor único', () => {
    const rows = specTable(p);
    const labels = rows.map((t) => t.label);
    const by = Object.fromEntries(rows.map((t) => [t.label, t]));
    expect(labels).not.toContain('Licencia');
    expect(labels).not.toContain('Plazas');
    expect(by['Asientos']!.value).toBe('2');
    expect(by['Garantía']!.value).toBe('6 meses (motor y batería)');
    expect(by['Autonomía (declarada)']!.byVariant).toHaveLength(2);
  });

  it('garantía: formato "N meses (batería: M meses)" solo cuando motor y batería difieren', () => {
    const q = makeProduct({ specs: baseSpecs({ warrantyMonths: 12, batteryWarrantyMonths: 6 }) });
    const by = Object.fromEntries(specTable(q).map((t) => [t.label, t]));
    expect(by['Garantía']!.value).toBe('12 meses (batería: 6 meses)');
  });

  it('featureGroups: comunes en el orden de la versión por defecto y exclusivas por versión', () => {
    const est = variant({ id: 'estandar', tier: 'estandar', isDefault: true });
    const prem = premiumVariant({ specsOverride: { powerW: 500, features: ['Motor 500 W', 'Pantalla LCD', 'Alarma antirrobo', 'Batería 20Ah'] } });
    const q = makeProduct({ specs: baseSpecs({ features: ['Motor 350 W', 'Pantalla LCD', 'Batería 12Ah', 'Alarma antirrobo'] }), variants: [est, prem] });
    const g = featureGroups(q);
    expect(g.common).toEqual(['Pantalla LCD', 'Alarma antirrobo']);
    expect(g.byVariant.map((v) => [v.id, v.features])).toEqual([
      ['estandar', ['Motor 350 W', 'Batería 12Ah']],
      ['premium', ['Motor 500 W', 'Batería 20Ah']],
    ]);
  });

  it('featureGroups: sin diferencias (o una sola versión) todo es común y byVariant vacío', () => {
    expect(featureGroups(p).byVariant).toEqual([]);
    expect(featureGroups(p).common).toEqual(baseSpecs().features);
    expect(featureGroups(makeProduct()).byVariant).toEqual([]);
  });

  it('specTilesFor: specs sueltas → solo valores únicos', () => {
    const rows = specTilesFor(baseSpecs(), true);
    expect(rows.every((r) => r.value !== undefined && r.byVariant === undefined)).toBe(true);
  });
});
