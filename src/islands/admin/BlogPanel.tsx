import { useCallback, useEffect, useState } from 'preact/hooks';
import type { BlogEntry, BlogSummary } from '../../domain/admin';
import { site } from '../../config/site';
import { blogCategoryLabel } from '../../lib/labels';
import { useAdmin } from './context';
import BlogEditor from './BlogEditor';
import ConfirmDelete from './ConfirmDelete';

type Phase = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; posts: BlogSummary[] };
type Dialog = { type: 'create' } | { type: 'edit'; entry: BlogEntry } | { type: 'delete'; post: BlogSummary } | null;

const fmtDate = new Intl.DateTimeFormat(site.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : fmtDate.format(d);
};

/**
 * Pestaña Blog (solo admin, ADR-023): lista de artículos del repositorio, "Nuevo artículo",
 * editar y borrar. Carga su propia lista (GET /api/admin/blog) al abrirse y tras cada escritura.
 */
export default function BlogPanel() {
  const { api, announce, handleError } = useAdmin();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      const list = await api.blogList();
      setPhase({ kind: 'ready', posts: list.posts });
    } catch (e) {
      setPhase({ kind: 'error', message: handleError(e) });
    }
  }, [api, handleError]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = async (slug: string) => {
    setOpening(slug);
    try {
      const entry = await api.blogGet(slug);
      setDialog({ type: 'edit', entry });
    } catch (e) {
      handleError(e);
    } finally {
      setOpening(null);
    }
  };

  if (phase.kind === 'loading') {
    return (
      <p class="muted" aria-busy="true" data-admin-blog-loading>
        Cargando los artículos…
      </p>
    );
  }
  if (phase.kind === 'error') {
    return (
      <div class="adm-empty" role="alert">
        <p>No se pudieron cargar los artículos: {phase.message}</p>
        <button type="button" class="btn btn--secondary btn--sm" onClick={() => void load()}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div class="adm-blog" data-admin-blog>
      <div class="adm-blog__bar">
        <p class="hint">
          {phase.posts.length} artículos en <code>src/content/blog</code>. Cada guardado publica la web en unos 3 minutos.
        </p>
        <button type="button" class="btn btn--primary" onClick={() => setDialog({ type: 'create' })} data-admin-new-post>
          Nuevo artículo
        </button>
      </div>

      {phase.posts.length === 0 ? (
        <p class="adm-empty muted">Todavía no hay artículos.</p>
      ) : (
        <div class="table-wrap adm-table-wrap">
          <table class="table adm-table" role="table" data-admin-table="blog">
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">Título</th>
                <th scope="col" role="columnheader">Categoría</th>
                <th scope="col" role="columnheader">Fecha</th>
                <th scope="col" role="columnheader">Foto</th>
                <th scope="col" role="columnheader">Acciones</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {phase.posts.map((p) => (
                <tr key={p.slug} role="row" data-admin-post={p.slug}>
                  <td role="cell" data-label="Título">
                    <div class="adm-name">
                      <strong>{p.title}</strong>
                    </div>
                    <code class="adm-slug">{p.slug}</code>
                  </td>
                  <td role="cell" data-label="Categoría">
                    {blogCategoryLabel[p.category]}
                  </td>
                  <td role="cell" data-label="Fecha">
                    <time dateTime={p.publishedAt}>{formatDate(p.publishedAt)}</time>
                    {p.updatedAt && <span class="hint"> · act. {formatDate(p.updatedAt)}</span>}
                  </td>
                  <td role="cell" data-label="Foto">{p.hasImage ? 'Sí' : <span class="muted">No</span>}</td>
                  <td role="cell" data-label="Acciones" class="adm-td-actions">
                    <button type="button" class="btn btn--secondary btn--sm" onClick={() => void openEdit(p.slug)} aria-label={`Editar artículo ${p.title}`} disabled={opening === p.slug}>
                      {opening === p.slug ? 'Abriendo…' : 'Editar'}
                    </button>
                    <a href={`/blog/${p.slug}`} class="btn btn--ghost btn--sm" target="_blank" rel="noopener noreferrer" aria-label={`Ver ${p.title} en la web`}>
                      Ver
                    </a>
                    <button type="button" class="btn btn--ghost btn--sm adm-btn-danger" onClick={() => setDialog({ type: 'delete', post: p })} aria-label={`Borrar artículo ${p.title}`}>
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(dialog?.type === 'create' || dialog?.type === 'edit') && (
        <BlogEditor
          entry={dialog.type === 'edit' ? dialog.entry : undefined}
          onClose={() => setDialog(null)}
          onSaved={(result) => {
            announce(result.commit, `Guardado: ${result.frontmatter.title}. Publicando los cambios…`);
            void load();
          }}
        />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDelete
          kind="blog"
          entry={{ slug: dialog.post.slug, name: dialog.post.title, sha: dialog.post.sha, path: dialog.post.path }}
          onClose={() => setDialog(null)}
          onDeleted={(result) => {
            announce(result.commit, `Borrado: ${dialog.post.title}. Publicando los cambios…`);
            void load();
          }}
        />
      )}
    </div>
  );
}
