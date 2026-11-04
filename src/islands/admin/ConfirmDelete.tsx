import { useState } from 'preact/hooks';
import type { DeleteResult } from '../../domain/admin';
import { AdminApiError } from '../../services/admin/AdminApiClient';
import { kindLabel, useAdmin, type AdminTab } from './context';
import Modal from './Modal';

/** Lo mínimo que hay que saber de lo que se borra (ficha del catálogo o artículo del blog) */
export interface DeleteTarget {
  slug: string;
  name: string;
  sha: string;
  path: string;
}

interface Props {
  kind: AdminTab;
  entry: DeleteTarget;
  onClose: () => void;
  /** Blog: el panel del blog recarga su lista y anuncia el commit. Catálogo: lo hace applyDelete. */
  onDeleted?: (result: DeleteResult) => void;
}

const singular: Record<AdminTab, string> = { products: kindLabel.products.singular, repuestos: kindLabel.repuestos.singular, blog: 'artículo' };

/** Borrado (solo admin): escribir el slug para confirmar + motivo opcional. Sirve para catálogo (ADR-018) y blog (ADR-023). */
export default function ConfirmDelete({ kind, entry, onClose, onDeleted }: Props) {
  const { api, applyDelete, handleError, reload } = useAdmin();
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const slug = entry.slug;
  const match = typed.trim() === slug;

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!match) return;
    setBusy(true);
    setError([]);
    const body = { sha: entry.sha, ...(reason.trim() ? { reason: reason.trim() } : {}) };
    try {
      if (kind === 'blog') {
        const result = await api.blogDelete(slug, body);
        onDeleted?.(result);
      } else {
        const result = await api.remove(kind, slug, body);
        applyDelete(kind, slug, result);
        onDeleted?.(result);
      }
      onClose();
    } catch (err) {
      // 409 aquí puede ser referencia desde otra ficha (related/compatibleWith/accessories), no solo sha: se muestra tal cual.
      if (err instanceof AdminApiError && err.status === 409) {
        setError([err.message, ...err.details]);
        if (kind !== 'blog') void reload();
      } else {
        setError([handleError(err)]);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Borrar ${singular[kind]}: ${entry.name}`} onClose={onClose}>
      <form class="adm-form" onSubmit={submit} data-admin-delete noValidate>
        {kind === 'blog' ? (
          <p>
            Se eliminará el artículo <code>{entry.path}</code> del repositorio y dejará de existir <code>/blog/{slug}</code>. Su foto queda en <code>src/assets/blog</code> y el historial de
            git permite recuperarlo.
          </p>
        ) : (
          <p>
            Se eliminará el JSON <code>{entry.path}</code> del repositorio. Las fotos quedan en <code>src/assets</code> y el historial de git permite recuperarlo. Si otra ficha la
            referencia, el servidor rechazará el borrado.
          </p>
        )}
        <label class="field">
          <span class="label">
            Escribe <code>{slug}</code> para confirmar
          </span>
          <input class="input" value={typed} onInput={(e) => setTyped((e.target as HTMLInputElement).value)} autoComplete="off" spellcheck={false} />
        </label>
        <label class="field">
          <span class="label">Motivo (opcional)</span>
          <input class="input" maxLength={120} value={reason} onInput={(e) => setReason((e.target as HTMLInputElement).value)} />
        </label>
        {error.length > 0 && (
          <div class="adm-errors" role="alert">
            <ul>
              {error.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        <div class="adm-form__actions">
          <button type="button" class="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" class="btn btn--primary adm-btn-danger-solid" disabled={!match || busy}>
            {busy ? 'Borrando…' : 'Borrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
