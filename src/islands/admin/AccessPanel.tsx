import { useAdmin } from './context';

interface Props {
  /** Modo local: fija la cabecera x-admin-local-user (null = sin simular) y recarga */
  onSimulate: (email: string | null) => void;
}

/** Sección "Accesos" (solo lectura): quién es administrador y quién editor, rama y modo local. */
export default function AccessPanel({ onSimulate }: Props) {
  const { user, api } = useAdmin();
  const current = api.getLocalUser() ?? '';
  const firstAdmin = user.admins[0];
  const firstEditor = user.editors[0];

  return (
    <section class="adm-access card" aria-labelledby="adm-access-title" data-admin-access>
      <h2 id="adm-access-title">Accesos</h2>
      <div class="adm-access__lists">
        <div>
          <h3>Administradores</h3>
          <ul role="list">{user.admins.length ? user.admins.map((e) => <li key={e}>{e}</li>) : <li class="muted">(ninguno)</li>}</ul>
        </div>
        <div>
          <h3>Editores</h3>
          <ul role="list">{user.editors.length ? user.editors.map((e) => <li key={e}>{e}</li>) : <li class="muted">(ninguno)</li>}</ul>
        </div>
      </div>
      <p class="hint">
        Los accesos se cambian en Cloudflare: Access → política de la aplicación (emails que pueden entrar) y variables <code>ADMIN_EMAILS</code> /{' '}
        <code>EDITOR_EMAILS</code> del proyecto de Pages. Rama de escritura: <code>{user.branch}</code>.
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
    </section>
  );
}
