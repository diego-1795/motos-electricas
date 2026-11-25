import { useEffect, useId, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { Part, PartSpec, Product } from '../../domain/types';
import {
  CHEMISTRIES,
  CHEMISTRY_LABEL,
  LICENSES,
  LICENSE_LABEL,
  MAX_PART_SPECS,
  MAX_PART_SPEC_LABEL,
  MAX_PART_SPEC_VALUE,
  SPEC_LABEL,
  cleanPartSpecs,
  kwhOf,
  overrideFromForm,
  overrideToForm,
  parseNumber,
  partSpecsErrors,
  specsFromForm,
  specsToForm,
  type BatteryForm,
  type OverrideForm,
  type SpecsForm,
  type SpecsOverride,
} from '../../domain/specsEdit';
import { AdminApiError } from '../../services/admin/AdminApiClient';
import { STALE_EDITOR_MESSAGE, useAdmin } from './context';
import Modal from './Modal';

/**
 * Especificaciones de una moto o de un repuesto (ADR-032). Admin y gestor. Solo envía especificaciones
 * (PATCH { sha, specs, variantSpecs }): el servidor valida la ficha resultante con el mismo esquema y reglas
 * que una ficha completa.
 */
interface Props {
  kind: 'products' | 'repuestos';
  slug: string;
  onClose: () => void;
}

export default function SpecsDialog({ kind, slug, onClose }: Props) {
  const { catalog } = useAdmin();
  const entry = kind === 'products' ? catalog.products.find((e) => e.data.slug === slug) : catalog.repuestos.find((e) => e.data.slug === slug);
  if (!entry) return null;
  return kind === 'products' ? <ProductSpecs product={entry.data as Product} onClose={onClose} /> : <PartSpecs part={entry.data as Part} onClose={onClose} />;
}

/* ---------- Guardado común ---------- */

function useSave(kind: 'products' | 'repuestos', slug: string, onClose: () => void) {
  const { api, applyWrite, handleError, latestSha, notify } = useAdmin();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const errorsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (errors.length) errorsRef.current?.focus();
  }, [errors]);

  const save = async (body: Record<string, unknown>) => {
    if (saving || stale) return;
    const sha = latestSha(kind, slug);
    if (!sha) return setErrors(['La ficha ya no está en el catálogo; recarga la página']);
    setSaving(true);
    setErrors([]);
    try {
      const result = kind === 'products' ? await api.patch('products', slug, { sha, ...body }) : await api.patch('repuestos', slug, { sha, ...body });
      if (!result.commit) notify('Sin cambios: las especificaciones ya eran esas');
      applyWrite(kind, result);
      onClose();
    } catch (err) {
      const msg = handleError(err);
      if (err instanceof AdminApiError && err.status === 409) {
        setStale(true);
        setErrors([msg, STALE_EDITOR_MESSAGE]);
      } else setErrors(err instanceof AdminApiError && err.details.length ? [err.message, ...err.details] : [msg]);
    } finally {
      setSaving(false);
    }
  };

  const errorBox =
    errors.length > 0 ? (
      <div class="adm-errors" role="alert" tabIndex={-1} ref={errorsRef} data-admin-specs-errors>
        <strong>No se ha guardado:</strong>
        <ul>
          {errors.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      </div>
    ) : null;

  const actions = (submitLabel = 'Guardar especificaciones') => (
    <div class="adm-form__actions">
      <button type="button" class="btn btn--ghost" onClick={onClose} disabled={saving}>
        Cancelar
      </button>
      <button type="submit" class="btn btn--primary" disabled={saving} aria-disabled={stale || undefined} data-admin-specs-save>
        {saving ? 'Guardando…' : submitLabel}
      </button>
    </div>
  );

  return { save, setErrors, errorBox, actions };
}

/* ---------- Campos ---------- */

type FieldProps = { label: string; value: string; onInput: (v: string) => void; hint?: string; required?: boolean; inputMode?: 'decimal' | 'numeric' | 'text'; wide?: boolean; testId?: string };

