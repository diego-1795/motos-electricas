import { useEffect, useState } from 'preact/hooks';
import type { CommitInfo, DeployState, DeployStatus } from '../../domain/admin';
import { safeHttpUrl, useAdmin } from './context';

interface Props {
  /** Último commit escrito; cada seq nuevo reinicia el aviso */
  commit: { info: CommitInfo; seq: number } | null;
}

const POLL_MS = 15_000;
const POLL_MAX_MS = 10 * 60_000;
const COUNTDOWN_S = 4 * 60;

const stateLabel: Record<DeployState, string> = {
  queued: 'En cola',
  building: 'Construyendo el sitio',
  success: 'Publicado',
  failure: 'El build ha fallado',
  unknown: 'Estado desconocido',
};

type Mode = { kind: 'idle' } | { kind: 'polling'; status: DeployStatus | null; timedOut: boolean } | { kind: 'countdown'; left: number };

/**
 * Banner de publicación tras una escritura. Con la API de Pages disponible consulta el estado
 * cada 15 s (máx. 10 min); si no, muestra "Publicando… ~3 min" con contador y se retira a los 4 min.
 */
export default function DeployBanner({ commit }: Props) {
  const { api } = useAdmin();
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });

  useEffect(() => {
    if (!commit) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    setMode({ kind: 'polling', status: null, timedOut: false });

    const tick = async () => {
      let st: DeployStatus;
      try {
        st = await api.deploy();
      } catch {
        if (!cancelled) setMode({ kind: 'countdown', left: COUNTDOWN_S });
        return;
      }
      if (cancelled) return;
      if (!st.available) {
        setMode({ kind: 'countdown', left: COUNTDOWN_S });
        return;
      }
      // Hasta que Pages vea el push, la API devuelve el despliegue anterior: se trata como "en cola".
      const stale = Boolean(st.commitSha && !commit.info.sha.startsWith(st.commitSha) && !st.commitSha.startsWith(commit.info.sha));
      const shown: DeployStatus = stale ? { ...st, state: 'queued', url: undefined } : st;
      const finished = !stale && (st.state === 'success' || st.state === 'failure');
      const timedOut = Date.now() - started > POLL_MAX_MS;
      setMode({ kind: 'polling', status: shown, timedOut });
      if (!finished && !timedOut) timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [commit, api]);

  useEffect(() => {
    if (mode.kind !== 'countdown') return;
    if (mode.left <= 0) {
      setMode({ kind: 'idle' });
      return;
    }
    const t = setTimeout(() => setMode((m) => (m.kind === 'countdown' ? { kind: 'countdown', left: m.left - 1 } : m)), 1000);
    return () => clearTimeout(t);
  }, [mode]);

  if (mode.kind === 'idle' || !commit) return null;

  const close = () => setMode({ kind: 'idle' });
  // Las URL vienen del API (GitHub / Pages): solo se enlazan si son http(s)
  const commitUrl = safeHttpUrl(commit.info.url);
  const commitLink = commitUrl ? (
    <a href={commitUrl} target="_blank" rel="noopener noreferrer">
      ver commit
    </a>
  ) : (
    <span>commit {commit.info.sha.slice(0, 7)}</span>
  );

  if (mode.kind === 'countdown') {
    const mm = Math.floor(mode.left / 60);
    const ss = String(mode.left % 60).padStart(2, '0');
    return (
      <div class="adm-deploy" role="status" data-deploy-banner="countdown">
        <p>
          <strong>Publicando…</strong> los cambios tardan unos 3 minutos en verse en la web.{' '}
          <span class="muted">
            ({mm}:{ss}) · {commitLink}
          </span>
        </p>
        <button type="button" class="btn btn--ghost btn--sm" onClick={close} aria-label="Cerrar aviso de publicación">
          ✕
        </button>
      </div>
    );
  }

  const st = mode.status;
  const state: DeployState = st?.state ?? 'queued';
  const tone = state === 'success' ? 'ok' : state === 'failure' ? 'error' : 'busy';
  const deployUrl = safeHttpUrl(st?.url);
  return (
    <div class={`adm-deploy adm-deploy--${tone}`} role="status" data-deploy-banner={state}>
      <p>
        <strong>{state === 'success' ? 'Publicado.' : state === 'failure' ? 'Error al publicar.' : 'Publicando…'}</strong> {stateLabel[state]}
        {state === 'success' && ': los cambios ya están en la web.'}
        {state === 'failure' && ': la web sigue con la versión anterior; revisa el build en Cloudflare Pages.'}
        {mode.timedOut && ' Sin respuesta definitiva en 10 minutos; comprueba Cloudflare Pages.'}{' '}
        <span class="muted">
          {deployUrl && (
            <>
              <a href={deployUrl} target="_blank" rel="noopener noreferrer">
                ver despliegue
              </a>
              {' · '}
            </>
          )}
          {commitLink}
        </span>
      </p>
      <button type="button" class="btn btn--ghost btn--sm" onClick={close} aria-label="Cerrar aviso de publicación">
        ✕
      </button>
    </div>
  );
}
