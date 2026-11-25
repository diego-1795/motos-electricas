/**
 * Edición de especificaciones desde el panel (ADR-032). Puro: lo usan el diálogo del panel, la política del
 * servidor y los tests.
 *
 * - Formulario (todo texto, como en los <input>) ↔ `Specs` / `specsOverride` de una versión, con errores en llano.
 * - `specsChanges`: qué cambió, con nombres legibles, para el historial (commit).
 * - Especificaciones de repuestos: lista libre nombre/valor (`PartSpec`).
 */
import type { Battery, Part, PartSpec, ProductVariant, Specs } from './types';

export type SpecsOverride = NonNullable<ProductVariant['specsOverride']>;

export const CHEMISTRIES: Battery['chemistry'][] = ['LiFePO4', 'NMC', 'plomo-acido', 'otro'];
export const CHEMISTRY_LABEL: Record<Battery['chemistry'], string> = { LiFePO4: 'Litio LiFePO4', NMC: 'Litio NMC', 'plomo-acido': 'Plomo-ácido', otro: 'Otra' };
export const LICENSES: Specs['license'][] = ['sin-licencia', 'B-I', 'B-IIa', 'B-IIb', 'B-IIc'];
export const LICENSE_LABEL: Record<Specs['license'], string> = { 'sin-licencia': 'Sin licencia', 'B-I': 'B-I', 'B-IIa': 'B-IIa', 'B-IIb': 'B-IIb', 'B-IIc': 'B-IIc' };

/** Nombres legibles (formulario, errores e historial) */
export const SPEC_LABEL: Record<Exclude<keyof Specs, 'battery'>, string> & Record<`battery.${keyof Battery}`, string> = {
  rangeKm: 'Autonomía máxima (km)',
  rangeMinKm: 'Autonomía mínima (km)',
  topSpeedKmh: 'Velocidad máxima (km/h)',
  powerW: 'Potencia nominal (W)',
  peakPowerW: 'Potencia pico (W)',
  weightKg: 'Peso (kg)',
  maxLoadKg: 'Carga máxima (kg)',
  seats: 'Plazas',
  license: 'Licencia',
  dimensionsMm: 'Medidas (mm)',
  tires: 'Llantas',
  wheelInches: 'Aro (pulgadas)',
  brakes: 'Frenos',
  suspension: 'Suspensión',
  lighting: 'Luces',
  display: 'Pantalla',
  drivingModes: 'Modos de conducción',
  motorType: 'Motor',
  controller: 'Controlador',
  ipRating: 'Protección al agua (IP)',
  warrantyMonths: 'Garantía (meses)',
  batteryWarrantyMonths: 'Garantía de la batería (meses)',
  features: 'Características',
  'battery.voltage': 'Batería: voltaje (V)',
  'battery.capacityAh': 'Batería: capacidad (Ah)',
  'battery.capacityKwh': 'Batería: capacidad (kWh)',
  'battery.chemistry': 'Batería: tipo',
  'battery.removable': 'Batería: extraíble',
  'battery.chargeHours': 'Batería: horas de carga',
  'battery.cycles': 'Batería: ciclos',
  'battery.lifeMonths': 'Batería: vida útil (meses)',
  'battery.brand': 'Batería: marca',
};

/* ---------- Números escritos a mano ---------- */

/** "1,200" → 1200; "1,5" → 1.5; "60 km" → null. Vacío → undefined. */
export function parseNumber(raw: string): number | null | undefined {
  const s = raw.trim().replace(/\s+/g, '');
  if (!s) return undefined;
  const normalized = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}
const str = (n: number | undefined): string => (n === undefined ? '' : String(n));
const round2 = (n: number): number => Math.round(n * 100) / 100;
export const kwhOf = (voltage: number, capacityAh: number): number => round2((voltage * capacityAh) / 1000);
const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean);

/* ---------- Formularios ---------- */

export interface BatteryForm {
  voltage: string;
  capacityAh: string;
  chemistry: Battery['chemistry'];
  removable: boolean;
  chargeMin: string;
  chargeMax: string;
  cycles: string;
  lifeMonths: string;
  brand: string;
}

