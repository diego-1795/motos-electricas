import { useEffect, useId, useRef, useState } from 'preact/hooks';
import type { BlogEntry, BlogFrontmatter, BlogWriteResult } from '../../domain/admin';
import type { BlogPost, ImageRef } from '../../domain/types';
import { blogRules, slugify } from '../../domain/blogRules';
import { isValidSlug } from '../../domain/catalogRules';
import { readingMinutes } from '../../domain/reading';
import { blogCategoryLabel } from '../../lib/labels';
import { AdminApiError } from '../../services/admin/AdminApiClient';
import { STALE_EDITOR_MESSAGE, useAdmin } from './context';
import ImageFields from './ImageFields';
import Modal from './Modal';

interface Props {
  /** Edición: artículo cargado del repositorio (PUT con sha). Sin él: artículo nuevo (PUT sin sha). */
  entry?: BlogEntry;
  onClose: () => void;
  onSaved: (result: BlogWriteResult) => void;
}

type Category = BlogPost['category'];
const CATEGORIES = Object.keys(blogCategoryLabel) as Category[];
const DEFAULT_AUTHOR = 'Equipo Raiden';

interface Form {
  slug: string;
  slugTouched: boolean;
  title: string;
  description: string;
  category: Category;
  publishedAt: string;
  updatedAt: string;
  author: string;
  relatedProducts: string[];
  image: ImageRef | undefined;
  body: string;
}

const dateOnly = (iso: string | undefined): string => (iso ?? '').slice(0, 10);
const todayIso = (): string => `${new Date().toISOString().slice(0, 10)}T08:00:00.000Z`;

/** Fecha del <input type="date"> → ISO del frontmatter; si no cambió se conserva la original (hora incluida). */
export function toIsoDate(day: string, original: string | undefined): string | undefined {
  if (!day) return undefined;
  if (original && dateOnly(original) === day) return original;
  return `${day}T08:00:00.000Z`;
}

function toForm(entry: BlogEntry | undefined): Form {
  const fm = entry?.frontmatter;
  return {
    slug: entry?.slug ?? '',
    slugTouched: Boolean(entry),
    title: fm?.title ?? '',
    description: fm?.description ?? '',
    category: fm?.category ?? 'guias',
    publishedAt: dateOnly(fm?.publishedAt ?? todayIso()),
    updatedAt: dateOnly(fm?.updatedAt),
    author: fm?.author ?? DEFAULT_AUTHOR,
    relatedProducts: fm?.relatedProducts ?? [],
    image: fm?.image,
    body: entry?.body ?? '',
  };
}

function fromForm(f: Form, entry: BlogEntry | undefined): { frontmatter: BlogFrontmatter; body: string } {
  const updatedAt = toIsoDate(f.updatedAt, entry?.frontmatter.updatedAt);
  const frontmatter: BlogFrontmatter = {
    title: f.title.trim(),
    description: f.description.trim(),
    category: f.category,
    publishedAt: toIsoDate(f.publishedAt, entry?.frontmatter.publishedAt) ?? '',
    ...(updatedAt ? { updatedAt } : {}),
    author: f.author.trim(),
    ...(f.image ? { image: { ...f.image, alt: f.image.alt.trim() } } : {}),
    relatedProducts: f.relatedProducts,
  };
  return { frontmatter, body: f.body.replace(/\r\n?/g, '\n') };
}

/**
 * Editor de un artículo del blog (solo admin, ADR-023): frontmatter como campos, foto por ruta
 * (`~/assets/blog/<nombre>.webp`, subida antes por git) y cuerpo Markdown. Las mismas reglas que el
 * servidor (blogRules) se comprueban antes de enviar.
 */
