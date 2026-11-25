import { useState } from 'preact/hooks';
import { useAdmin } from './context';
import ResetPasswordDialog from './ResetPasswordDialog';

interface Props {
  /** Modo local: fija la cabecera x-admin-local-user (null = sin simular) y recarga */
  onSimulate: (username: string | null) => void;
}

/**
 * Sección "Accesos": quién es administrador y quién editor, rama y modo local. El admin puede restablecer
 * la contraseña de los demás usuarios (ADR-025); la suya la cambia desde "Cambiar contraseña".
 */
export default function AccessPanel({ onSimulate }: Props) {
  const { user, api } = useAdmin();
  const [resetting, setResetting] = useState<string | null>(null);
  const current = api.getLocalUser() ?? '';
  const firstAdmin = user.admins[0];
  const firstEditor = user.editors[0];
  const canReset = user.role === 'admin' && !user.localMode;

  const row = (name: string) => (
    <li key={name} class="adm-access__user">
      <span>
        {name}
        {name === user.username && <span class="muted"> (tú)</span>}
      </span>
      {canReset && name !== user.username && (
        <button type="button" class="btn btn--ghost btn--sm" onClick={() => setResetting(name)} data-admin-reset-open={name}>
          Restablecer contraseña
        </button>
      )}
    </li>
  );

  return (
    <section class="adm-access card" aria-labelledby="adm-access-title" data-admin-access>
      <h2 id="adm-access-title">Accesos</h2>
      <div class="adm-access__lists">
        <div>
          <h3>Administradores</h3>
          <ul role="list">{user.admins.length ? user.admins.map(row) : <li class="muted">(ninguno)</li>}</ul>
        </div>
        <div>
          <h3>Editores</h3>
          <ul role="list">{user.editors.length ? user.editors.map(row) : <li class="muted">(ninguno)</li>}</ul>
        </div>
      </div>
      <p class="hint">
        Cada persona entra con su usuario y su contraseña, y la cambia desde "Cambiar contraseña" cuando quiera.
        {canReset
          ? ' Si alguien la olvida, pulsa "Restablecer contraseña" y entrégale la temporal; si la olvidas tú, se restablece con una entrada nueva en ADMIN_INITIAL_PASSWORDS.'
          : ' Si la olvidas, pide al administrador una temporal nueva.'}{' '}
        Quién es administrador o editor se decide en las variables <code>ADMIN_USERS</code> / <code>EDITOR_USERS</code> (varios usuarios separados por comas) del proyecto de Cloudflare Pages. Rama de escritura:{' '}
        <code>{user.branch}</code>.
      </p>
      {user.localMode && (
        <div class="adm-access__local">
          <span class="badge badge--new">Modo local</span>
          <label class="field adm-access__sim">
            <span class="label">Simular como…</span>
            <select
              class="select"
              value={current}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                onSimulate(v || null);
              }}
              data-admin-simulate
            >
              <option value="">Sin simular (identidad local)</option>
              {firstAdmin && <option value={firstAdmin}>Administrador ({firstAdmin})</option>}
              {firstEditor && <option value={firstEditor}>Editor ({firstEditor})</option>}
            </select>
          </label>
        </div>
      )}
      {resetting && <ResetPasswordDialog username={resetting} onClose={() => setResetting(null)} />}
    </section>
  );
}