export interface SpecsForm {
  rangeKm: string;
  rangeMinKm: string;
  topSpeedKmh: string;
  powerW: string;
  peakPowerW: string;
  battery: BatteryForm;
  weightKg: string;
  maxLoadKg: string;
  seats: '1' | '2' | '3';
  license: Specs['license'];
  lengthMm: string;
  widthMm: string;
  heightMm: string;
  tires: string;
  wheelInches: string;
  brakes: string;
  suspension: string;
  lighting: string;
  display: string;
  /** Uno por línea */
  drivingModes: string;
  motorType: string;
  controller: string;
  ipRating: string;
  warrantyMonths: string;
  batteryWarrantyMonths: string;
  /** Una por línea */
  features: string;
}

export interface OverrideForm {
  rangeKm: string;
  rangeMinKm: string;
  topSpeedKmh: string;
  powerW: string;
  weightKg: string;
  controller: string;
  /** La versión lleva una batería distinta de la de la ficha */
  batteryOn: boolean;
  battery: BatteryForm;
  /** Una por línea; vacío = las mismas características que la ficha */
  features: string;
}

export const batteryToForm = (b: Battery): BatteryForm => ({
  voltage: str(b.voltage),
  capacityAh: str(b.capacityAh),
  chemistry: b.chemistry,
  removable: b.removable,
  chargeMin: str(b.chargeHours[0]),
  chargeMax: str(b.chargeHours[1]),
  cycles: str(b.cycles),
  lifeMonths: str(b.lifeMonths),
  brand: b.brand ?? '',
});

export function specsToForm(s: Specs): SpecsForm {
  return {
    rangeKm: str(s.rangeKm),
    rangeMinKm: str(s.rangeMinKm),
    topSpeedKmh: str(s.topSpeedKmh),
    powerW: str(s.powerW),
    peakPowerW: str(s.peakPowerW),
    battery: batteryToForm(s.battery),
    weightKg: str(s.weightKg),
    maxLoadKg: str(s.maxLoadKg),
    seats: String(s.seats) as SpecsForm['seats'],
    license: s.license,
    lengthMm: str(s.dimensionsMm?.[0]),
    widthMm: str(s.dimensionsMm?.[1]),
    heightMm: str(s.dimensionsMm?.[2]),
    tires: s.tires ?? '',
    wheelInches: str(s.wheelInches),
    brakes: s.brakes,
    suspension: s.suspension,
    lighting: s.lighting,
    display: s.display,
    drivingModes: s.drivingModes.join('\n'),
    motorType: s.motorType,
    controller: s.controller ?? '',
    ipRating: s.ipRating ?? '',
    warrantyMonths: str(s.warrantyMonths),
    batteryWarrantyMonths: str(s.batteryWarrantyMonths),
    features: s.features.join('\n'),
  };
}

export function overrideToForm(o: SpecsOverride | undefined, base: Battery): OverrideForm {
  return {
    rangeKm: str(o?.rangeKm),
    rangeMinKm: str(o?.rangeMinKm),
    topSpeedKmh: str(o?.topSpeedKmh),
    powerW: str(o?.powerW),
    weightKg: str(o?.weightKg),
    controller: o?.controller ?? '',
    batteryOn: Boolean(o?.battery),
    battery: batteryToForm(o?.battery ?? base),
    features: (o?.features ?? []).join('\n'),
  };
}

type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Lector de campos con errores acumulados en llano */
function reader(prefix = '') {
  const errors: string[] = [];
  const label = (l: string) => `${prefix}${l}`;
  return {
    errors,
    num(raw: string, l: string, opts: { required?: boolean; int?: boolean; min?: number } = {}): number | undefined {
      const n = parseNumber(raw);
      if (n === undefined) {
        if (opts.required) errors.push(`${label(l)}: es obligatorio`);
        return undefined;
      }
      if (n === null) {
        errors.push(`${label(l)}: escribe solo un número (p. ej. 60 o 1.5)`);
        return undefined;
      }
      if (opts.int && !Number.isInteger(n)) errors.push(`${label(l)}: debe ser un número entero`);
      if (n < (opts.min ?? 0) || (opts.min === undefined && n <= 0)) errors.push(`${label(l)}: debe ser mayor que ${opts.min ?? 0}`);
      return n;
    },
    text(raw: string, l: string, required = false): string | undefined {
      const t = raw.trim();
      if (!t && required) errors.push(`${label(l)}: es obligatorio`);
      if (t.length > 200) errors.push(`${label(l)}: máximo 200 caracteres`);
      return t || undefined;
    },
  };
}

