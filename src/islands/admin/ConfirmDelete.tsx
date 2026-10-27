import { useState } from 'preact/hooks';
import type { AdminKind, CatalogEntry } from '../../domain/admin';
import type { Part, Product } from '../../domain/types';
import { AdminApiError } from '../../services/admin/AdminApiClient';
import { kindLabel, useAdmin } from './context';
import Modal from './Modal';

interface Props {
  kind: AdminKind;
  entry: CatalogEntry<Product | Part>;
  onClose: () => void;
}

/** Borrado (solo admin): escribir el slug para confirmar + motivo opcional. */
export default function ConfirmDelete({ kind, entry, onClose }: Props) {
  const { api, applyDelete, handleError, reload } = useAdmin();
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const slug = entry.data.slug;
  const match = typed.trim() === slug;

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!match) return;
    setBusy(true);
    setError([]);
    try {
      const result = await api.remove(kind, slug, { sha: entry.sha, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      applyDelete(kind, slug, result);
      onClose();
    } catch (err) {
      // 409 aquí puede ser referencia desde otra ficha (related/compatibleWith/accessories), no solo sha: se muestra tal cual.
      if (err instanceof AdminApiError && err.status === 409) {
        setError([err.message, ...err.details]);
        void reload();
      } else {
        setError([handleError(err)]);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Borrar ${kindLabel[kind].singular}: ${entry.data.name}`} onClose={onClose}>
      <form class="adm-form" onSubmit={submit} data-admin-delete noValidate>
        <p>
          Se eliminará el JSON <code>{entry.path}</code> del repositorio. Las fotos quedan en <code>src/assets</code> y el historial de git permite recuperarlo. Si otra ficha la
          referencia, el servidor rechazará el borrado.
        </p>
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
