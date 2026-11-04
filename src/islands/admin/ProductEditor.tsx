import { useEffect, useId, useRef, useState } from 'preact/hooks';
import type { CatalogEntry } from '../../domain/admin';
import type { Availability, CategorySlug, ImageRef, Product, ProductColor, ProductVariant, VariantTier } from '../../domain/types';
import { parseSoles } from '../../domain/money';
import { availabilityLabel, tierLabel } from '../../domain/product';
import { productRules } from '../../domain/catalogRules';
import { normalizeYouTubeUrl } from '../../domain/video';
import { AdminApiError } from '../../services/admin/AdminApiClient';
import { centsToInput, STALE_EDITOR_MESSAGE, useAdmin } from './context';
import ImageFields from './ImageFields';
import Modal from './Modal';
import PdfUpload from './PdfUpload';

interface Props {
  /** Edición: entrada existente (PUT con sha) */
  entry?: CatalogEntry<Product>;
  /** Creación: ficha duplicada (PUT sin sha) */
  draft?: Product;
  onClose: () => void;
}

interface VariantForm {
  id: string;
  name: string;
  tier: VariantTier;
  price: string;
  availability: Availability;
  sku: string;
  description: string;
  /** Resto de la variante (specsOverride…) que el formulario no edita */
  extra: Record<string, unknown>;
}
interface ColorForm {
  id: string;
  name: string;
  hex: string;
  /** Foto de ese color (ruta webp en src/assets/products); opcional */
  image: ImageRef | undefined;
  extra: Record<string, unknown>;
}
interface Form {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  claim: string;
  description: string;
  category: CategorySlug;
  brand: string;
  featured: string;
  isNew: boolean;
  isHero: boolean;
  hidden: boolean;
  publishedAt: string;
  /** Manual de uso (PDF): `/docs/<slug>-manual.pdf` o https:// */
  manualUrl: string;
  /** Ficha técnica (PDF) */
  datasheetUrl: string;
  /** Video de YouTube (se normaliza a watch?v=) */
  videoUrl: string;
  /** Galería de la ficha (al menos una); rutas ~/assets/products/<slug>-<color>.webp subidas antes por git */
  images: ImageRef[];
  variants: VariantForm[];
  defaultIndex: number;
  colors: ColorForm[];
  advanced: string;
}

const MAIN_KEYS = new Set(['id', 'slug', 'name', 'subtitle', 'claim', 'description', 'category', 'brand', 'featured', 'isNew', 'isHero', 'hidden', 'publishedAt', 'manualUrl', 'datasheetUrl', 'videoUrl', 'images', 'variants', 'colors']);

/** Misma regla que `safeUrl` del esquema para rutas del sitio y https (sin ~/assets, que no aplica a documentos). */
const DOC_URL_RE = /^(\/(?!\/)|https:\/\/)/;
/** `safeUrl` del esquema: assets del repo, rutas del sitio o https */
const IMAGE_URL_RE = /^(~\/assets\/|\/(?!\/)|https:\/\/)/;

const emptyImage = (src = ''): ImageRef => ({ src, alt: '', width: 0, height: 0 });

/** Errores de una imagen del formulario (misma regla que `image` del esquema, con mensajes para el panel) */
function imageErrors(img: ImageRef, label: string): string[] {
  const errs: string[] = [];
  if (!img.src.trim()) errs.push(`${label}: falta la ruta de la foto`);
  else if (!IMAGE_URL_RE.test(img.src.trim())) errs.push(`${label}: la ruta debe empezar por ~/assets/ (p. ej. ~/assets/products/<slug>-<color>.webp), / o https://`);
  if (!img.alt.trim()) errs.push(`${label}: falta el texto alternativo`);
  if (!Number.isInteger(img.width) || img.width <= 0 || !Number.isInteger(img.height) || img.height <= 0) errs.push(`${label}: ancho y alto deben ser enteros mayores que 0 (píxeles reales de la foto)`);
  return errs;
}

const cleanImage = (img: ImageRef): ImageRef => ({ src: img.src.trim(), alt: img.alt.trim(), width: img.width, height: img.height });
const CATEGORIES: CategorySlug[] = ['bicimotos', 'trimotos', 'promociones'];
const TIERS: VariantTier[] = ['estandar', 'premium'];
const AVAILABILITIES: Availability[] = ['en-stock', 'bajo-pedido', 'proximamente', 'agotado'];

