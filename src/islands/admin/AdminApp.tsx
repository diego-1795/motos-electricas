import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AdminCatalog, AdminKind, AdminUser, CatalogEntry, CommitInfo, DeleteResult, WriteResult } from '../../domain/admin';
import type { Part, Product } from '../../domain/types';
import { adminApi, AdminApiError } from '../../services/admin/AdminApiClient';
import { AdminContext, CONFLICT_MESSAGE, findEntry, kindLabel, normalize, roleLabel, type AdminCtx, type Tone } from './context';
import CatalogTable from './CatalogTable';
import DeployBanner from './DeployBanner';
import AccessPanel from './AccessPanel';
import ProductEditor from './ProductEditor';
import PartEditor from './PartEditor';
import DuplicateDialog from './DuplicateDialog';
import ConfirmDelete from './ConfirmDelete';

/**
 * Raíz del panel /admin (ADR-018). Carga identidad y catálogo, mantiene el estado global
 * (catálogo con sha, mensajes aria-live, último commit para el banner) y abre los diálogos.
 * Toda petición pasa por AdminApiClient; las reglas de negocio viven en src/domain.
 */

type Phase =
  | { kind: 'loading' }
  | { kind: 'denied'; status: number; message: string }
  | { kind: 'error'; message: string; config?: boolean }
  | { kind: 'ready'; user: AdminUser; catalog: AdminCatalog };

type Dialog =
  | { type: 'edit'; kind: AdminKind; slug: string }
  | { type: 'create'; kind: AdminKind; draft: Product | Part }
  | { type: 'duplicate'; kind: AdminKind }
  | { type: 'delete'; kind: AdminKind; slug: string }
  | null;

const TABS: AdminKind[] = ['products', 'repuestos'];

