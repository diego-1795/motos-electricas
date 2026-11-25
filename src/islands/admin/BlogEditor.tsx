import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import type { BlogEntry, BlogFrontmatter, BlogWriteResult } from '../../domain/admin';
import type { BlogPost, ImageRef } from '../../domain/types';
import { blogRules, descriptionLength, DESCRIPTION_MAX, slugify, uniqueSlug } from '../../domain/blogRules';
import { isValidSlug } from '../../domain/catalogRules';
import { countWords, readingMinutes } from '../../domain/reading';
import { blogHtmlToText } from '../../domain/blogHtml';
import { markdownToHtml } from '../../domain/markdownLite';
import { blogCategoryLabel } from '../../lib/labels';
import { AdminApiError } from '../../services/admin/AdminApiClient';
import { STALE_EDITOR_MESSAGE, useAdmin } from './context';
import ImageFields from './ImageFields';
import Modal from './Modal';
import ArticlePreview from './ArticlePreview';

interface Props {
  /** Edición: artículo cargado del repositorio (PUT con sha). Sin él: artículo nuevo (PUT sin sha). */
  entry?: BlogEntry;
  /** Direcciones ya usadas por otros artículos: la de uno nuevo se elige libre a partir del título */
  takenSlugs?: string[];
  onClose: () => void;
  /** outcome: 'draft' (borrador que no estaba publicado), 'unpublished' (publicado → borrador) o 'published' */
  onSaved: (result: BlogWriteResult, outcome: SaveOutcome) => void;
}

export type SaveOutcome = 'draft' | 'unpublished' | 'published';

/** Copia local del formulario sin guardar (ADR-029): sobrevive a cerrar el diálogo, recargar o que caduque la sesión. */
interface LocalCopy {
  form: Form;
  savedAt: string;
  /** sha del artículo cuando se empezó a editar (null = artículo nuevo) */
  baseSha: string | null;
}

const LOCAL_PREFIX = 'raiden:admin:blog-borrador:v1';
const localKey = (username: string, slug: string | undefined) => `${LOCAL_PREFIX}:${username}:${slug ?? 'nuevo'}`;

function readLocal(key: string): LocalCopy | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as LocalCopy;
    return v && typeof v === 'object' && v.form && typeof v.form.body === 'string' ? v : null;
  } catch {
    return null;
  }
}
function writeLocal(key: string, copy: LocalCopy | null): void {
  try {
    if (copy) localStorage.setItem(key, JSON.stringify(copy));
    else localStorage.removeItem(key);
  } catch {
    /* almacenamiento lleno o bloqueado: el autoguardado es una ayuda, no imprescindible */
  }
}
const sameForm = (a: Form, b: Form): boolean => JSON.stringify(a) === JSON.stringify(b);

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
    // Los artículos en Markdown (anteriores al editor visual) se abren convertidos a HTML (ADR-031)
    body: !entry ? '' : fm?.format === 'html' ? entry.body.trim() : markdownToHtml(entry.body),
  };
}

function fromForm(f: Form, entry: BlogEntry | undefined, draft: boolean): { frontmatter: BlogFrontmatter; body: string } {
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
    ...(draft ? { draft: true } : {}),
  };
  return { frontmatter: { ...frontmatter, format: 'html' }, body: f.body.replace(/\r\n?/g, '\n').trim() };
}

/**
 * Editor de un artículo del blog (ADR-023, ADR-026, ADR-027): frontmatter como campos, foto por ruta
 * (`~/assets/blog/<nombre>.webp`, subida antes por git; solo el admin) y cuerpo con barra de formato y
 * vista previa. La dirección (slug) solo la ve el admin; para el editor sale sola del título. Las
 * mismas reglas que el servidor (blogRules) se comprueban antes de enviar.
 */