function toForm(p: Product): Form {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (!MAIN_KEYS.has(k)) rest[k] = v;
  const defaultIndex = Math.max(0, p.variants.findIndex((v) => v.isDefault));
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    subtitle: p.subtitle,
    claim: p.claim,
    description: p.description,
    category: p.category,
    brand: p.brand,
    featured: String(p.featured),
    isNew: p.isNew === true,
    isHero: p.isHero === true,
    hidden: p.hidden === true,
    publishedAt: p.publishedAt,
    manualUrl: p.manualUrl ?? '',
    datasheetUrl: p.datasheetUrl ?? '',
    videoUrl: p.videoUrl ?? '',
    images: p.images.map((i) => ({ ...i })),
    variants: p.variants.map(({ id, name, tier, price, availability, sku, description, isDefault: _d, ...extra }) => ({
      id,
      name,
      tier,
      price: centsToInput(price.amount),
      availability,
      sku: sku ?? '',
      description: description ?? '',
      extra,
    })),
    defaultIndex,
    colors: p.colors.map(({ id, name, hex, image, ...extra }) => ({ id, name, hex, image: image ? { ...image } : undefined, extra })),
    advanced: JSON.stringify(rest, null, 2),
  };
}

/** Formulario → Product (orden de claves estable para el JSON del repo). Devuelve errores locales si no se puede montar. */
function fromForm(f: Form): { product: Product } | { errors: string[] } {
  const errors: string[] = [];
  let adv: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(f.advanced || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('debe ser un objeto {…}');
    adv = parsed as Record<string, unknown>;
  } catch (e) {
    return { errors: [`JSON avanzado no válido: ${(e as Error).message}`] };
  }
  for (const k of Object.keys(adv)) if (MAIN_KEYS.has(k)) errors.push(`JSON avanzado: el campo "${k}" se edita en el formulario, quítalo del JSON`);
  if (!f.images.length) errors.push('debe haber al menos una foto en "Fotos del producto"');
  f.images.forEach((img, i) => errors.push(...imageErrors(img, `foto ${i + 1}`)));
  for (const c of f.colors) if (c.image && (c.image.src.trim() || c.image.alt.trim())) errors.push(...imageErrors(c.image, `foto del color ${c.name || c.id}`));
  const specs = adv.specs as { battery?: unknown } | undefined;
  if (!specs || typeof specs !== 'object' || !specs.battery || typeof specs.battery !== 'object') errors.push('JSON avanzado: falta "specs" con "battery"');

  if (!f.variants.length) errors.push('debe haber al menos una variante');
  const variants: ProductVariant[] = f.variants.map((v, i) => {
    const cents = parseSoles(v.price);
    if (cents === null) errors.push(`variante ${v.id || i + 1}: precio no válido ("${v.price}")`);
    const out: ProductVariant = {
      id: v.id.trim(),
      name: v.name.trim(),
      tier: v.tier,
      ...(v.description.trim() ? { description: v.description.trim() } : {}),
      price: { amount: cents ?? 0, currency: 'PEN' },
      ...(v.extra as Partial<ProductVariant>),
      availability: v.availability,
      ...(v.sku.trim() ? { sku: v.sku.trim() } : {}),
      ...(i === f.defaultIndex ? { isDefault: true } : {}),
    };
    return out;
  });
  const colors: ProductColor[] = f.colors.map((c) => ({
    id: c.id.trim(),
    name: c.name.trim(),
    hex: c.hex.trim(),
    ...(c.image && c.image.src.trim() ? { image: cleanImage(c.image) } : {}),
    ...(c.extra as Partial<ProductColor>),
  }));
  const featured = Number(f.featured);
  if (!Number.isFinite(featured)) errors.push('featured debe ser un número');
  for (const [k, v] of [
    ['name', f.name],
    ['subtitle', f.subtitle],
    ['claim', f.claim],
    ['description', f.description],
    ['brand', f.brand],
    ['publishedAt', f.publishedAt],
  ] as const)
    if (!v.trim()) errors.push(`${k} es obligatorio`);
  const manualUrl = f.manualUrl.trim();
  const datasheetUrl = f.datasheetUrl.trim();
  if (manualUrl && !DOC_URL_RE.test(manualUrl)) errors.push('Manual de uso (PDF): la URL debe empezar por / (p. ej. /docs/golden-eagle-manual.pdf) o https://');
  if (datasheetUrl && !DOC_URL_RE.test(datasheetUrl)) errors.push('Ficha técnica (PDF): la URL debe empezar por / (p. ej. /docs/golden-eagle-ficha.pdf) o https://');
  const videoUrl = f.videoUrl.trim() ? normalizeYouTubeUrl(f.videoUrl) : '';
  if (videoUrl === null) errors.push('Video de YouTube: pega un enlace de youtube.com/watch?v=…, youtu.be/… o youtube.com/shorts/…');
  if (errors.length) return { errors };

  const out: Record<string, unknown> = {
    id: f.id.trim(),
    slug: f.slug.trim(),
    name: f.name.trim(),
    subtitle: f.subtitle.trim(),
    claim: f.claim.trim(),
    description: f.description.trim(),
    category: f.category,
    brand: f.brand.trim(),
  };
  // Solo claves propias (Object.hasOwn), nunca `in`: con `in`, "__proto__"/"constructor"/"toString" del JSON
  // avanzado se resolverían por la cadena de prototipos (se perderían o se asignarían al prototipo).
  out.images = f.images.map(cleanImage);
  for (const k of ['heroImage', 'specs']) if (Object.hasOwn(adv, k)) out[k] = adv[k];
  out.variants = variants;
  out.colors = colors;
  for (const k of ['accessories', 'related', 'useCases', 'highlights', 'technology', 'faqs', 'reviews']) if (Object.hasOwn(adv, k)) out[k] = adv[k];
  out.featured = featured;
  if (f.isNew) out.isNew = true;
  if (f.isHero) out.isHero = true;
  out.publishedAt = f.publishedAt.trim();
  for (const [k, v] of Object.entries(adv)) if (k !== '__proto__' && !Object.hasOwn(out, k)) out[k] = v;
  // Documentos y video: campos propios del formulario; vacío = sin clave en el JSON
  if (datasheetUrl) out.datasheetUrl = datasheetUrl;
  if (manualUrl) out.manualUrl = manualUrl;
  if (videoUrl) out.videoUrl = videoUrl;
  if (f.hidden) out.hidden = true;
  return { product: out as unknown as Product };
}

