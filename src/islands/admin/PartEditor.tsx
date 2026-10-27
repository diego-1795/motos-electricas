import { useEffect, useId, useRef, useState } from 'preact/hooks';
import type { CatalogEntry } from '../../domain/admin';
import type { Availability, Part, PartKind } from '../../domain/types';
import { parseSoles } from '../../domain/money';
import { availabilityLabel } from '../../domain/product';
import { partRules } from '../../domain/catalogRules';
import { partKindSingular } from '../../lib/labels';
import { AdminApiError } from '../../services/admin/AdminApiClient';
import { centsToInput, STALE_EDITOR_MESSAGE, useAdmin } from './context';
import Modal from './Modal';

interface Props {
  entry?: CatalogEntry<Part>;
  draft?: Part;
  onClose: () => void;
}

interface Form {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: string;
  availability: Availability;
  kind: PartKind;
  unit: 'UND' | 'PAR';
  code: string;
  compatibleWith: string[];
  hidden: boolean;
  advanced: string;
}

const MAIN_KEYS = new Set(['id', 'slug', 'name', 'description', 'price', 'availability', 'kind', 'unit', 'code', 'compatibleWith', 'hidden']);
const KINDS = Object.keys(partKindSingular) as PartKind[];
const AVAILABILITIES: Availability[] = ['en-stock', 'bajo-pedido', 'proximamente', 'agotado'];

function toForm(p: Part): Form {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (!MAIN_KEYS.has(k)) rest[k] = v;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    price: centsToInput(p.price.amount),
    availability: p.availability,
    kind: p.kind,
    unit: p.unit,
    code: p.code ?? '',
    compatibleWith: [...p.compatibleWith],
    hidden: p.hidden === true,
    advanced: JSON.stringify(rest, null, 2),
  };
}

function fromForm(f: Form): { part: Part } | { errors: string[] } {
  const errors: string[] = [];
  let adv: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(f.advanced || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('debe ser un objeto {…}');
    adv = parsed as Record<string, unknown>;
  } catch (e) {
    return { errors: [`JSON avanzado no válido: ${(e as Error).message}`] };
  }
  for (const k of Object.keys(adv)) if (MAIN_KEYS.has(k)) errors.push(`JSON avanzado: el campo "${k}" se edita en el formulario, quítalo del JSON`);
  const cents = parseSoles(f.price);
  if (cents === null) errors.push(`precio no válido ("${f.price}")`);
  if (!f.name.trim()) errors.push('name es obligatorio');
  if (!f.description.trim()) errors.push('description es obligatorio');
  if (errors.length) return { errors };

  const out: Record<string, unknown> = {
    id: f.id.trim(),
    slug: f.slug.trim(),
    name: f.name.trim(),
    description: f.description.trim(),
    price: { amount: cents, currency: 'PEN' },
  };
  // Solo claves propias (Object.hasOwn), nunca `in`: ver ProductEditor.fromForm
  if (Object.hasOwn(adv, 'image')) out.image = adv.image;
  out.availability = f.availability;
  out.kind = f.kind;
  out.unit = f.unit;
  if (f.code.trim()) out.code = f.code.trim();
  out.compatibleWith = f.compatibleWith;
  for (const [k, v] of Object.entries(adv)) if (k !== '__proto__' && !Object.hasOwn(out, k)) out[k] = v;
  if (f.hidden) out.hidden = true;
  return { part: out as unknown as Part };
}

