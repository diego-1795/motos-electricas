import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AdminCatalog, AdminKind, AdminUser, CatalogEntry, CommitInfo, DeleteResult, WriteResult } from '../../domain/admin';
import type { Part, Product } from '../../domain/types';
import { adminApi, AdminApiError, SESSION_EXPIRED_MESSAGE } from '../../services/admin/AdminApiClient';
import { AdminContext, CONFLICT_MESSAGE, findEntry, kindLabel, normalize, roleLabel, type AdminCtx, type AdminTab, type Tone } from './context';
import CatalogTable from './CatalogTable';
import DeployBanner from './DeployBanner';
import AccessPanel from './AccessPanel';
import ProductEditor from './ProductEditor';
import PartEditor from './PartEditor';
import DuplicateDialog from './DuplicateDialog';
import ConfirmDelete from './ConfirmDelete';
import BlogPanel from './BlogPanel';
import LoginForm from './LoginForm';
import PasswordForm from './PasswordForm';
import Modal from './Modal';

/**
 * Raíz del panel /admin (ADR-018). Carga identidad y catálogo, mantiene el estado global
 * (catálogo con sha, mensajes aria-live, último commit para el banner) y abre los diálogos.
 * Sesión (ADR-024): sin cookie válida muestra el inicio de sesión; con contraseña temporal obliga a
 * cambiarla antes de cargar nada. La pestaña Blog (ADR-023) solo existe para el administrador.
 * Toda petición pasa por AdminApiClient; las reglas de negocio viven en src/domain.
 */

type Phase =
  | { kind: 'loading' }
  | { kind: 'login'; notice?: string }
  | { kind: 'must-change'; user: AdminUser }
  | { kind: 'denied'; status: number; message: string }
  | { kind: 'error'; message: string; config?: boolean }
  | { kind: 'ready'; user: AdminUser; catalog: AdminCatalog };

type Dialog =
  | { type: 'edit'; kind: AdminKind; slug: string }
  | { type: 'create'; kind: AdminKind; draft: Product | Part }
  | { type: 'duplicate'; kind: AdminKind }
  | { type: 'delete'; kind: AdminKind; slug: string }
  | { type: 'password' }
  | null;

const CATALOG_TABS: AdminKind[] = ['products', 'repuestos'];
const tabTitle: Record<AdminTab, string> = { products: kindLabel.products.plural, repuestos: kindLabel.repuestos.plural, blog: 'Blog' };

