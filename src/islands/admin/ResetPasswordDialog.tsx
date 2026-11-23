import { useState } from 'preact/hooks';
import { adminApi, AdminApiError } from '../../services/admin/AdminApiClient';
import Modal from './Modal';

interface Props {
  username: string;
  onClose: () => void;
}

/**
 * Restablecer la contraseña de otro usuario (solo admin, ADR-025): confirmación → POST /users/reset →
 * la contraseña temporal se muestra UNA sola vez para entregarla en mano. El usuario deberá cambiarla al
 * entrar y sus sesiones abiertas se cierran.
 */
export default function ResetPasswordDialog({ username, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temporary, setTemporary] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await adminApi.resetPassword({ username });
      setTemporary(result.temporaryPassword);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'No se pudo restablecer la contraseña');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!temporary) return;
    try {
      await navigator.clipboard.writeText(temporary);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal title={`Restablecer contraseña de ${username}`} onClose={onClose}>
      <div class="adm-form" data-admin-reset>
        {temporary ? (
          <>
            <p>
              Contraseña temporal de <strong>{username}</strong>. Entrégasela en persona o por un canal privado: <strong>no se volverá a mostrar</strong>. Al entrar tendrá que
              cambiarla.
            </p>
            <p class="adm-reset__temp">
              <code data-admin-reset-temp>{temporary}</code>
            </p>
            <p class="visually-hidden" role="status">
              {copied ? 'Copiada al portapapeles' : ''}
            </p>
            <div class="adm-form__actions">
              <button type="button" class="btn btn--secondary" onClick={() => void copy()}>
                {copied ? 'Copiada' : 'Copiar'}
              </button>
              <button type="button" class="btn btn--primary" onClick={onClose}>
                Hecho
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              Se generará una contraseña temporal nueva para <strong>{username}</strong>. La actual deja de valer y se cierran sus sesiones abiertas.
            </p>
            {error && (
              <p class="adm-status adm-status--error is-visible" role="alert">
                {error}
              </p>
            )}
            <div class="adm-form__actions">
              <button type="button" class="btn btn--primary" aria-disabled={busy} onClick={() => void reset()} data-admin-reset-confirm>
                {busy ? 'Generando…' : 'Restablecer contraseña'}
              </button>
              <button type="button" class="btn btn--secondary" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