function batteryFromForm(f: BatteryForm, r: ReturnType<typeof reader>, original?: Battery): Battery | null {
  const voltage = r.num(f.voltage, SPEC_LABEL['battery.voltage'], { required: true });
  const capacityAh = r.num(f.capacityAh, SPEC_LABEL['battery.capacityAh'], { required: true });
  const chargeMin = r.num(f.chargeMin, 'Batería: horas de carga (mínimo)', { required: true });
  const chargeMax = r.num(f.chargeMax, 'Batería: horas de carga (máximo)', { required: true });
  const cycles = r.num(f.cycles, SPEC_LABEL['battery.cycles'], { int: true });
  const lifeMonths = r.num(f.lifeMonths, SPEC_LABEL['battery.lifeMonths'], { int: true });
  const brand = r.text(f.brand, SPEC_LABEL['battery.brand']);
  if (!CHEMISTRIES.includes(f.chemistry)) r.errors.push(`${SPEC_LABEL['battery.chemistry']}: elige una opción`);
  if (chargeMin !== undefined && chargeMax !== undefined && chargeMin > chargeMax) r.errors.push('Batería: las horas de carga mínimas no pueden ser más que las máximas');
  if (voltage === undefined || capacityAh === undefined || chargeMin === undefined || chargeMax === undefined) return null;
  return {
    voltage,
    capacityAh,
    // kWh = V × Ah / 1000: se calcula, no se escribe (regla de catalogRules). Si voltaje y Ah no cambian se
    // conserva el kWh guardado (puede tener más decimales): guardar sin tocar nada no debe cambiar la ficha.
    capacityKwh: original && original.voltage === voltage && original.capacityAh === capacityAh ? original.capacityKwh : kwhOf(voltage, capacityAh),
    chemistry: f.chemistry,
    removable: f.removable,
    chargeHours: [chargeMin, chargeMax],
    ...(cycles !== undefined ? { cycles } : {}),
    ...(lifeMonths !== undefined ? { lifeMonths } : {}),
    ...(brand ? { brand } : {}),
  };
}