export default function AdminApp() {
  const api = adminApi;
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [tab, setTab] = useState<AdminTab>('products');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<{ text: string; tone: Tone; seq: number }>({ text: '', tone: 'info', seq: 0 });
  const [commit, setCommit] = useState<{ info: CommitInfo; seq: number } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reloadSeq, setReloadSeq] = useState(0);
  // Copia síncrona del catálogo: `latestSha` la lee sin esperar al re-render (escrituras encadenadas en una fila).
  // Toda mutación del catálogo pasa por aquí y después por setPhase, nunca al revés.
  const catalogRef = useRef<AdminCatalog | null>(null);

  const notify = useCallback((text: string, tone: Tone = 'info') => setStatus((s) => ({ text, tone, seq: s.seq + 1 })), []);

  /** Con el usuario ya identificado: catálogo → panel (o cambio de contraseña obligatorio). */
  const enter = useCallback(
    async (user: AdminUser) => {
      if (user.mustChangePassword) {
        setPhase({ kind: 'must-change', user });
        return;
      }
      setPhase({ kind: 'loading' });
      try {
        const catalog = await api.catalog();
        catalogRef.current = catalog;
        setPhase({ kind: 'ready', user, catalog });
      } catch (e) {
        if (e instanceof AdminApiError && e.status === 401) setPhase({ kind: 'login', notice: SESSION_EXPIRED_MESSAGE });
        else if (e instanceof AdminApiError && e.status === 403) setPhase({ kind: 'denied', status: 403, message: e.message });
        else if (e instanceof AdminApiError && e.code === 'config') setPhase({ kind: 'error', message: e.message, config: true });
        else setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    },
    [api],
  );

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    catalogRef.current = null;
    try {
      const user = await api.me();
      await enter(user);
    } catch (e) {
      // Un 401 "normal" es simplemente que no hay sesión; una redirección de un perímetro externo llega como sesión caducada
      if (e instanceof AdminApiError && e.status === 401) setPhase({ kind: 'login', notice: e.message === SESSION_EXPIRED_MESSAGE ? e.message : undefined });
      else if (e instanceof AdminApiError && e.status === 403) setPhase({ kind: 'denied', status: 403, message: e.message });
      else if (e instanceof AdminApiError && e.code === 'config') setPhase({ kind: 'error', message: e.message, config: true });
      else setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [api, enter]);

  useEffect(() => {
    void load();
  }, [load]);

  const logout = useCallback(async () => {
    setDialog(null);
    try {
      await api.logout();
    } catch {
      // la cookie caduca sola; la pantalla de login se muestra igualmente
    }
    catalogRef.current = null;
    api.setLocalUser(null);
    setPhase({ kind: 'login', notice: 'Has cerrado la sesión' });
  }, [api]);

  const reload = useCallback(async () => {
    try {
      const catalog = await api.catalog();
      catalogRef.current = catalog;
      setPhase((p) => (p.kind === 'ready' ? { ...p, catalog } : p));
      setReloadSeq((n) => n + 1);
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 401) {
        setPhase({ kind: 'login', notice: SESSION_EXPIRED_MESSAGE });
        return;
      }
      notify(`No se pudo recargar el catálogo: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }, [api, notify]);

  const latestSha = useCallback((kind: AdminKind, slug: string): string | undefined => (catalogRef.current ? findEntry(catalogRef.current, kind, slug)?.sha : undefined), []);

  const handleError = useCallback(
    (err: unknown): string => {
      if (err instanceof AdminApiError) {
        if (err.status === 401) {
          // Sesión caducada en mitad del trabajo: volver al inicio de sesión (lo escrito sin guardar se pierde)
          setDialog(null);
          setPhase({ kind: 'login', notice: SESSION_EXPIRED_MESSAGE });
          return SESSION_EXPIRED_MESSAGE;
        }
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

  const announce = useCallback(
    (info: CommitInfo, text: string) => {
      setCommit((c) => ({ info, seq: (c?.seq ?? 0) + 1 }));
      notify(text);
    },
    [notify],
  );

  const simulate = useCallback(
    (email: string | null) => {
      api.setLocalUser(email);
      setDialog(null);
      setTab('products');
      void load();
    },
    [api, load],
  );

  const ctx = useMemo<AdminCtx | null>(
    () => (phase.kind === 'ready' ? { user: phase.user, catalog: phase.catalog, api, notify, applyWrite, applyDelete, announce, handleError, reload, reloadSeq, latestSha } : null),
    [phase, api, notify, applyWrite, applyDelete, announce, handleError, reload, reloadSeq, latestSha],
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

  if (phase.kind === 'login') {
    return <LoginForm notice={phase.notice} onLoggedIn={(user) => void enter(user)} />;
  }

  if (phase.kind === 'must-change') {
    return (
      <div class="adm__panel adm-login" data-admin-must-change>
        <div class="card adm-login__card">
          <h2>Elige tu contraseña</h2>
          <p class="muted">
            Conectado como <strong>{phase.user.email}</strong>
          </p>
          <PasswordForm user={phase.user} forced onChanged={(user) => void enter(user)} />
          <p class="hint">
            <button type="button" class="btn btn--ghost btn--sm" onClick={() => void logout()}>
              Cerrar sesión
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (phase.kind === 'denied') {
    return (
      <div class="adm__panel card adm-denied" data-admin-denied>
        <h2>Sin acceso</h2>
        <p>
          Tu email está identificado pero no está autorizado en el panel (no figura en <code>ADMIN_EMAILS</code> ni en <code>EDITOR_EMAILS</code>). Pide al administrador de
          la tienda (Diego) que lo añada.
        </p>
        <p class="hint">Detalle del servidor: {phase.message}</p>
        <div class="adm-who__actions">
          <button type="button" class="btn btn--secondary" onClick={() => void load()}>
            Reintentar
          </button>
          <button type="button" class="btn btn--ghost" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </div>
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
            Faltan variables o bindings del proyecto de Cloudflare Pages (<code>ADMIN_KV</code>, <code>SESSION_SECRET</code>, <code>ADMIN_EMAILS</code>, <code>GITHUB_TOKEN</code>…).
            Esto lo corrige Diego (administrador); ver docs/19-deployment.md §12.
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
  // La pestaña Blog solo existe para el administrador (el servidor responde 403 al editor de todos modos)
  const tabs: AdminTab[] = isAdmin ? [...CATALOG_TABS, 'blog'] : CATALOG_TABS;
  const catalogTab: AdminKind = tab === 'blog' ? 'products' : tab;
  const q = normalize(search.trim());
  const entries: CatalogEntry<Product | Part>[] = catalogTab === 'products' ? catalog.products : catalog.repuestos;
  const filtered = q ? entries.filter((e) => normalize(e.data.name).includes(q) || normalize(e.data.slug).includes(q)) : entries;

  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = tabs.indexOf(tab);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
    selectTab(next);
    (document.getElementById(`adm-tab-${next}`) as HTMLButtonElement | null)?.focus();
  };
  // Al cambiar de colección se limpia el buscador (un filtro heredado dejaría la lista vacía sin explicación)
  const selectTab = (k: AdminTab) => {
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
          <span class="adm-who__actions">
            {!user.localMode && (
              <button type="button" class="btn btn--ghost btn--sm" onClick={() => setDialog({ type: 'password' })} data-admin-change-password>
                Cambiar contraseña
              </button>
            )}
            <button type="button" class="btn btn--secondary btn--sm" onClick={() => void logout()} data-admin-logout>
              Cerrar sesión
            </button>
          </span>
        </div>

        {liveRegions}
        <DeployBanner commit={commit} />

        <div class="adm-toolbar">
          <div class="tabs adm-tabs" role="tablist" aria-label="Colecciones" onKeyDown={onTabKey}>
            {tabs.map((k) => {
              const n = k === 'products' ? catalog.products.length : k === 'repuestos' ? catalog.repuestos.length : null;
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
                  {tabTitle[k]}
                  {n !== null && <span class="adm-tab__count">{n}</span>}
                </button>
              );
            })}
          </div>
          {tab !== 'blog' && (
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
                <button type="button" class="btn btn--primary" onClick={() => setDialog({ type: 'duplicate', kind: catalogTab })} data-admin-new>
                  {catalogTab === 'products' ? 'Nuevo producto' : 'Nuevo repuesto'}
                </button>
              )}
            </div>
          )}
        </div>

        <section id={`adm-panel-${tab}`} role="tabpanel" aria-labelledby={`adm-tab-${tab}`} tabIndex={0} class="adm-tabpanel">
          {tab === 'blog' && isAdmin ? (
            <BlogPanel />
          ) : (
            <CatalogTable
              kind={catalogTab}
              entries={filtered}
              total={entries.length}
              admin={isAdmin}
              onEdit={(slug) => setDialog({ type: 'edit', kind: catalogTab, slug })}
              onDelete={(slug) => setDialog({ type: 'delete', kind: catalogTab, slug })}
            />
          )}
        </section>

        <AccessPanel onSimulate={simulate} />

        {dialog?.type === 'password' && (
          <Modal title="Cambiar contraseña" onClose={() => setDialog(null)}>
            <PasswordForm
              user={user}
              onCancel={() => setDialog(null)}
              onChanged={() => {
                setDialog(null);
                notify('Contraseña cambiada. Las demás sesiones abiertas con la contraseña anterior se han cerrado.');
              }}
            />
          </Modal>
        )}
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
          return entry ? <ConfirmDelete kind={dialog.kind} entry={{ slug: entry.data.slug, name: entry.data.name, sha: entry.sha, path: entry.path }} onClose={() => setDialog(null)} /> : null;
        })()}
      </div>
    </AdminContext.Provider>
  );
}
