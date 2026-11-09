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

const isIsoDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(s) && !Number.isNaN(Date.parse(s));

export function blogRules(slug: string, fm: BlogFrontmatter, body: string, ctx: BlogContext = {}): string[] {
  const errs: string[] = [];
  if (!isValidSlug(slug)) errs.push(`slug "${slug}" debe ser kebab-case (a-z, 0-9 y guiones)`);
  for (const k of ['title', 'description', 'author'] as const) if (!fm[k].trim()) errs.push(`${k} es obligatorio`);
  if (!isIsoDate(fm.publishedAt)) errs.push(`publishedAt "${fm.publishedAt}" no es una fecha válida (AAAA-MM-DD o ISO)`);
  if (fm.updatedAt !== undefined && !isIsoDate(fm.updatedAt)) errs.push(`updatedAt "${fm.updatedAt}" no es una fecha válida (AAAA-MM-DD o ISO)`);
  if (fm.image) {
    if (!BLOG_IMAGE_RE.test(fm.image.src)) errs.push(`image.src debe ser ~/assets/blog/<nombre>.webp (es "${fm.image.src}")`);
    if (!fm.image.alt.trim()) errs.push('image.alt es obligatorio (texto alternativo de la foto)');
  }
  const seen = new Set<string>();
  for (const r of fm.relatedProducts) {
    if (seen.has(r)) errs.push(`relatedProducts repetido: ${r}`);
    seen.add(r);
    if (ctx.productSlugs && !ctx.productSlugs.includes(r)) errs.push(`relatedProducts desconocido: ${r}`);
  }
  if (!body.trim()) errs.push('el cuerpo del artículo está vacío');
  if (body.length > MAX_BODY_CHARS) errs.push(`el cuerpo supera los ${MAX_BODY_CHARS} caracteres`);
  if (RAW_HTML_RE.test(body)) errs.push('el cuerpo no puede contener etiquetas HTML (<script>, <iframe>, <meta>, <style>, <form>…): usa solo Markdown');
  if (/\]\(\s*(javascript|data|vbscript):/i.test(body)) errs.push('los enlaces del artículo solo pueden ser http(s), rutas del sitio o mailto:');
  const text = `${fm.title}\n${fm.description}\n${body}`;
  if (FOREIGN_MARKET_RE.test(text)) errs.push('contiene referencias a España/EUR (€, EUR, carnet, IVA): usar S/, IGV, licencia');
  return errs;
}