/** Formulario → `Specs` (orden de claves estable, opcionales vacíos fuera) */
export function specsFromForm(f: SpecsForm, original?: Specs): Result<Specs> {
  const r = reader();
  const rangeKm = r.num(f.rangeKm, SPEC_LABEL.rangeKm, { required: true });
  const rangeMinKm = r.num(f.rangeMinKm, SPEC_LABEL.rangeMinKm);
  const topSpeedKmh = r.num(f.topSpeedKmh, SPEC_LABEL.topSpeedKmh, { required: true });
  const powerW = r.num(f.powerW, SPEC_LABEL.powerW, { required: true, int: true });
  const peakPowerW = r.num(f.peakPowerW, SPEC_LABEL.peakPowerW, { int: true });
  const battery = batteryFromForm(f.battery, r, original?.battery);
  const weightKg = r.num(f.weightKg, SPEC_LABEL.weightKg);
  const maxLoadKg = r.num(f.maxLoadKg, SPEC_LABEL.maxLoadKg, { required: true });
  const dims = [r.num(f.lengthMm, 'Largo (mm)', { int: true }), r.num(f.widthMm, 'Ancho (mm)', { int: true }), r.num(f.heightMm, 'Alto (mm)', { int: true })];
  const someDims = dims.some((d) => d !== undefined);
  if (someDims && dims.some((d) => d === undefined)) r.errors.push('Medidas: escribe largo, ancho y alto, o deja las tres vacías');
  const tires = r.text(f.tires, SPEC_LABEL.tires);
  const wheelInches = r.num(f.wheelInches, SPEC_LABEL.wheelInches);
  const brakes = r.text(f.brakes, SPEC_LABEL.brakes, true);
  const suspension = r.text(f.suspension, SPEC_LABEL.suspension, true);
  const lighting = r.text(f.lighting, SPEC_LABEL.lighting, true);
  const display = r.text(f.display, SPEC_LABEL.display, true);
  const motorType = r.text(f.motorType, SPEC_LABEL.motorType, true);
  const controller = r.text(f.controller, SPEC_LABEL.controller);
  const ipRating = r.text(f.ipRating, SPEC_LABEL.ipRating);
  const warrantyMonths = r.num(f.warrantyMonths, SPEC_LABEL.warrantyMonths, { required: true, int: true, min: 0 });
  const batteryWarrantyMonths = r.num(f.batteryWarrantyMonths, SPEC_LABEL.batteryWarrantyMonths, { required: true, int: true, min: 0 });
  if (!['1', '2', '3'].includes(f.seats)) r.errors.push(`${SPEC_LABEL.seats}: elige 1, 2 o 3`);
  if (!LICENSES.includes(f.license)) r.errors.push(`${SPEC_LABEL.license}: elige una opción`);
  if (rangeKm !== undefined && rangeMinKm !== undefined && rangeMinKm > rangeKm) r.errors.push('La autonomía mínima no puede ser mayor que la máxima');
  const features = lines(f.features);
  for (const l of [...features, ...lines(f.drivingModes)]) if (l.length > 200) r.errors.push(`Línea demasiado larga (máximo 200 caracteres): "${l.slice(0, 40)}…"`);
  if (r.errors.length || !battery) return { ok: false, errors: r.errors.length ? r.errors : ['Revisa los datos de la batería'] };
  return {
    ok: true,
    value: {
      rangeKm: rangeKm!,
      ...(rangeMinKm !== undefined ? { rangeMinKm } : {}),
      topSpeedKmh: topSpeedKmh!,
      powerW: powerW!,
      ...(peakPowerW !== undefined ? { peakPowerW } : {}),
      battery,
      ...(weightKg !== undefined ? { weightKg } : {}),
      maxLoadKg: maxLoadKg!,
      seats: Number(f.seats) as Specs['seats'],
      license: f.license,
      ...(someDims ? { dimensionsMm: dims as [number, number, number] } : {}),
      ...(tires ? { tires } : {}),
      ...(wheelInches !== undefined ? { wheelInches } : {}),
      brakes: brakes!,
      suspension: suspension!,
      lighting: lighting!,
      display: display!,
      drivingModes: lines(f.drivingModes),
      motorType: motorType!,
      ...(controller ? { controller } : {}),
      ...(ipRating ? { ipRating } : {}),
      warrantyMonths: warrantyMonths!,
      batteryWarrantyMonths: batteryWarrantyMonths!,
      features,
    },
  };
}

/** Formulario de una versión → `specsOverride` (solo lo que cambia; nada = null, sin cambios respecto a la ficha) */
export function overrideFromForm(f: OverrideForm, versionName: string, original?: SpecsOverride): Result<SpecsOverride | null> {
  const r = reader(`${versionName} · `);
  const rangeKm = r.num(f.rangeKm, SPEC_LABEL.rangeKm);
  const rangeMinKm = r.num(f.rangeMinKm, SPEC_LABEL.rangeMinKm);
  const topSpeedKmh = r.num(f.topSpeedKmh, SPEC_LABEL.topSpeedKmh);
  const powerW = r.num(f.powerW, SPEC_LABEL.powerW, { int: true });
  const weightKg = r.num(f.weightKg, SPEC_LABEL.weightKg);
  const controller = r.text(f.controller, SPEC_LABEL.controller);
  const battery = f.batteryOn ? batteryFromForm(f.battery, r, original?.battery) : undefined;
  const features = lines(f.features);
  if (r.errors.length) return { ok: false, errors: r.errors };
  const o: SpecsOverride = {
    ...(rangeKm !== undefined ? { rangeKm } : {}),
    ...(rangeMinKm !== undefined ? { rangeMinKm } : {}),
    ...(topSpeedKmh !== undefined ? { topSpeedKmh } : {}),
    ...(powerW !== undefined ? { powerW } : {}),
    ...(battery ? { battery } : {}),
    ...(weightKg !== undefined ? { weightKg } : {}),
    ...(controller ? { controller } : {}),
    ...(features.length ? { features } : {}),
  };
  return { ok: true, value: Object.keys(o).length ? o : null };
}

