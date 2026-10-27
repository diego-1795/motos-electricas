import { useId, useState } from 'preact/hooks';
import type { AdminKind } from '../../domain/admin';
import type { Part, Product } from '../../domain/types';
import { isValidSlug } from '../../domain/catalogRules';
import { kindLabel, useAdmin } from './context';
import Modal from './Modal';

interface Props {
  kind: AdminKind;
  onClose: () => void;
  /** Abre el editor con la ficha duplicada */
  onContinue: (draft: Product | Part) => void;
}

/** "Nuevo producto / repuesto": elegir una ficha como plantilla y darle slug y nombre nuevos. */
export default function DuplicateDialog({ kind, onClose, onContinue }: Props) {
  const { catalog } = useAdmin();
  const uid = useId();
  const list = kind === 'products' ? catalog.products : catalog.repuestos;
  const [template, setTemplate] = useState(list[0]?.data.slug ?? '');
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const taken = new Set([...catalog.products, ...catalog.repuestos].map((e) => e.data.slug));

  const submit = (e: Event) => {
    e.preventDefault();
    const src = list.find((x) => x.data.slug === template);
    if (!src) return setError('Elige una ficha como plantilla');
    const s = slug.trim();
    if (!isValidSlug(s)) return setError('El slug debe ir en minúsculas, números y guiones (p. ej. storm-x2)');
    if (taken.has(s)) return setError(`Ya existe una ficha con el slug "${s}"`);
    if (!name.trim()) return setError('Escribe el nombre');
    const copy = JSON.parse(JSON.stringify(src.data)) as Product | Part;
    const prefix = src.data.id.split('-')[0] || (kind === 'products' ? 'rd' : 'rp');
    const draft = { ...copy, id: `${prefix}-${s}`, slug: s, name: name.trim() } as Product | Part;
    if ('isHero' in draft) delete (draft as Product).isHero;
    onContinue(draft);
  };

  return (
    <Modal title={kind === 'products' ? 'Nuevo producto' : 'Nuevo repuesto'} onClose={onClose}>
      <form class="adm-form" onSubmit={submit} data-admin-duplicate noValidate>
        <p class="muted">
          Se crea copiando una ficha existente; después podrás revisar todos los datos antes de guardar.
        </p>
        <label class="field">
          <span class="label">Plantilla (ficha parecida)</span>
          <select class="select" value={template} onChange={(e) => setTemplate((e.target as HTMLSelectElement).value)}>
            {list.map((e) => (
              <option key={e.data.slug} value={e.data.slug}>
                {e.data.name} ({e.data.slug})
              </option>
            ))}
          </select>
        </label>
        <label class="field">
          <span class="label">Slug nuevo</span>
          <input
            class="input"
            value={slug}
            onInput={(e) => {
              setSlug((e.target as HTMLInputElement).value);
              setError(null);
            }}
            placeholder="storm-x2"
            autoComplete="off"
            aria-describedby={`${uid}-hint`}
            required
          />
          <span id={`${uid}-hint`} class="hint">
            Minúsculas, números y guiones. Será la URL: {kind === 'products' ? '/bicimotos/<slug>' : '/repuestos/<slug>'}.
          </span>
        </label>
        <label class="field">
          <span class="label">Nombre</span>
          <input
            class="input"
            value={name}
            onInput={(e) => {
              setName((e.target as HTMLInputElement).value);
              setError(null);
            }}
            required
          />
        </label>
        {error && (
          <p class="adm-error" role="alert">
            {error}
          </p>
        )}
        <div class="adm-form__actions">
          <button type="button" class="btn btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" class="btn btn--primary">
            Continuar al editor
          </button>
        </div>
        <p class="hint">Nuevo {kindLabel[kind].singular}: el servidor validará la ficha completa al guardar.</p>
      </form>
    </Modal>
  );
}