export default function BlogEditor({ entry, takenSlugs = [], onClose, onSaved }: Props) {
  const { api, catalog, handleError, user } = useAdmin();
  /** ADR-026: el editor escribe artículos, pero las fotos las pone el administrador */
  const canEditImage = user.role === 'admin';
  /** ADR-027: la dirección del artículo (slug) es un detalle técnico; el editor no la ve */
  const showSlug = user.role === 'admin';
  const creating = !entry;
  // El editor visual (Tiptap, ~100 KB) se carga solo al abrir un artículo: el resto del panel no lo paga
  const [editorKey, setEditorKey] = useState(0);
  /** Vista previa de la página completa (ADR-036). El formulario se oculta, no se desmonta: el editor conserva texto y deshacer */
  const [preview, setPreview] = useState(false);
  const previewTop = useRef<HTMLDivElement>(null);
  const [Visual, setVisual] = useState<typeof import('./editor/VisualEditor').default | null>(null);
  useEffect(() => {
    let alive = true;
    void import('./editor/VisualEditor').then((m) => {
      if (alive) setVisual(() => m.default);
    });
    return () => {
      alive = false;
    };
  }, []);
  /** Borrador o nuevo: botones "Guardar borrador" / "Publicar artículo". Publicado: "Pasar a borrador" / "Guardar cambios" (ADR-029) */
  const wasDraft = creating || entry.frontmatter.draft === true;
  const initial = useMemo(() => toForm(entry), [entry]);
  const key = localKey(user.username, entry?.slug);
  const [form, setForm] = useState<Form>(initial);
  // Copia local pendiente de decidir (Recuperar / Descartar): mientras tanto no se sobrescribe
  const [recover, setRecover] = useState<LocalCopy | null>(() => {
    const c = readLocal(key);
    return c && !sameForm(c.form, initial) ? c : null;
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const uid = useId();
  const errorsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errors.length) errorsRef.current?.focus();
  }, [errors]);

  // Autoguardado local (ADR-029): medio segundo después de cada cambio
  useEffect(() => {
    if (recover) return;
    const t = setTimeout(() => writeLocal(key, sameForm(form, initial) ? null : { form, savedAt: new Date().toISOString(), baseSha: entry?.sha ?? null }), 500);
    return () => clearTimeout(t);
  }, [form, recover, key, initial, entry]);

  const restore = () => {
    if (!recover) return;
    // El editor visual solo lee su valor al montarse: se vuelve a montar con el texto recuperado
    setEditorKey((k) => k + 1);
    // La dirección de un artículo existente no cambia aunque la copia sea antigua
    setForm(entry ? { ...recover.form, slug: entry.slug, slugTouched: true } : recover.form);
    setRecover(null);
  };
  const discard = () => {
    writeLocal(key, null);
    setRecover(null);
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setTitle = (title: string) => setForm((f) => ({ ...f, title, slug: f.slugTouched ? f.slug : uniqueSlug(slugify(title), takenSlugs) }));
  const toggleRelated = (slug: string, on: boolean) =>
    setForm((f) => ({ ...f, relatedProducts: on ? [...f.relatedProducts.filter((s) => s !== slug), slug] : f.relatedProducts.filter((s) => s !== slug) }));

  const plainText = blogHtmlToText(form.body);
  const minutes = readingMinutes(plainText);
  const words = countWords(plainText);

  // Enter en un campo no publica nada: solo los botones guardan (un borrador no debe publicarse por accidente)
  const submit = (e: Event) => e.preventDefault();

  const save = async (asDraft: boolean) => {
    if (saving || stale) return;
    const slug = form.slug.trim();
    // Al publicar un borrador cuya fecha nadie tocó, la fecha de publicación pasa a ser hoy
    const today = dateOnly(todayIso());
    const f = !asDraft && entry && wasDraft && form.publishedAt === dateOnly(entry.frontmatter.publishedAt) && form.publishedAt < today ? { ...form, publishedAt: today } : form;
    const local: string[] = [];
    if (creating && !isValidSlug(slug)) local.push('La dirección solo puede llevar minúsculas sin tildes, números y guiones (p. ej. como-elegir-una-bicimoto)');
    if (creating && showSlug && takenSlugs.includes(slug)) local.push(`Ya hay un artículo con la dirección /blog/${slug}: elige otra`);
    const built = fromForm(f, entry, asDraft);
    local.push(...blogRules(slug, built.frontmatter, built.body, { productSlugs: catalog.products.map((p) => p.data.slug) }));
    // Sin campo de dirección a la vista, sus errores se explican por el título
    if (!showSlug) {
      const rest = local.filter((m) => !m.startsWith('La dirección'));
      if (rest.length !== local.length && built.frontmatter.title) rest.unshift('El título necesita al menos una letra o un número');
      local.splice(0, local.length, ...rest);
    }
    if (local.length) return setErrors(local);
    setSaving(true);
    setErrors([]);
    try {
      const result = await api.blogPut(slug, {
        ...(entry ? { sha: entry.sha } : {}),
        frontmatter: built.frontmatter,
        body: built.body,
      });
      writeLocal(key, null);
      onSaved(result, asDraft ? (wasDraft ? 'draft' : 'unpublished') : 'published');
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
        {recover && (
          <div class="adm-recover" role="status" data-admin-recover>
            <p>
              <strong>Tienes un texto sin guardar de este artículo</strong> (del {new Date(recover.savedAt).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}).
              {entry && recover.baseSha !== entry.sha && ' Ojo: el artículo ha cambiado desde entonces; revisa antes de guardar.'}
            </p>
            <div class="adm-recover__actions">
              <button type="button" class="btn btn--primary btn--sm" onClick={restore} data-admin-recover-yes>
                Recuperar
              </button>
              <button type="button" class="btn btn--ghost btn--sm" onClick={discard} data-admin-recover-no>
                Descartar
              </button>
            </div>
          </div>
        )}
        <div ref={previewTop} />
        {preview && (
          <ArticlePreview
            title={form.title}
            description={form.description}
            categoryLabel={blogCategoryLabel[form.category]}
            publishedAt={form.publishedAt}
            author={form.author}
            minutes={minutes}
            image={form.image}
            body={form.body}
            related={catalog.products.filter((p) => form.relatedProducts.includes(p.data.slug)).map((p) => p.data.name)}
          />
        )}
        <div hidden={preview} class="adm-blog-fields" data-admin-blog-fields>
        <div class="adm-form__grid">
          <label class="field adm-form__full">
            <span class="label">Título</span>
            <input class="input" value={form.title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} required />
          </label>
          {showSlug && (
            <label class="field adm-form__full">
              <span class="label">Dirección del artículo</span>
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
                /blog/{form.slug || '…'}
                {creating ? ' · se propone a partir del título; minúsculas, números y guiones. Después no se puede cambiar.' : ''}
              </span>
            </label>
          )}
          <label class="field adm-form__full">
            <span class="label">Descripción (resumen para Google y la lista del blog)</span>
            <textarea
              class="textarea adm-textarea--short"
              value={form.description}
              onInput={(e) => set('description', (e.target as HTMLTextAreaElement).value)}
              aria-describedby={`${uid}-desc`}
              required
            />
            {(() => {
              // Contador (ADR-037): orienta, no bloquea. No es aria-live para no anunciar cada tecla.
              const d = descriptionLength(form.description);
              return (
                <span id={`${uid}-desc`} class={`hint adm-count adm-count--${d.status}`} data-admin-desc-count={d.status}>
                  <strong>
                    {d.length}/{DESCRIPTION_MAX}
                  </strong>{' '}
                  caracteres · {d.message}
                </span>
              );
            })()}
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
          {!canEditImage ? (
            <p class="hint" data-admin-image-locked>
              {form.image ? `Este artículo tiene foto («${form.image.alt}»). ` : 'Este artículo no tiene foto. '}
              Las fotos las pone el administrador: si quieres añadir o cambiar una, envíasela y dile en qué artículo va.
            </p>
          ) : (
            <p class="hint">
              Las fotos no se suben desde el panel: se convierten a webp y se colocan en <code>src/assets/blog/</code> por git. Aquí solo se escribe su ruta, p. ej.{' '}
              <code>~/assets/blog/{form.slug || '<slug>'}.webp</code>, con el ancho y alto reales en píxeles.
            </p>
          )}
          {!canEditImage ? null : form.image ? (
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

        <div class="field">
          {Visual ? (
            <Visual key={editorKey} id={`${uid}-body`} label="Texto del artículo" value={form.body} onChange={(body: string) => set('body', body)} describedBy={`${uid}-md`} />
          ) : (
            <p class="muted" data-admin-ve-loading>
              Cargando el editor…
            </p>
          )}
          <span class="hint" id={`${uid}-md`}>
            Escribe como en Word: la barra de arriba pone títulos, negrita, colores, listas, tablas, avisos, enlaces y vídeos. Puedes pegar desde Word o Google Docs. Ctrl+Z deshace. Precios en soles (S/).
          </span>
          <span class="hint">
            {words} palabras · {minutes} min de lectura (se calcula solo)
          </span>
        </div>
        </div>


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

        <p class="hint">
          {wasDraft
            ? '"Guardar borrador" lo guarda sin que se vea en la web; "Publicar artículo" lo publica en unos 3 minutos.'
            : 'Este artículo está publicado. "Pasar a borrador" lo retira de la web sin borrarlo.'}{' '}
          Mientras escribes, el texto se guarda solo en este navegador por si cierras sin querer.
        </p>
        <div class="adm-form__actions">
          <button type="button" class="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            class="btn btn--secondary"
            aria-pressed={preview}
            onClick={() => {
              setPreview((p) => !p);
              // Que se vea el principio de la vista previa (o del formulario al volver)
              requestAnimationFrame(() => previewTop.current?.scrollIntoView({ block: 'start' }));
            }}
            disabled={saving}
            data-admin-preview-toggle
          >
            {preview ? 'Volver a editar' : 'Vista previa'}
          </button>
          <button type="button" class="btn btn--secondary" onClick={() => void save(true)} disabled={saving} aria-disabled={stale || undefined} data-admin-save-draft>
            {wasDraft ? 'Guardar borrador' : 'Pasar a borrador'}
          </button>
          <button type="button" class="btn btn--primary" onClick={() => void save(false)} disabled={saving} aria-disabled={stale || undefined} data-admin-publish>
            {saving ? 'Guardando…' : wasDraft ? 'Publicar artículo' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
