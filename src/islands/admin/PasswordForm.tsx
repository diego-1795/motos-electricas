import { useEffect, useId, useRef, useState } from 'preact/hooks';
import type { AdminUser } from '../../domain/admin';
import { MIN_PASSWORD_LENGTH, passwordErrors } from '../../domain/adminAuth';
import { adminApi, AdminApiError } from '../../services/admin/AdminApiClient';

interface Props {
  user: AdminUser;
  /** true en la primera entrada: no se puede cerrar sin cambiarla */
  forced?: boolean;
  onChanged: (user: AdminUser) => void;
  onCancel?: () => void;
}

/**
 * Cambio de contraseña (ADR-024): actual + nueva (dos veces) → POST /auth/password.
 * Valida en local con la misma política que el servidor (src/domain/adminAuth) antes de enviar.
 */
export default function PasswordForm({ user, forced = false, onChanged, onCancel }: Props) {
  const id = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const currentRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    currentRef.current?.focus();
  }, []);

  useEffect(() => {
    if (errors.length) alertRef.current?.focus();
  }, [errors]);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    const local = [...(current ? [] : ['Escribe tu contraseña actual']), ...passwordErrors(next, { email: user.email, current }), ...(next !== repeat ? ['Las dos contraseñas nuevas no coinciden'] : [])];
    if (local.length) {
      setErrors(local);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      const updated = await adminApi.changePassword({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setRepeat('');
      onChanged(updated);
    } catch (err) {
      if (err instanceof AdminApiError) setErrors(err.details.length ? err.details : [err.message]);
      else setErrors(['No se pudo cambiar la contraseña']);
      setCurrent('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="adm-form" onSubmit={(e) => void submit(e)} noValidate data-admin-password-form>
      {forced && (
        <p>
          Estás entrando con una <strong>contraseña temporal</strong>. Elige una nueva (solo tú la conocerás) para empezar a usar el panel.
        </p>
      )}
      {/* Campo oculto para que el gestor de contraseñas asocie la cuenta (recomendación de autocomplete) */}
      <input type="text" name="username" autocomplete="username" value={user.email} readOnly hidden aria-hidden="true" tabIndex={-1} />
      <div class="field">
        <label class="label" for={`${id}-current`}>
          Contraseña actual
        </label>
        <input id={`${id}-current`} ref={currentRef} class="input" type="password" autocomplete="current-password" required value={current} onInput={(e) => setCurrent((e.target as HTMLInputElement).value)} disabled={busy} />
      </div>
      <div class="field">
        <label class="label" for={`${id}-next`}>
          Contraseña nueva
        </label>
        <input
          id={`${id}-next`}
          class="input"
          type="password"
          autocomplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          aria-describedby={`${id}-hint`}
          value={next}
          onInput={(e) => setNext((e.target as HTMLInputElement).value)}
          disabled={busy}
        />
        <span id={`${id}-hint`} class="hint">
          Al menos {MIN_PASSWORD_LENGTH} caracteres; evita tu email y secuencias como 1234567890. Puedes usar una frase con espacios.
        </span>
      </div>
      <div class="field">
        <label class="label" for={`${id}-repeat`}>
          Repite la contraseña nueva
        </label>
        <input id={`${id}-repeat`} class="input" type="password" autocomplete="new-password" required value={repeat} onInput={(e) => setRepeat((e.target as HTMLInputElement).value)} disabled={busy} />
      </div>
      {errors.length > 0 && (
        <div ref={alertRef} class="adm-errors" role="alert" tabIndex={-1} data-admin-password-errors>
          <strong>No se ha cambiado la contraseña:</strong>
          <ul>
            {errors.map((er) => (
              <li key={er}>{er}</li>
            ))}
          </ul>
        </div>
      )}
      <div class="adm-form__actions">
        <button type="submit" class="btn btn--primary" aria-disabled={busy} data-admin-password-submit>
          {busy ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
        {!forced && onCancel && (
          <button type="button" class="btn btn--secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
