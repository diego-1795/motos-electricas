import { useEffect, useId, useRef, useState } from 'preact/hooks';
import type { AdminUser } from '../../domain/admin';
import { isEmail, normalizeEmail } from '../../domain/adminAuth';
import { adminApi, AdminApiError } from '../../services/admin/AdminApiClient';

interface Props {
  /** Mensaje inicial (p. ej. "La sesión ha caducado") */
  notice?: string;
  onLoggedIn: (user: AdminUser) => void;
}

/**
 * Pantalla de inicio de sesión del panel (ADR-024): email + contraseña → POST /auth/login.
 * La cookie la pone el servidor; aquí solo se muestra el resultado. Un 423 (bloqueo temporal) y un 401 se
 * anuncian en la región de alerta y el foco vuelve al campo correspondiente.
 */
export default function LoginForm({ notice, onLoggedIn }: Props) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error]);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    const normalized = normalizeEmail(email);
    if (!isEmail(normalized)) {
      setError('Escribe un email válido');
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      setError('Escribe tu contraseña');
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await adminApi.login({ email: normalized, password });
      setPassword('');
      onLoggedIn(user);
    } catch (err) {
      const text = err instanceof AdminApiError ? (err.code === 'config' ? `Error de configuración del panel (avisar a Diego): ${err.message}` : err.message) : 'No se pudo iniciar sesión';
      setError(text);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="adm__panel adm-login" data-admin-login>
      <form class="card adm-login__card adm-form" onSubmit={(e) => void submit(e)} noValidate aria-describedby={notice ? `${id}-notice` : undefined}>
        <div>
          <h2>Iniciar sesión</h2>
          <p class="muted">Acceso reservado al equipo de la tienda.</p>
        </div>
        {notice && (
          <p id={`${id}-notice`} class="adm-status is-visible" role="status">
            {notice}
          </p>
        )}
        <label class="field" for={`${id}-email`}>
          <span class="label">Email</span>
          <input
            id={`${id}-email`}
            ref={emailRef}
            class="input"
            type="email"
            name="email"
            autocomplete="username"
            inputMode="email"
            spellcheck={false}
            required
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            disabled={busy}
          />
        </label>
        <label class="field" for={`${id}-password`}>
          <span class="label">Contraseña</span>
          <input
            id={`${id}-password`}
            ref={passwordRef}
            class="input"
            type="password"
            name="password"
            autocomplete="current-password"
            required
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            disabled={busy}
          />
        </label>
        <p ref={alertRef} class={`adm-status adm-status--error${error ? ' is-visible' : ''}`} role="alert" tabIndex={-1} data-admin-login-error>
          {error ?? ''}
        </p>
        <div class="adm-form__actions">
          <button type="submit" class="btn btn--primary" aria-disabled={busy} data-admin-login-submit>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
        <p class="hint">¿Olvidaste la contraseña? Pide al administrador (Diego) una contraseña temporal nueva; al entrar tendrás que cambiarla.</p>
      </form>
    </div>
  );
}
