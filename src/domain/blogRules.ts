import type { BlogPost } from './types';
import { isValidSlug } from './catalogRules';

/**
 * Reglas de integridad de un artículo del blog que el esquema (tipos) no expresa. Puras:
 * las ejecuta el servidor del panel antes de escribir (ADR-023) y reflejan lo que
 * scripts/validate-content.mjs comprueba en CI sobre src/content/blog/*.md.
 */

export type BlogFrontmatter = Omit<BlogPost, 'slug' | 'readingMinutes'>;

export interface BlogContext {
  /** Slugs de productos existentes (para `relatedProducts`) */
  productSlugs?: string[];
}

/** Imagen de portada: siempre un webp del repo en src/assets/blog (ADR-020, ADR-023). */
export const BLOG_IMAGE_RE = /^~\/assets\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/;

/** Referencias al mercado español que el blog no debe contener (validate:content). */
export const FOREIGN_MARKET_RE = /€|EUR|carnet|\bIVA\b/;

export const MAX_BODY_CHARS = 60_000;

/**
 * Astro renderiza el Markdown con HTML crudo permitido. La CSP frena <script>, javascript: e <iframe> ajenos,
 * pero no <meta http-equiv=refresh>, <style>, <form> o <base>: el cuerpo de un artículo solo admite Markdown.
 * (Se comprueba igual en el panel y en validate:content.)
 */
export const RAW_HTML_RE = /<\s*\/?\s*(script|iframe|object|embed|meta|style|link|base|form|input|button|svg|math|frame|frameset|template|slot|noscript)\b/i;

/** "¿Cómo elegir una bicimoto eléctrica?" → "como-elegir-una-bicimoto-electrica" (slug propuesto para un artículo nuevo). */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/** "precios" ocupado → "precios-2" (o -3…): el editor no elige la dirección, así que nunca choca (ADR-027). */
export function uniqueSlug(base: string, taken: readonly string[]): string {
  if (!base || !taken.includes(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, 80 - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(s) && !Number.isNaN(Date.parse(s));

const REQUIRED = { title: 'El título es obligatorio', description: 'La descripción es obligatoria', author: 'El autor es obligatorio' } as const;

export function blogRules(slug: string, fm: BlogFrontmatter, body: string, ctx: BlogContext = {}): string[] {
  const errs: string[] = [];
  if (!isValidSlug(slug)) errs.push(`La dirección "${slug}" solo puede llevar minúsculas sin tildes, números y guiones (kebab-case)`);
  // Un borrador (ADR-029) puede quedar a medias: solo exige título; las reglas de seguridad y formato siguen
  const draft = fm.draft === true;
  for (const k of ['title', 'description', 'author'] as const) if (!fm[k].trim() && (k === 'title' || !draft)) errs.push(REQUIRED[k]);
  if (!isIsoDate(fm.publishedAt)) errs.push(`La fecha de publicación "${fm.publishedAt}" no es válida`);
  if (fm.updatedAt !== undefined && !isIsoDate(fm.updatedAt)) errs.push(`La fecha de actualización "${fm.updatedAt}" no es válida`);
  if (fm.image) {
    if (!BLOG_IMAGE_RE.test(fm.image.src)) errs.push(`La ruta de la foto debe ser ~/assets/blog/<nombre>.webp (es "${fm.image.src}")`);
    if (!fm.image.alt.trim()) errs.push('La foto necesita un texto alternativo (describe lo que se ve)');
  }
  const seen = new Set<string>();
  for (const r of fm.relatedProducts) {
    if (seen.has(r)) errs.push(`Modelo relacionado repetido: ${r}`);
    seen.add(r);
    if (ctx.productSlugs && !ctx.productSlugs.includes(r)) errs.push(`El modelo relacionado ${r} ya no está en el catálogo`);
  }
  if (!body.trim() && !draft) errs.push('El texto del artículo está vacío');
  if (body.length > MAX_BODY_CHARS) errs.push(`El texto supera los ${MAX_BODY_CHARS} caracteres`);
  if (RAW_HTML_RE.test(body)) errs.push('El texto no puede llevar código HTML (<script>, <iframe>, <style>…): usa solo el formato indicado (## títulos, **negrita**, listas, enlaces)');
  if (/\]\(\s*(javascript|data|vbscript):/i.test(body)) errs.push('Los enlaces solo pueden ir a una web (https://…), a una página de la tienda (/repuestos…) o a un email (mailto:)');
  const text = `${fm.title}\n${fm.description}\n${body}`;
  if (FOREIGN_MARKET_RE.test(text)) errs.push('Habla de España o del euro (€, EUR, carnet, IVA): para Perú usa S/, IGV y licencia');
  return errs;
}