/* ---------- Qué cambió (historial) ---------- */

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Nombres legibles de lo que cambia entre dos especificaciones (completas o de una versión) */
export function specsChanges(before: Partial<Specs> | undefined, after: Partial<Specs> | undefined): string[] {
  const a = before ?? {};
  const b = after ?? {};
  const out: string[] = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Specs>;
  for (const k of Object.keys(SPEC_LABEL) as (keyof typeof SPEC_LABEL)[]) {
    if (k.startsWith('battery.')) continue;
    if (!keys.has(k as keyof Specs)) continue;
    if (!same(a[k as keyof Specs], b[k as keyof Specs])) out.push(SPEC_LABEL[k as Exclude<keyof Specs, 'battery'>].replace(/ \(.*\)$/, '').toLowerCase());
  }
  if (keys.has('battery') && !same(a.battery, b.battery)) {
    const ba = (a.battery ?? {}) as Partial<Battery>;
    const bb = (b.battery ?? {}) as Partial<Battery>;
    const sub = (Object.keys({ ...ba, ...bb }) as (keyof Battery)[]).filter((k) => !same(ba[k], bb[k]));
    out.push(sub.length && a.battery && b.battery ? sub.map((k) => SPEC_LABEL[`battery.${k}`].replace(/ \(.*\)$/, '').toLowerCase()).join(', ') : 'batería');
  }
  return out;
}

/* ---------- Repuestos: lista libre nombre/valor ---------- */

export const MAX_PART_SPECS = 30;
export const MAX_PART_SPEC_LABEL = 60;
export const MAX_PART_SPEC_VALUE = 120;

/** Reglas de la lista de especificaciones de un repuesto (las aplica partRules en panel y servidor) */
export function partSpecsErrors(specs: Part['specs']): string[] {
  if (specs === undefined) return [];
  const errs: string[] = [];
  if (specs.length > MAX_PART_SPECS) errs.push(`Como máximo ${MAX_PART_SPECS} especificaciones`);
  const seen = new Set<string>();
  specs.forEach((s, i) => {
    const n = i + 1;
    if (!s.label.trim()) errs.push(`Especificación ${n}: falta el nombre`);
    if (!s.value.trim()) errs.push(`Especificación ${n}: falta el valor`);
    if (s.label !== s.label.trim() || s.value !== s.value.trim()) errs.push(`Especificación ${n}: sin espacios al principio o al final`);
    if (s.label.length > MAX_PART_SPEC_LABEL) errs.push(`Especificación ${n}: el nombre tiene más de ${MAX_PART_SPEC_LABEL} caracteres`);
    if (s.value.length > MAX_PART_SPEC_VALUE) errs.push(`Especificación ${n}: el valor tiene más de ${MAX_PART_SPEC_VALUE} caracteres`);
    const key = s.label.trim().toLowerCase();
    if (key && seen.has(key)) errs.push(`Especificación repetida: ${s.label.trim()}`);
    seen.add(key);
  });
  return errs;
}

/** Filas del formulario → lista limpia (las filas totalmente vacías se ignoran) */
export const cleanPartSpecs = (rows: PartSpec[]): PartSpec[] => rows.map((r) => ({ label: r.label.trim(), value: r.value.trim() })).filter((r) => r.label || r.value);

export function partSpecsChanges(before: Part['specs'], after: Part['specs']): string[] {
  return same(before ?? [], after ?? []) ? [] : ['especificaciones'];
}