export default function BlogEditor({ entry, onClose, onSaved }: Props) {
  const { api, catalog, handleError } = useAdmin();
  const creating = !entry;
  const [form, setForm] = useState<Form>(() => toForm(entry));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const uid = useId();
  const errorsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errors.length) errorsRef.current?.focus();
  }, [errors]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setTitle = (title: string) => setForm((f) => ({ ...f, title, slug: f.slugTouched ? f.slug : slugify(title) }));
  const toggleRelated = (slug: string, on: boolean) =>
    setForm((f) => ({ ...f, relatedProducts: on ? [...f.relatedProducts.filter((s) => s !== slug), slug] : f.relatedProducts.filter((s) => s !== slug) }));

  const minutes = readingMinutes(form.body);
  const words = form.body.trim() ? form.body.trim().split(/\s+/).length : 0;

  const submit = async (e: Event) => {
    e.preventDefault();
    if (saving || stale) return;
    const slug = form.slug.trim();
    const local: string[] = [];
    if (creating && !isValidSlug(slug)) local.push('El slug debe ir en minúsculas, números y guiones (p. ej. como-elegir-una-bicimoto)');
    const built = fromForm(form, entry);
    local.push(...blogRules(slug, built.frontmatter, built.body, { productSlugs: catalog.products.map((p) => p.data.slug) }));
    if (local.length) return setErrors(local);
    setSaving(true);
    setErrors([]);
    try {
      const result = await api.blogPut(slug, {
        ...(entry ? { sha: entry.sha } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        frontmatter: built.frontmatter,
        body: built.body,
      });
      onSaved(result);
      onClose();
    } catch (err) {
      const msg = handleError(err);
      if (err instanceof AdminApiError && err.status === 409) {
        setStale(true);
        setErrors([msg, STALE_EDITOR_MESSAGE]);
      } else {
        setErrors(err instanceof AdminApiError && err.details.length ? [err.message, ...err.details] : [msg]);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={creating ? 'Nuevo artículo' : `Editar artículo: ${entry.frontmatter.title}`} onClose={onClose} wide>
      <form class="adm-form" onSubmit={submit} data-admin-editor="blog" noValidate>
        <div class="adm-form__grid">
          <label class="field adm-form__full">
            <span class="label">Título</span>
            <input class="input" value={form.title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} required />
          </label>
          <label class="field adm-form__full">
            <span class="label">Slug (URL)</span>
            <input
              class="input"
              value={form.slug}
              readOnly={!creating}
              onInput={(e) => setForm((f) => ({ ...f, slug: (e.target as HTMLInputElement).value, slugTouched: true }))}
              aria-describedby={`${uid}-slug`}
              autoComplete="off"
              spellcheck={false}
            />
            <span id={`${uid}-slug`} class="hint">
              /blog/{form.slug || '<slug>'}
              {creating ? ' · se propone a partir del título; minúsculas, números y guiones. Después no se puede cambiar.' : ''}
            </span>
          </label>
          <label class="field adm-form__full">
            <span class="label">Descripción (resumen para Google y la lista del blog)</span>
            <textarea class="textarea adm-textarea--short" value={form.description} onInput={(e) => set('description', (e.target as HTMLTextAreaElement).value)} required />
          </label>
          <label class="field">
            <span class="label">Categoría</span>
            <select class="select" value={form.category} onChange={(e) => set('category', (e.target as HTMLSelectElement).value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {blogCategoryLabel[c]}
                </option>
              ))}
            </select>
          </label>
          <label class="field">
            <span class="label">Autor</span>
            <input class="input" value={form.author} onInput={(e) => set('author', (e.target as HTMLInputElement).value)} required />
          </label>
          <label class="field">
            <span class="label">Fecha de publicación</span>
            <input class="input" type="date" value={form.publishedAt} onInput={(e) => set('publishedAt', (e.target as HTMLInputElement).value)} required />
          </label>
          <label class="field">
            <span class="label">Fecha de actualización (opcional)</span>
            <input class="input" type="date" value={form.updatedAt} onInput={(e) => set('updatedAt', (e.target as HTMLInputElement).value)} />
          </label>
        </div>

        <fieldset class="adm-fieldset adm-checks">
          <legend class="label">Modelos relacionados (se muestran al final del artículo)</legend>
          {catalog.products.map((p) => (
            <label class="adm-check" key={p.data.slug}>
              <input type="checkbox" checked={form.relatedProducts.includes(p.data.slug)} onChange={(e) => toggleRelated(p.data.slug, (e.target as HTMLInputElement).checked)} /> {p.data.name}
              {p.data.hidden && <span class="badge adm-badge-hidden">Oculto</span>}
            </label>
          ))}
        </fieldset>

        <fieldset class="adm-fieldset" data-admin-post-image>
          <legend class="label">Foto del artículo (opcional)</legend>
          <p class="hint">
            Las fotos no se suben desde el panel: se envían a Diego, que las convierte a webp y las coloca en <code>src/assets/blog/</code>. Aquí solo se escribe su ruta, p. ej.{' '}
            <code>~/assets/blog/{form.slug || '<slug>'}.webp</code>, con el ancho y alto reales en píxeles.
          </p>
          {form.image ? (
            <>
              <ImageFields value={form.image} onChange={(image) => set('image', image)} label="Foto" placeholder={`~/assets/blog/${form.slug || '<slug>'}.webp`} />
              <div>
                <button type="button" class="btn btn--ghost btn--sm adm-btn-danger" onClick={() => set('image', undefined)}>
                  Quitar foto
                </button>
              </div>
            </>
          ) : (
            <div>
              <button type="button" class="btn btn--secondary btn--sm" onClick={() => set('image', { src: `~/assets/blog/${form.slug}.webp`, alt: '', width: 1600, height: 900 })} data-admin-add-image>
                Añadir foto (por ruta)
              </button>
            </div>
          )}
        </fieldset>

        <label class="field">
          <span class="label">Texto del artículo (Markdown)</span>
          <span class="hint" id={`${uid}-md`}>
            <code>## Título de sección</code> · <code>**negrita**</code> · <code>*cursiva*</code> · listas con <code>- </code> o <code>1. </code> · enlaces <code>[texto](/repuestos)</code> · línea en blanco entre párrafos.
            Precios en soles (S/), nunca € ni IVA.
          </span>
          <textarea class="textarea adm-body" value={form.body} onInput={(e) => set('body', (e.target as HTMLTextAreaElement).value)} aria-describedby={`${uid}-md`} spellcheck required />
          <span class="hint">
            {words} palabras · {minutes} min de lectura (se calcula solo)
          </span>
        </label>

        <label class="field">
          <span class="label">Motivo (opcional)</span>
          <input class="input" maxLength={120} value={reason} onInput={(e) => setReason((e.target as HTMLInputElement).value)} placeholder="Queda en el historial de cambios" />
        </label>

        {errors.length > 0 && (
          <div class="adm-errors" role="alert" tabIndex={-1} ref={errorsRef}>
            <strong>No se ha guardado:</strong>
            <ul>
              {errors.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <div class="adm-form__actions">
          <button type="button" class="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" class="btn btn--primary" disabled={saving} aria-disabled={stale || undefined}>
            {saving ? 'Guardando…' : creating ? 'Publicar artículo' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