/** Editor de ficha completa de producto (solo admin): campos principales + JSON avanzado. */
export default function ProductEditor({ entry, draft, onClose }: Props) {
  const { api, catalog, applyWrite, handleError } = useAdmin();
  const creating = !entry;
  const source = entry?.data ?? draft;
  if (!source) return null;
  const [form, setForm] = useState<Form>(() => toForm(source));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // Tras un 409 el catálogo se recarga, pero este formulario sigue partiendo de la versión antigua:
  // volver a guardar pisaría en silencio el cambio de la otra persona. Se bloquea hasta reabrir.
  const [stale, setStale] = useState(false);
  const uid = useId();
  const errorsRef = useRef<HTMLDivElement>(null);

  // Resumen de errores con foco al enviar (docs/12 §6): se anuncia y el teclado llega a él
  useEffect(() => {
    if (errors.length) errorsRef.current?.focus();
  }, [errors]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setVariant = (i: number, patch: Partial<VariantForm>) => setForm((f) => ({ ...f, variants: f.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));
  const setColor = (i: number, patch: Partial<ColorForm>) => setForm((f) => ({ ...f, colors: f.colors.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  const submit = async (e: Event) => {
    e.preventDefault();
    if (saving || stale) return;
    const built = fromForm(form);
    if ('errors' in built) return setErrors(built.errors);
    const ctx = {
      productSlugs: catalog.products.map((p) => p.data.slug).filter((s) => s !== built.product.slug),
      partSlugs: catalog.repuestos.map((p) => p.data.slug),
    };
    const ruleErrors = productRules(built.product, ctx);
    if (ruleErrors.length) return setErrors(ruleErrors);
    setSaving(true);
    setErrors([]);
    try {
      const result = await api.put('products', built.product.slug, {
        ...(entry ? { sha: entry.sha } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        data: built.product,
      });
      applyWrite('products', result);
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
    <Modal title={creating ? `Nuevo producto: ${form.name}` : `Editar ficha: ${source.name}`} onClose={onClose} wide>
      <form class="adm-form" onSubmit={submit} data-admin-editor="product" noValidate>
        <div class="adm-form__grid">
          <label class="field">
            <span class="label">Slug (URL)</span>
            <input class="input" value={form.slug} readOnly aria-describedby={`${uid}-slug`} />
            <span id={`${uid}-slug`} class="hint">
              /{form.category}/{form.slug}
            </span>
          </label>
          <label class="field">
            <span class="label">Id</span>
            <input class="input" value={form.id} onInput={(e) => set('id', (e.target as HTMLInputElement).value)} required />
          </label>
          <label class="field">
            <span class="label">Nombre</span>
            <input class="input" value={form.name} onInput={(e) => set('name', (e.target as HTMLInputElement).value)} required />
          </label>
          <label class="field">
            <span class="label">Subtítulo</span>
            <input class="input" value={form.subtitle} onInput={(e) => set('subtitle', (e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span class="label">Claim</span>
            <input class="input" value={form.claim} onInput={(e) => set('claim', (e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span class="label">Marca</span>
            <input class="input" value={form.brand} onInput={(e) => set('brand', (e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span class="label">Categoría</span>
            <select class="select" value={form.category} onChange={(e) => set('category', (e.target as HTMLSelectElement).value as CategorySlug)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label class="field">
            <span class="label">Orden en Recomendados (featured)</span>
            <input class="input" type="number" value={form.featured} onInput={(e) => set('featured', (e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span class="label">Fecha de publicación</span>
            <input class="input" type="date" value={form.publishedAt} onInput={(e) => set('publishedAt', (e.target as HTMLInputElement).value)} />
          </label>
          <label class="field adm-form__full">
            <span class="label">Descripción</span>
            <textarea class="textarea" value={form.description} onInput={(e) => set('description', (e.target as HTMLTextAreaElement).value)} />
          </label>
        </div>

        <fieldset class="adm-fieldset adm-checks">
          <legend class="label">Opciones</legend>
          <label class="adm-check">
            <input type="checkbox" checked={form.isNew} onChange={(e) => set('isNew', (e.target as HTMLInputElement).checked)} /> Nuevo (isNew)
          </label>
          <label class="adm-check">
            <input type="checkbox" checked={form.isHero} onChange={(e) => set('isHero', (e.target as HTMLInputElement).checked)} /> Modelo de portada (isHero, solo uno)
          </label>
          <label class="adm-check">
            <input type="checkbox" checked={form.hidden} onChange={(e) => set('hidden', (e.target as HTMLInputElement).checked)} /> Oculto (no aparece en la web)
          </label>
        </fieldset>

        <fieldset class="adm-fieldset">
          <legend class="label">Versiones (variantes)</legend>
          {form.variants.map((v, i) => (
            <div class="adm-variant" key={i}>
              <div class="adm-form__grid adm-form__grid--tight">
                <label class="field">
                  <span class="label">Id</span>
                  <input class="input" value={v.id} onInput={(e) => setVariant(i, { id: (e.target as HTMLInputElement).value })} required />
                </label>
                <label class="field">
                  <span class="label">Nombre</span>
                  <input class="input" value={v.name} onInput={(e) => setVariant(i, { name: (e.target as HTMLInputElement).value })} required />
                </label>
                <label class="field">
                  <span class="label">Versión (tier)</span>
                  <select class="select" value={v.tier} onChange={(e) => setVariant(i, { tier: (e.target as HTMLSelectElement).value as VariantTier })}>
                    {TIERS.map((t) => (
                      <option key={t} value={t}>
                        {tierLabel[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <label class="field">
                  <span class="label">Precio (soles)</span>
                  <input class="input" inputMode="decimal" value={v.price} onInput={(e) => setVariant(i, { price: (e.target as HTMLInputElement).value })} required />
                </label>
                <label class="field">
                  <span class="label">Disponibilidad</span>
                  <select class="select" value={v.availability} onChange={(e) => setVariant(i, { availability: (e.target as HTMLSelectElement).value as Availability })}>
                    {AVAILABILITIES.map((a) => (
                      <option key={a} value={a}>
                        {availabilityLabel[a]}
                      </option>
                    ))}
                  </select>
                </label>
                <label class="field">
                  <span class="label">SKU</span>
                  <input class="input" value={v.sku} onInput={(e) => setVariant(i, { sku: (e.target as HTMLInputElement).value })} />
                </label>
                <label class="field adm-form__full">
                  <span class="label">Descripción corta</span>
                  <input class="input" value={v.description} onInput={(e) => setVariant(i, { description: (e.target as HTMLInputElement).value })} />
                </label>
              </div>
              <div class="adm-variant__foot">
                <label class="adm-check">
                  <input type="radio" name={`${uid}-default`} checked={form.defaultIndex === i} onChange={() => set('defaultIndex', i)} /> Versión por defecto
                </label>
                <button
                  type="button"
                  class="btn btn--ghost btn--sm adm-btn-danger"
                  disabled={form.variants.length <= 1}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      variants: f.variants.filter((_, j) => j !== i),
                      defaultIndex: f.defaultIndex === i ? 0 : f.defaultIndex > i ? f.defaultIndex - 1 : f.defaultIndex,
                    }))
                  }
                >
                  Quitar versión
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            class="btn btn--secondary btn--sm"
            disabled={form.variants.length >= 2}
            onClick={() =>
              setForm((f) => ({
                ...f,
                variants: [...f.variants, { id: 'premium', name: 'Premium', tier: 'premium', price: '', availability: 'en-stock', sku: '', description: '', extra: {} }],
              }))
            }
          >
            Añadir versión
          </button>
        </fieldset>

        <fieldset class="adm-fieldset">
          <legend class="label">Colores</legend>
          {form.colors.map((c, i) => (
            <div class="adm-color" key={i}>
              <label class="field">
                <span class="label">Id</span>
                <input class="input" value={c.id} onInput={(e) => setColor(i, { id: (e.target as HTMLInputElement).value })} required />
              </label>
              <label class="field">
                <span class="label">Nombre</span>
                <input class="input" value={c.name} onInput={(e) => setColor(i, { name: (e.target as HTMLInputElement).value })} required />
              </label>
              <label class="field">
                <span class="label">Hex</span>
                <span class="adm-color__hex">
                  <input type="color" value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#000000'} onInput={(e) => setColor(i, { hex: (e.target as HTMLInputElement).value })} aria-label={`Selector de color ${c.name || i + 1}`} />
                  {/* El <label> envolvente solo nombra al primer control (el selector): este campo necesita nombre propio */}
                  <input class="input" value={c.hex} onInput={(e) => setColor(i, { hex: (e.target as HTMLInputElement).value })} aria-label={`Hex del color ${c.name || i + 1}`} />
                </span>
              </label>
              <button type="button" class="btn btn--ghost btn--sm adm-btn-danger" onClick={() => setForm((f) => ({ ...f, colors: f.colors.filter((_, j) => j !== i) }))} aria-label={`Quitar color ${c.name}`}>
                Quitar
              </button>
              <div class="adm-color__image">
                {c.image ? (
                  <>
                    <ImageFields value={c.image} onChange={(image) => setColor(i, { image })} label={`Foto del color ${c.name || i + 1}`} placeholder={`~/assets/products/${form.slug}-${c.id || '<color>'}.webp`} />
                    <button type="button" class="btn btn--ghost btn--sm" onClick={() => setColor(i, { image: undefined })}>
                      Sin foto propia para {c.name || 'este color'}
                    </button>
                  </>
                ) : (
                  <button type="button" class="btn btn--ghost btn--sm" onClick={() => setColor(i, { image: emptyImage(`~/assets/products/${form.slug}-${c.id}.webp`) })}>
                    Añadir foto del color {c.name || i + 1} (por ruta)
                  </button>
                )}
              </div>
            </div>
          ))}
          <button type="button" class="btn btn--secondary btn--sm" onClick={() => setForm((f) => ({ ...f, colors: [...f.colors, { id: '', name: '', hex: '#111111', image: undefined, extra: {} }] }))}>
            Añadir color
          </button>
        </fieldset>

        <fieldset class="adm-fieldset" data-admin-images>
          <legend class="label">Fotos del producto</legend>
          <p class="hint">
            Las fotos no se suben desde el panel: se envían a Diego, que las convierte a webp y las coloca en <code>src/assets/products/</code> como{' '}
            <code>{form.slug}-&lt;color&gt;.webp</code>. Aquí solo se escribe la ruta de cada una con su texto alternativo y sus píxeles reales. Si todavía no existen, guarda la ficha como{' '}
            <strong>Oculto</strong> y muéstrala cuando estén (una ruta inexistente hace fallar la publicación).
          </p>
          {form.images.map((img, i) => (
            <div class="adm-image-row" key={i}>
              <ImageFields value={img} onChange={(next) => setForm((f) => ({ ...f, images: f.images.map((x, j) => (j === i ? next : x)) }))} label={`Foto ${i + 1}`} placeholder={`~/assets/products/${form.slug}-<color>.webp`} />
              <button
                type="button"
                class="btn btn--ghost btn--sm adm-btn-danger"
                disabled={form.images.length <= 1}
                onClick={() => setForm((f) => ({ ...f, images: f.images.filter((_, j) => j !== i) }))}
                aria-label={`Quitar foto ${i + 1}`}
              >
                Quitar foto
              </button>
            </div>
          ))}
          <button type="button" class="btn btn--secondary btn--sm" onClick={() => setForm((f) => ({ ...f, images: [...f.images, emptyImage(`~/assets/products/${f.slug}-`)] }))} data-admin-add-image>
            Añadir foto (por ruta)
          </button>
        </fieldset>

        <fieldset class="adm-fieldset" data-admin-docs>
          <legend class="label">Manual, ficha técnica y video</legend>
          <p class="hint">
            Los PDF se guardan en <code>public/docs/</code> y se enlazan como <code>/docs/&lt;slug&gt;-manual.pdf</code> o <code>-ficha.pdf</code>; "Subir PDF" lo hace solo (un commit por
            fichero). Sin URL, la pestaña de la ficha muestra "Disponible próximamente".
          </p>
          <div class="adm-form__grid">
            <div class="adm-url-row adm-form__full">
              <label class="field">
                <span class="label">Manual de uso (PDF)</span>
                <input class="input" value={form.manualUrl} onInput={(e) => set('manualUrl', (e.target as HTMLInputElement).value)} placeholder={`/docs/${form.slug}-manual.pdf`} inputMode="url" spellcheck={false} data-admin-field="manualUrl" />
              </label>
              <PdfUpload slug={form.slug} suffix="manual" onUploaded={(ref) => set('manualUrl', ref)} />
            </div>
            <div class="adm-url-row adm-form__full">
              <label class="field">
                <span class="label">Ficha técnica (PDF)</span>
                <input class="input" value={form.datasheetUrl} onInput={(e) => set('datasheetUrl', (e.target as HTMLInputElement).value)} placeholder={`/docs/${form.slug}-ficha.pdf`} inputMode="url" spellcheck={false} data-admin-field="datasheetUrl" />
              </label>
              <PdfUpload slug={form.slug} suffix="ficha" onUploaded={(ref) => set('datasheetUrl', ref)} />
            </div>
            <label class="field adm-form__full">
              <span class="label">Video de YouTube</span>
              <input class="input" value={form.videoUrl} onInput={(e) => set('videoUrl', (e.target as HTMLInputElement).value)} placeholder="https://www.youtube.com/watch?v=… o https://youtu.be/…" inputMode="url" spellcheck={false} data-admin-field="videoUrl" />
              <span class="hint">Vale el enlace de youtube.com/watch, youtu.be o shorts; se guarda en forma normalizada. Sin video, la pestaña anuncia el lanzamiento en el canal.</span>
            </label>
          </div>
        </fieldset>

        <label class="field">
          <span class="label">JSON avanzado</span>
          <span class="hint">specs, heroImage, accessories, related, useCases, highlights, technology, faqs, seo… Se fusiona con el formulario al guardar.</span>
          <textarea class="textarea adm-json" spellcheck={false} value={form.advanced} onInput={(e) => set('advanced', (e.target as HTMLTextAreaElement).value)} />
        </label>

        <label class="field">
          <span class="label">Motivo (opcional)</span>
          <input class="input" maxLength={120} value={reason} onInput={(e) => setReason((e.target as HTMLInputElement).value)} placeholder="Queda en el historial de cambios" />
        </label>

        {errors.length > 0 && (
          <div class="adm-errors" role="alert" tabIndex={-1} ref={errorsRef}>
            <strong>No se ha guardado:</strong>
            <ul>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div class="adm-form__actions">
          <button type="button" class="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" class="btn btn--primary" disabled={saving} aria-disabled={stale || undefined}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
