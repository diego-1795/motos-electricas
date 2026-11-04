import type { Product, ProductVariant, Specs } from './types';
import { batteryLabel, chargeLabel, defaultVariant, effectiveSpecs, powerLabel, rangeLabel, sortedVariants, tierLabel, warrantyLabel } from './product';

/**
 * Ficha técnica por versión (Estándar / Premium).
 * Cada fila tiene un único `value` cuando todas las versiones coinciden, o
 * `byVariant` cuando difieren (autonomía, potencia, batería…). La UI muestra
 * solo la versión elegida en el configurador y, sin JS, todas etiquetadas.
 */
export interface VariantValue {
  /** id de la variante (coincide con el radio "variant" del configurador) */
  id: string;
  /** Etiqueta comercial: Estándar / Premium */
  label: string;
  value: string;
  isDefault: boolean;
}

export interface SpecRow {
  label: string;
  value?: string;
  byVariant?: VariantValue[];
}

type SpecDef = { label: string; get: (s: Specs) => string | undefined };

export interface VariantSpecs {
  id: string;
  label: string;
  specs: Specs;
  isDefault: boolean;
}

/** Specs efectivas de cada versión del producto, con la versión por defecto marcada. */
export function variantSpecs(p: Product): VariantSpecs[] {
  const def = defaultVariant(p);
  return sortedVariants(p).map((v: ProductVariant) => ({ id: v.id, label: tierLabel[v.tier], specs: effectiveSpecs(p, v), isDefault: v === def }));
}

/** Convierte definiciones en filas, agrupando por versión solo cuando los valores difieren. */
export function rowsFor(defs: SpecDef[], variants: VariantSpecs[]): SpecRow[] {
  const rows: SpecRow[] = [];
  for (const d of defs) {
    const values = variants.map((v) => ({ id: v.id, label: v.label, value: d.get(v.specs), isDefault: v.isDefault }));
    if (values.every((v) => v.value === undefined)) continue;
    const distinct = new Set(values.map((v) => v.value));
    if (distinct.size === 1) rows.push({ label: d.label, value: values[0]!.value });
    else rows.push({ label: d.label, byVariant: values.map((v) => ({ ...v, value: v.value ?? '—' })) });
  }
  return rows;
}

/** Tiles destacados (cabecera de la ficha técnica). */
export function tileDefs(compact = false): SpecDef[] {
  return [
    { label: 'Autonomía', get: rangeLabel },
    { label: 'Velocidad', get: (s) => `${s.topSpeedKmh} km/h` },
    { label: 'Potencia', get: (s) => powerLabel(s.powerW) },
    { label: 'Batería', get: batteryLabel },
    { label: 'Carga', get: chargeLabel },
    ...(compact ? [] : [{ label: 'Carga máx.', get: (s: Specs) => `${s.maxLoadKg} kg` }]),
    ...(compact ? [] : [{ label: 'Peso', get: (s: Specs) => (s.weightKg === undefined ? undefined : `${s.weightKg} kg`) }]),
  ];
}

/** Tabla completa de la ficha técnica. */
export function tableDefs(): SpecDef[] {
  return [
    { label: 'Autonomía (declarada)', get: rangeLabel },
    { label: 'Velocidad máxima', get: (s) => `${s.topSpeedKmh} km/h` },
    { label: 'Potencia nominal', get: (s) => powerLabel(s.powerW) },
    { label: 'Potencia pico', get: (s) => (s.peakPowerW ? `${s.peakPowerW} W` : undefined) },
    { label: 'Batería', get: batteryLabel },
    { label: 'Química de la batería', get: (s) => (s.battery.chemistry === 'plomo-acido' ? 'Plomo-ácido' : s.battery.chemistry) },
    { label: 'Marca de la batería', get: (s) => s.battery.brand },
    { label: 'Batería extraíble', get: (s) => (s.battery.removable ? 'Sí' : 'No') },
    { label: 'Tiempo de carga', get: chargeLabel },
    {
      label: 'Vida útil de la batería',
      get: (s) => (s.battery.cycles ? `${s.battery.cycles} ciclos${s.battery.lifeMonths ? ` · ${s.battery.lifeMonths / 12} años` : ''}` : undefined),
    },
    { label: 'Motor', get: (s) => s.motorType },
    { label: 'Controlador', get: (s) => s.controller },
    { label: 'Frenos', get: (s) => s.brakes },
    { label: 'Suspensión', get: (s) => s.suspension },
    { label: 'Llantas', get: (s) => s.tires },
    { label: 'Iluminación', get: (s) => s.lighting },
    { label: 'Pantalla', get: (s) => s.display },
    { label: 'Modos de conducción', get: (s) => s.drivingModes.join(', ') },
    { label: 'Asientos', get: (s) => String(s.seats) },
    { label: 'Carga máxima', get: (s) => `${s.maxLoadKg} kg` },
    { label: 'Peso', get: (s) => (s.weightKg === undefined ? undefined : `${s.weightKg} kg`) },
    { label: 'Dimensiones (L×An×Al)', get: (s) => (s.dimensionsMm ? `${s.dimensionsMm.join(' × ')} mm` : undefined) },
    { label: 'Protección', get: (s) => s.ipRating },
    // Sin fila de licencia: el cliente no quiere mostrarla en la ficha (ADR 2026-11-04); `specs.license` sigue en el esquema para validación.
    { label: 'Garantía', get: warrantyLabel },
  ];
}

export function specTiles(p: Product, compact = false): SpecRow[] {
  return rowsFor(tileDefs(compact), variantSpecs(p));
}

export function specTable(p: Product): SpecRow[] {
  return rowsFor(tableDefs(), variantSpecs(p));
}

/** Características (pestaña Especificaciones) separadas en comunes y propias de cada versión. */
export interface FeatureGroups {
  /** Líneas presentes en todas las versiones, en el orden de la versión por defecto */
  common: string[];
  /** Líneas exclusivas de cada versión (vacío si solo hay una versión o no difieren) */
  byVariant: { id: string; label: string; isDefault: boolean; features: string[] }[];
}

export function featureGroups(p: Product): FeatureGroups {
  const vs = variantSpecs(p);
  const def = vs.find((v) => v.isDefault) ?? vs[0]!;
  const lists = vs.map((v) => v.specs.features);
  const common = def.specs.features.filter((f) => lists.every((l) => l.includes(f)));
  const byVariant = vs.map((v) => ({ id: v.id, label: v.label, isDefault: v.isDefault, features: v.specs.features.filter((f) => !common.includes(f)) }));
  return { common, byVariant: byVariant.some((v) => v.features.length) ? byVariant : [] };
}

/** Tiles para unas specs sueltas (sin versiones), p. ej. el styleguide. */
export function specTilesFor(specs: Specs, compact = false): SpecRow[] {
  return rowsFor(tileDefs(compact), [{ id: 'base', label: '', specs, isDefault: true }]);
}