function Field({ label, value, onInput, hint, required, inputMode = 'decimal', wide, testId }: FieldProps) {
  const id = useId();
  return (
    <label class={`field${wide ? ' adm-form__full' : ''}`} for={id}>
      <span class="label">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </span>
      <input id={id} class="input" value={value} onInput={(e) => onInput((e.target as HTMLInputElement).value)} inputMode={inputMode} required={required} aria-describedby={hint ? `${id}-h` : undefined} data-spec={testId} />
      {hint && (
        <span class="hint" id={`${id}-h`}>
          {hint}
        </span>
      )}
    </label>
  );
}

function Lines({ label, value, onInput, hint, testId }: { label: string; value: string; onInput: (v: string) => void; hint: string; testId?: string }) {
  const id = useId();
  return (
    <label class="field adm-form__full" for={id}>
      <span class="label">{label}</span>
      <textarea id={id} class="textarea adm-textarea--short" value={value} onInput={(e) => onInput((e.target as HTMLTextAreaElement).value)} aria-describedby={`${id}-h`} data-spec={testId} />
      <span class="hint" id={`${id}-h`}>
        {hint}
      </span>
    </label>
  );
}

function BatteryFields({ value, onChange, prefix }: { value: BatteryForm; onChange: (b: BatteryForm) => void; prefix: string }) {
  const set = <K extends keyof BatteryForm>(k: K, v: BatteryForm[K]) => onChange({ ...value, [k]: v });
  const v = parseNumber(value.voltage);
  const ah = parseNumber(value.capacityAh);
  const kwh = typeof v === 'number' && typeof ah === 'number' ? kwhOf(v, ah) : null;
  const chemId = useId();
  return (
    <div class="adm-form__grid">
      <Field label="Voltaje (V)" value={value.voltage} onInput={(x) => set('voltage', x)} required testId={`${prefix}battery.voltage`} />
      <Field label="Capacidad (Ah)" value={value.capacityAh} onInput={(x) => set('capacityAh', x)} required testId={`${prefix}battery.capacityAh`} />
      <p class="hint adm-form__full" data-spec-kwh={prefix}>
        Capacidad en kWh: <strong>{kwh === null ? '—' : kwh}</strong> (se calcula sola: voltaje × Ah ÷ 1000)
      </p>
      <label class="field" for={chemId}>
        <span class="label">Tipo de batería *</span>
        <select id={chemId} class="select" value={value.chemistry} onChange={(e) => set('chemistry', (e.target as HTMLSelectElement).value as BatteryForm['chemistry'])}>
          {CHEMISTRIES.map((c) => (
            <option key={c} value={c}>
              {CHEMISTRY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <label class="adm-check">
        <input type="checkbox" checked={value.removable} onChange={(e) => set('removable', (e.target as HTMLInputElement).checked)} /> Batería extraíble
      </label>
      <Field label="Carga: horas mínimas" value={value.chargeMin} onInput={(x) => set('chargeMin', x)} required />
      <Field label="Carga: horas máximas" value={value.chargeMax} onInput={(x) => set('chargeMax', x)} required />
      <Field label="Ciclos de vida" value={value.cycles} onInput={(x) => set('cycles', x)} inputMode="numeric" />
      <Field label="Vida útil (meses)" value={value.lifeMonths} onInput={(x) => set('lifeMonths', x)} inputMode="numeric" />
      <Field label="Marca de la batería" value={value.brand} onInput={(x) => set('brand', x)} inputMode="text" />
    </div>
  );
}

/* ---------- Moto (Product) ---------- */

function ProductSpecs({ product, onClose }: { product: Product; onClose: () => void }) {
  const [form, setForm] = useState<SpecsForm>(() => specsToForm(product.specs));
  const [overrides, setOverrides] = useState<Record<string, OverrideForm>>(() => Object.fromEntries(product.variants.map((v) => [v.id, overrideToForm(v.specsOverride, product.specs.battery)])));
  const { save, setErrors, errorBox, actions } = useSave('products', product.slug, onClose);
  const set = <K extends keyof SpecsForm>(k: K, v: SpecsForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setO = (id: string, patch: Partial<OverrideForm>) => setOverrides((o) => ({ ...o, [id]: { ...o[id]!, ...patch } }));
  const multi = product.variants.length > 1;
  const seatsId = useId();
  const licId = useId();

  const submit = (e: Event) => {
    e.preventDefault();
    const base = specsFromForm(form, product.specs);
    const errs: string[] = base.ok ? [] : base.errors;
    const variantSpecs: Record<string, SpecsOverride | null> = {};
    for (const v of product.variants) {
      const r = overrideFromForm(overrides[v.id]!, v.name, v.specsOverride);
      if (r.ok) variantSpecs[v.id] = r.value;
      else errs.push(...r.errors);
    }
    if (errs.length || !base.ok) return setErrors(errs);
    void save({ specs: base.value, variantSpecs });
  };

  const section = (title: string, children: JSX.Element | JSX.Element[], key?: string) => (
    <fieldset class="adm-fieldset" key={key} data-spec-section={title}>
      <legend class="label">{title}</legend>
      {children}
    </fieldset>
  );

  return (
    <Modal title={`Especificaciones: ${product.name}`} onClose={onClose} wide>
      <form class="adm-form" onSubmit={submit} noValidate data-admin-specs="products">
        <p class="hint">
          Lo que aparece en la pestaña <strong>Especificaciones</strong> y en el comparador. Los campos con * son obligatorios.
          {multi && ' Más abajo, cada versión puede cambiar algunos datos (si los dejas vacíos, usa los de la ficha).'}
        </p>
        {section(
          'Rendimiento',
          <div class="adm-form__grid">
            <Field label={SPEC_LABEL.rangeKm} value={form.rangeKm} onInput={(v) => set('rangeKm', v)} required testId="rangeKm" />
            <Field label={SPEC_LABEL.rangeMinKm} value={form.rangeMinKm} onInput={(v) => set('rangeMinKm', v)} hint="Si el fabricante da un rango (p. ej. 50–60 km)" testId="rangeMinKm" />
            <Field label={SPEC_LABEL.topSpeedKmh} value={form.topSpeedKmh} onInput={(v) => set('topSpeedKmh', v)} required testId="topSpeedKmh" />
            <Field label={SPEC_LABEL.powerW} value={form.powerW} onInput={(v) => set('powerW', v)} required inputMode="numeric" testId="powerW" />
            <Field label={SPEC_LABEL.peakPowerW} value={form.peakPowerW} onInput={(v) => set('peakPowerW', v)} inputMode="numeric" />
          </div>,
        )}
        {section('Batería', <BatteryFields value={form.battery} onChange={(b) => set('battery', b)} prefix="" />)}
        {section(
          'Medidas y capacidad',
          <div class="adm-form__grid">
            <Field label={SPEC_LABEL.weightKg} value={form.weightKg} onInput={(v) => set('weightKg', v)} hint="Con batería" />
            <Field label={SPEC_LABEL.maxLoadKg} value={form.maxLoadKg} onInput={(v) => set('maxLoadKg', v)} required />
            <label class="field" for={seatsId}>
              <span class="label">Plazas *</span>
              <select id={seatsId} class="select" value={form.seats} onChange={(e) => set('seats', (e.target as HTMLSelectElement).value as SpecsForm['seats'])}>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </label>
            <Field label="Largo (mm)" value={form.lengthMm} onInput={(v) => set('lengthMm', v)} inputMode="numeric" />
            <Field label="Ancho (mm)" value={form.widthMm} onInput={(v) => set('widthMm', v)} inputMode="numeric" />
            <Field label="Alto (mm)" value={form.heightMm} onInput={(v) => set('heightMm', v)} inputMode="numeric" />
            <Field label={SPEC_LABEL.tires} value={form.tires} onInput={(v) => set('tires', v)} inputMode="text" hint='Medida, p. ej. 14 x 2.5"' />
            <Field label={SPEC_LABEL.wheelInches} value={form.wheelInches} onInput={(v) => set('wheelInches', v)} />
          </div>,
        )}
        {section(
          'Equipamiento',
          <div class="adm-form__grid">
            <Field label={SPEC_LABEL.motorType} value={form.motorType} onInput={(v) => set('motorType', v)} required inputMode="text" />
            <Field label={SPEC_LABEL.controller} value={form.controller} onInput={(v) => set('controller', v)} inputMode="text" />
            <Field label={SPEC_LABEL.brakes} value={form.brakes} onInput={(v) => set('brakes', v)} required inputMode="text" />
            <Field label={SPEC_LABEL.suspension} value={form.suspension} onInput={(v) => set('suspension', v)} required inputMode="text" />
            <Field label={SPEC_LABEL.lighting} value={form.lighting} onInput={(v) => set('lighting', v)} required inputMode="text" />
            <Field label={SPEC_LABEL.display} value={form.display} onInput={(v) => set('display', v)} required inputMode="text" />
            <Field label={SPEC_LABEL.ipRating} value={form.ipRating} onInput={(v) => set('ipRating', v)} inputMode="text" hint="p. ej. IP54" />
            <Lines label={SPEC_LABEL.drivingModes} value={form.drivingModes} onInput={(v) => set('drivingModes', v)} hint="Uno por línea (p. ej. Eco, Normal, Sport)" />
          </div>,
        )}
        {section(
          'Licencia y garantía',
          <div class="adm-form__grid">
            <label class="field" for={licId}>
              <span class="label">Licencia *</span>
              <select id={licId} class="select" value={form.license} onChange={(e) => set('license', (e.target as HTMLSelectElement).value as SpecsForm['license'])}>
                {LICENSES.map((l) => (
                  <option key={l} value={l}>
                    {LICENSE_LABEL[l]}
                  </option>
                ))}
              </select>
            </label>
            <Field label={SPEC_LABEL.warrantyMonths} value={form.warrantyMonths} onInput={(v) => set('warrantyMonths', v)} required inputMode="numeric" />
            <Field label={SPEC_LABEL.batteryWarrantyMonths} value={form.batteryWarrantyMonths} onInput={(v) => set('batteryWarrantyMonths', v)} required inputMode="numeric" />
          </div>,
        )}
        {section(
          'Características',
          <Lines label="Lista de características" value={form.features} onInput={(v) => set('features', v)} hint="Una por línea, tal como quieras que se lean en la ficha." testId="features" />,
        )}

        {multi &&
          product.variants.map((v) => {
            const o = overrides[v.id]!;
            return section(
              `Versión ${v.name}: lo que cambia`,
              <>
                <p class="hint">Deja vacío lo que sea igual que en la ficha.</p>
                <div class="adm-form__grid">
                  <Field label={SPEC_LABEL.rangeKm} value={o.rangeKm} onInput={(x) => setO(v.id, { rangeKm: x })} testId={`${v.id}.rangeKm`} />
                  <Field label={SPEC_LABEL.rangeMinKm} value={o.rangeMinKm} onInput={(x) => setO(v.id, { rangeMinKm: x })} />
                  <Field label={SPEC_LABEL.topSpeedKmh} value={o.topSpeedKmh} onInput={(x) => setO(v.id, { topSpeedKmh: x })} />
                  <Field label={SPEC_LABEL.powerW} value={o.powerW} onInput={(x) => setO(v.id, { powerW: x })} inputMode="numeric" />
                  <Field label={SPEC_LABEL.weightKg} value={o.weightKg} onInput={(x) => setO(v.id, { weightKg: x })} />
                  <Field label={SPEC_LABEL.controller} value={o.controller} onInput={(x) => setO(v.id, { controller: x })} inputMode="text" />
                </div>
                <label class="adm-check">
                  <input type="checkbox" checked={o.batteryOn} onChange={(e) => setO(v.id, { batteryOn: (e.target as HTMLInputElement).checked })} data-spec={`${v.id}.batteryOn`} /> Esta versión lleva otra batería
                </label>
                {o.batteryOn && <BatteryFields value={o.battery} onChange={(b) => setO(v.id, { battery: b })} prefix={`${v.id}.`} />}
                <Lines
                  label="Características de esta versión"
                  value={o.features}
                  onInput={(x) => setO(v.id, { features: x })}
                  hint="Lista completa para esta versión, una por línea. Vacío = las mismas que la ficha."
                  testId={`${v.id}.features`}
                />
              </>,
              v.id,
            );
          })}

        {errorBox}
        {actions()}
      </form>
    </Modal>
  );
}

/* ---------- Repuesto (Part): lista libre nombre/valor ---------- */

function PartSpecs({ part, onClose }: { part: Part; onClose: () => void }) {
  const [rows, setRows] = useState<PartSpec[]>(() => (part.specs?.length ? part.specs.map((s) => ({ ...s })) : [{ label: '', value: '' }]));
  const { save, setErrors, errorBox, actions } = useSave('repuestos', part.slug, onClose);
  const setRow = (i: number, patch: Partial<PartSpec>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) =>
    setRows((r) => {
      const j = i + d;
      if (j < 0 || j >= r.length) return r;
      const next = [...r];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const submit = (e: Event) => {
    e.preventDefault();
    const specs = cleanPartSpecs(rows);
    const errs = partSpecsErrors(specs);
    if (errs.length) return setErrors(errs);
    void save({ specs });
  };

  return (
    <Modal title={`Especificaciones: ${part.name}`} onClose={onClose} wide>
      <form class="adm-form" onSubmit={submit} noValidate data-admin-specs="repuestos">
        <p class="hint">Se muestran como tabla en la página del repuesto, en este orden. Por ejemplo: Voltaje → 48 V; Capacidad → 12 Ah; Peso → 3,5 kg. Las filas vacías se ignoran.</p>
        <ol class="adm-partspecs" role="list">
          {rows.map((r, i) => (
            <li key={i} class="adm-partspecs__row" data-part-spec-row={i}>
              <label class="field">
                <span class="label">Nombre {i + 1}</span>
                <input class="input" value={r.label} maxLength={MAX_PART_SPEC_LABEL} onInput={(e) => setRow(i, { label: (e.target as HTMLInputElement).value })} placeholder="p. ej. Voltaje" data-part-spec-label={i} />
              </label>
              <label class="field">
                <span class="label">Valor {i + 1}</span>
                <input class="input" value={r.value} maxLength={MAX_PART_SPEC_VALUE} onInput={(e) => setRow(i, { value: (e.target as HTMLInputElement).value })} placeholder="p. ej. 48 V" data-part-spec-value={i} />
              </label>
              <div class="adm-partspecs__actions">
                <button type="button" class="btn btn--ghost btn--sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir la especificación ${i + 1}`}>
                  ↑
                </button>
                <button type="button" class="btn btn--ghost btn--sm" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Bajar la especificación ${i + 1}`}>
                  ↓
                </button>
                <button type="button" class="btn btn--ghost btn--sm adm-btn-danger" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label={`Quitar la especificación ${i + 1}`}>
                  Quitar
                </button>
              </div>
            </li>
          ))}
        </ol>
        <div>
          <button type="button" class="btn btn--secondary btn--sm" onClick={() => setRows((x) => [...x, { label: '', value: '' }])} disabled={rows.length >= MAX_PART_SPECS} data-part-spec-add>
            Añadir especificación
          </button>
        </div>
        {errorBox}
        {actions()}
      </form>
    </Modal>
  );
}