export default function AdminApp() {
  const api = adminApi;
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [tab, setTab] = useState<AdminKind>('products');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<{ text: string; tone: Tone; seq: number }>({ text: '', tone: 'info', seq: 0 });
  const [commit, setCommit] = useState<{ info: CommitInfo; seq: number } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reloadSeq, setReloadSeq] = useState(0);
  // Copia síncrona del catálogo: `latestSha` la lee sin esperar al re-render (escrituras encadenadas en una fila).
  // Toda mutación del catálogo pasa por aquí y después por setPhase, nunca al revés.
  const catalogRef = useRef<AdminCatalog | null>(null);

  const notify = useCallback((text: string, tone: Tone = 'info') => setStatus((s) => ({ text, tone, seq: s.seq + 1 })), []);

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    catalogRef.current = null;
    try {
      const [user, catalog] = await Promise.all([api.me(), api.catalog()]);
      catalogRef.current = catalog;
      setPhase({ kind: 'ready', user, catalog });
    } catch (e) {
      if (e instanceof AdminApiError && (e.status === 401 || e.status === 403)) setPhase({ kind: 'denied', status: e.status, message: e.message });
      else if (e instanceof AdminApiError && e.code === 'config') setPhase({ kind: 'error', message: e.message, config: true });
      else setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(async () => {
    try {
      const catalog = await api.catalog();
      catalogRef.current = catalog;
      setPhase((p) => (p.kind === 'ready' ? { ...p, catalog } : p));
      setReloadSeq((n) => n + 1);
    } catch (e) {
      notify(`No se pudo recargar el catálogo: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }, [api, notify]);

  const latestSha = useCallback((kind: AdminKind, slug: string): string | undefined => (catalogRef.current ? findEntry(catalogRef.current, kind, slug)?.sha : undefined), []);

  const handleError = useCallback(
    (err: unknown): string => {
      if (err instanceof AdminApiError) {
        if (err.status === 409) {
          notify(CONFLICT_MESSAGE, 'error');
          void reload();
          return CONFLICT_MESSAGE;
        }
        const prefix = err.code === 'config' ? 'Error de configuración del panel (avisar a Diego): ' : err.code === 'upstream' ? 'Fallo de GitHub o Cloudflare (reintenta en unos minutos): ' : '';
        const text = `${prefix}${err.details.length ? `${err.message}: ${err.details.join('; ')}` : err.message}`;
        notify(text, 'error');
        return text;
      }
      const text = err instanceof Error ? err.message : 'Error inesperado';
      notify(text, 'error');
      return text;
    },
    [notify, reload],
  );

  const applyWrite = useCallback(
    (kind: AdminKind, result: WriteResult<Product | Part>) => {
      const current = catalogRef.current;
      if (current) {
        const entry = { data: result.data, sha: result.sha, path: result.path };
        const replace = <T extends Product | Part>(list: CatalogEntry<T>[]): CatalogEntry<T>[] => {
          const i = list.findIndex((e) => e.data.slug === result.data.slug);
          const typed = entry as CatalogEntry<T>;
          return i >= 0 ? list.map((e, j) => (j === i ? typed : e)) : [...list, typed];
        };
        const catalog: AdminCatalog = kind === 'products' ? { ...current, products: replace(current.products) } : { ...current, repuestos: replace(current.repuestos) };
        catalogRef.current = catalog;
        setPhase((p) => (p.kind === 'ready' ? { ...p, catalog } : p));
      }
      const commitInfo = result.commit;
      if (!commitInfo) {
        // PATCH sin cambios reales: el servidor no crea commit ni dispara build
        notify(`Sin cambios en ${result.data.name}: el valor ya era ese.`);
        return;
      }
      setCommit((c) => ({ info: commitInfo, seq: (c?.seq ?? 0) + 1 }));
      notify(`Guardado: ${result.data.name}. Publicando los cambios…`);
    },
    [notify],
  );

  const applyDelete = useCallback(
    (kind: AdminKind, slug: string, result: DeleteResult) => {
      const current = catalogRef.current;
      if (current) {
        const catalog: AdminCatalog =
          kind === 'products'
            ? { ...current, products: current.products.filter((e) => e.data.slug !== slug) }
            : { ...current, repuestos: current.repuestos.filter((e) => e.data.slug !== slug) };
        catalogRef.current = catalog;
        setPhase((p) => (p.kind === 'ready' ? { ...p, catalog } : p));
      }
      setCommit((c) => ({ info: result.commit, seq: (c?.seq ?? 0) + 1 }));
      notify(`Borrado: ${slug}. Publicando los cambios…`);
    },
    [notify],
  );

  const simulate = useCallback(
    (email: string | null) => {
      api.setLocalUser(email);
      setDialog(null);
      void load();
    },
    [api, load],
  );

  const ctx = useMemo<AdminCtx | null>(
    () => (phase.kind === 'ready' ? { user: phase.user, catalog: phase.catalog, api, notify, applyWrite, applyDelete, handleError, reload, reloadSeq, latestSha } : null),
    [phase, api, notify, applyWrite, applyDelete, handleError, reload, reloadSeq, latestSha],
  );

  const liveRegions = (
    <>
      <p class={`adm-status${status.tone === 'info' && status.text ? ' is-visible' : ''}`} role="status" aria-live="polite" data-admin-status>
        {status.tone === 'info' ? status.text : ''}
      </p>
      <p class={`adm-status adm-status--error${status.tone === 'error' && status.text ? ' is-visible' : ''}`} role="alert" data-admin-alert>
        {status.tone === 'error' ? status.text : ''}
      </p>
    </>
  );

  if (phase.kind === 'loading') {
    return (
      <div class="adm__panel" aria-busy="true">
        <p class="muted">Cargando el panel…</p>
      </div>
    );
  }

  if (phase.kind === 'denied') {
    return (
      <div class="adm__panel card adm-denied" data-admin-denied>
        <h2>Sin acceso</h2>
        {phase.status === 401 ? (
          <p>No hay una sesión válida de Cloudflare Access. Vuelve a abrir <code>/admin</code>, escribe tu email y el código de un solo uso que recibirás.</p>
        ) : (
          <p>
            Tu email entró por Cloudflare Access pero no está autorizado en el panel (no figura en <code>ADMIN_EMAILS</code> ni en <code>EDITOR_EMAILS</code>). Pide al
            administrador de la tienda (Diego) que lo añada.
          </p>
        )}
        <p class="hint">Detalle del servidor: {phase.message}</p>
        <button type="button" class="btn btn--secondary" onClick={() => void load()}>
          Reintentar
        </button>
      </div>
    );
  }

  if (phase.kind === 'error' || !ctx) {
    return (
      <div class="adm__panel card adm-denied" role="alert" data-admin-error={phase.kind === 'error' && phase.config ? 'config' : 'error'}>
        <h2>{phase.kind === 'error' && phase.config ? 'Configuración incompleta del panel' : 'No se pudo cargar el panel'}</h2>
        <p>{phase.kind === 'error' ? phase.message : 'Estado desconocido'}</p>
        {phase.kind === 'error' && phase.config && (
          <p class="hint">
            Faltan variables del proyecto de Cloudflare Pages (<code>ADMIN_EMAILS</code>, <code>GITHUB_TOKEN</code>, <code>GITHUB_REPO</code>…). Esto lo corrige Diego (administrador); ver
            docs/19-deployment.md §12.
          </p>
        )}
        <button type="button" class="btn btn--secondary" onClick={() => void load()}>
          Reintentar
        </button>
      </div>
    );
  }

  const { user, catalog } = ctx;
  const isAdmin = user.role === 'admin';
  const q = normalize(search.trim());
  const entries: CatalogEntry<Product | Part>[] = tab === 'products' ? catalog.products : catalog.repuestos;
  const filtered = q ? entries.filter((e) => normalize(e.data.name).includes(q) || normalize(e.data.slug).includes(q)) : entries;

  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = TABS.indexOf(tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!;
    selectTab(next);
    (document.getElementById(`adm-tab-${next}`) as HTMLButtonElement | null)?.focus();
  };
  // Al cambiar de colección se limpia el buscador (un filtro heredado dejaría la lista vacía sin explicación)
  const selectTab = (k: AdminKind) => {
    setTab(k);
    setSearch('');
  };

  const openCreate = (kind: AdminKind, draft: Product | Part) => setDialog({ type: 'create', kind, draft });

  return (
    <AdminContext.Provider value={ctx}>
      <div class="adm__panel" data-admin-app data-role={user.role}>
        <div class="adm-who">
          <span>
            Conectado como <strong>{user.email}</strong> · {roleLabel[user.role]}
          </span>
          <span class="adm-chips">
            <span class="badge" title="Rama de GitHub sobre la que se escribe">
              rama {user.branch}
            </span>
            {user.localMode && <span class="badge badge--new">Modo local</span>}
          </span>
        </div>

        {liveRegions}
        <DeployBanner commit={commit} />

        <div class="adm-toolbar">
          <div class="tabs adm-tabs" role="tablist" aria-label="Colecciones" onKeyDown={onTabKey}>
            {TABS.map((k) => {
              const n = k === 'products' ? catalog.products.length : catalog.repuestos.length;
              return (
                <button
                  key={k}
                  type="button"
                  id={`adm-tab-${k}`}
                  class="tab"
                  role="tab"
                  aria-selected={tab === k}
                  aria-controls={`adm-panel-${k}`}
                  tabIndex={tab === k ? 0 : -1}
                  onClick={() => selectTab(k)}
                >
                  {kindLabel[k].plural} <span class="adm-tab__count">{n}</span>
                </button>
              );
            })}
          </div>
          <div class="adm-toolbar__right">
            <input
              type="search"
              class="input adm-search"
              placeholder="Buscar por nombre o slug"
              aria-label="Buscar por nombre o slug"
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            />
            {isAdmin && (
              <button type="button" class="btn btn--primary" onClick={() => setDialog({ type: 'duplicate', kind: tab })} data-admin-new>
                {tab === 'products' ? 'Nuevo producto' : 'Nuevo repuesto'}
              </button>
            )}
          </div>
        </div>

        <section id={`adm-panel-${tab}`} role="tabpanel" aria-labelledby={`adm-tab-${tab}`} tabIndex={0} class="adm-tabpanel">
          <CatalogTable
            kind={tab}
            entries={filtered}
            total={entries.length}
            admin={isAdmin}
            onEdit={(slug) => setDialog({ type: 'edit', kind: tab, slug })}
            onDelete={(slug) => setDialog({ type: 'delete', kind: tab, slug })}
          />
        </section>

        <AccessPanel onSimulate={simulate} />

        {dialog?.type === 'duplicate' && isAdmin && <DuplicateDialog kind={dialog.kind} onClose={() => setDialog(null)} onContinue={(draft) => openCreate(dialog.kind, draft)} />}
        {dialog?.type === 'edit' && isAdmin && (() => {
          const entry = findEntry(catalog, dialog.kind, dialog.slug);
          if (!entry) return null;
          return dialog.kind === 'products' ? (
            <ProductEditor entry={entry as CatalogEntry<Product>} onClose={() => setDialog(null)} />
          ) : (
            <PartEditor entry={entry as CatalogEntry<Part>} onClose={() => setDialog(null)} />
          );
        })()}
        {dialog?.type === 'create' && isAdmin && (dialog.kind === 'products' ? (
          <ProductEditor draft={dialog.draft as Product} onClose={() => setDialog(null)} />
        ) : (
          <PartEditor draft={dialog.draft as Part} onClose={() => setDialog(null)} />
        ))}
        {dialog?.type === 'delete' && isAdmin && (() => {
          const entry = findEntry(catalog, dialog.kind, dialog.slug);
          return entry ? <ConfirmDelete kind={dialog.kind} entry={entry} onClose={() => setDialog(null)} /> : null;
        })()}
      </div>
    </AdminContext.Provider>
  );
}