/** Editor de ficha de repuesto (solo admin). */
export default function PartEditor({ entry, draft, onClose }: Props) {
  const { api, catalog, applyWrite, handleError } = useAdmin();
  const creating = !entry;
  const source = entry?.data ?? draft;
  if (!source) return null;
  const [form, setForm] = useState<Form>(() => toForm(source));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // Tras un 409 este formulario parte de una versión antigua: se bloquea hasta reabrir (ver ProductEditor)
  const [stale, setStale] = useState(false);
  const uid = useId();
  const errorsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errors.length) errorsRef.current?.focus();
  }, [errors]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleCompat = (slug: string, on: boolean) =>
    setForm((f) => ({ ...f, compatibleWith: on ? [...new Set([...f.compatibleWith, slug])] : f.compatibleWith.filter((s) => s !== slug) }));

  const submit = async (e: Event) => {
    e.preventDefault();
    if (saving || stale) return;
    const built = fromForm(form);
    if ('errors' in built) return setErrors(built.errors);
    const ruleErrors = partRules(built.part, { productSlugs: catalog.products.map((p) => p.data.slug) });
    if (ruleErrors.length) return setErrors(ruleErrors);
    setSaving(true);
    setErrors([]);
    try {
      const result = await api.put('repuestos', built.part.slug, {
        ...(entry ? { sha: entry.sha } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        data: built.part,
      });
      applyWrite('repuestos', result);
      onClose();
    } catch (err) {
      const msg = handleError(err);
      if (err instanceof AdminApiError && err.status === 409) {
        setStale(true);
        setErrors([msg, STALE_EDITOR_MESSAGE]);
      } else {
        setErrors(err instanceof AdminApiError && err.details.length ? [err.message, ...err.details] : [msg]);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={creating ? `Nuevo repuesto: ${form.name}` : `Editar ficha: ${source.name}`} onClose={onClose} wide>
      <form class="adm-form" onSubmit={submit} data-admin-editor="part" noValidate>
        <div class="adm-form__grid">
          <label class="field">
            <span class="label">Slug (URL)</span>
            <input class="input" value={form.slug} readOnly aria-describedby={`${uid}-slug`} />
            <span id={`${uid}-slug`} class="hint">
              /repuestos/{form.slug}
            </span>
          </label>
          <label class="field">
            <span class="label">Id</span>
            <input class="input" value={form.id} onInput={(e) => set('id', (e.target as HTMLInputElement).value)} required />
          </label>
          <label class="field">
            <span class="label">Nombre</span>
            <input class="input" value={form.name} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} required />
          </label>
          <label class="field">
            <span class="label">Código</span>
            <input class="input" value={form.code} onInput={(e) => set('code', (e.target as HTMLInputElement).value)} placeholder="RP-027" />
          </label>
          <label class="field">
            <span class="label">Precio (soles)</span>
            <input class="input" inputMode="decimal" value={form.price} onInput={(e) => set('price', (e.target as HTMLInputElement).value)} required />
          </label>
          <label class="field">
            <span class="label">Disponibilidad</span>
            <select class="select" value={form.availability} onChange={(e) => set('availability', (e.target as HTMLSelectElement).value as Availability)}>
              {AVAILABILITIES.map((a) => (
                <option key={a} value={a}>
                  {availabilityLabel[a]}
                </option>
              ))}
            </select>
          </label>
          <label class="field">
            <span class="label">Tipo</span>
            <select class="select" value={form.kind} onChange={(e) => set('kind', (e.target as HTMLSelectElement).value as PartKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {partKindSingular[k]} ({k})
                </option>
              ))}
            </select>
          </label>
          <label class="field">
            <span class="label">Unidad de venta</span>
            <select class="select" value={form.unit} onChange={(e) => set('unit', (e.target as HTMLSelectElement).value as 'UND' | 'PAR')}>
              <option value="UND">Unidad (UND)</option>
              <option value="PAR">Par (PAR)</option>
            </select>
          </label>
          <label class="field adm-form__full">
            <span class="label">Descripción</span>
            <textarea class="textarea" value={form.description} onInput={(e) => set('description', (e.target as HTMLTextAreaElement).value)} />
          </label>
        </div>

        <fieldset class="adm-fieldset adm-checks">
          <legend class="label">Compatible con (vacío = universal)</legend>
          {catalog.products.map((p) => (
            <label class="adm-check" key={p.data.slug}>
              <input type="checkbox" checked={form.compatibleWith.includes(p.data.slug)} onChange={(e) => toggleCompat(p.data.slug, (e.target as HTMLInputElement).checked)} />{' '}
              {p.data.name} <code class="adm-slug">{p.data.slug}</code>
            </label>
          ))}
        </fieldset>

        <fieldset class="adm-fieldset adm-checks">
          <legend class="label">Opciones</legend>
          <label class="adm-check">
            <input type="checkbox" checked={form.hidden} onChange={(e) => set('hidden', (e.target as HTMLInputElement).checked)} /> Oculto (no aparece en la web)
          </label>
        </fieldset>

        <label class="field">
          <span class="label">JSON avanzado</span>
          <span class="hint">image y cualquier otro campo que no esté en el formulario. Se fusiona al guardar.</span>
          <textarea class="textarea adm-json" spellcheck={false} value={form.advanced} onInput={(e) => set('advanced', (e.target as HTMLTextAreaElement).value)} />
        </label>

        <label class="field">
          <span class="label">Motivo (opcional)</span>
          <input class="input" maxLength={120} value={reason} onInput={(e) => setReason((e.target as HTMLInputElement).value)} placeholder="Queda en el historial de cambios" />
        </label>

        {errors.length > 0 && (
          <div class="adm-errors" role="alert" tabIndex={-1} ref={errorsRef}>
            <strong>No se ha guardado:</strong>
            <ul>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div class="adm-form__actions">
          <button type="button" class="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" class="btn btn--primary" disabled={saving} aria-disabled={stale || undefined}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
