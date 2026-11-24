/**
 * Cuerpo de artículo en HTML del editor visual (ADR-031). Puro: lo usan el panel, las Functions y los tests.
 *
 * El editor visual (Tiptap) produce HTML; el fichero sigue siendo `src/content/blog/<slug>.md` con
 * `format: "html"` en el frontmatter, y Astro publica ese HTML tal cual dentro del Markdown. Por eso el
 * servidor solo acepta un subconjunto cerrado (lista blanca de etiquetas, atributos y valores) y una forma
 * fija: un bloque de primer nivel por línea, separados por una línea en blanco, sin texto suelto. Así:
 *  - no puede colarse nada ejecutable (ni <script>, ni on*=, ni style=, ni javascript:);
 *  - el Markdown de Astro trata cada línea como un bloque HTML y no reinterpreta su contenido.
 */

/** Colores de texto permitidos: paleta de la marca (clases tc-*, definidas en base.css) */
export const TEXT_COLORS = ['azul', 'rojo', 'verde', 'gris'] as const;
export type TextColor = (typeof TEXT_COLORS)[number];
export const TEXT_COLOR_LABEL: Record<TextColor, string> = { azul: 'Azul RAIDEN', rojo: 'Rojo', verde: 'Verde', gris: 'Gris' };

/** Cajas de aviso (aside.aviso--*) */
export const CALLOUTS = ['consejo', 'importante'] as const;
export type CalloutKind = (typeof CALLOUTS)[number];
export const CALLOUT_LABEL: Record<CalloutKind, string> = { consejo: 'Consejo', importante: 'Importante' };

const YT_ID = /^[\w-]{11}$/;
export const youtubeWatchUrl = (id: string): string => `https://www.youtube.com/watch?v=${id}`;
export const VIDEO_LINK_TEXT = 'Ver el vídeo en YouTube';

/** Bloques que pueden ir en el primer nivel (todos inician un bloque HTML de CommonMark, tipo 6) */
const TOP_LEVEL = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'blockquote', 'aside', 'table', 'hr', 'figure']);
const VOID = new Set(['br', 'hr']);

type AttrRule = (value: string, tag: string) => boolean;
const digits: AttrRule = (v) => /^[1-9]\d{0,2}$/.test(v);
const oneOf =
  (...vals: string[]): AttrRule =>
  (v) =>
    vals.includes(v);

export function isSafeBlogHref(href: string): boolean {
  const h = href.trim();
  return /^https?:\/\/[^\s"<>]+$/i.test(h) || /^\/[^\s"<>]*$/.test(h) || /^mailto:[^\s"<>]+$/i.test(h) || /^#[^\s"<>]*$/.test(h);
}

/** Lista blanca: etiqueta → atributos permitidos y cómo validar su valor */
const ALLOWED: Record<string, Record<string, AttrRule>> = {
  p: { class: oneOf('al-centro') },
  h2: { class: oneOf('al-centro') },
  h3: { class: oneOf('al-centro') },
  strong: {},
  em: {},
  u: {},
  s: {},
  br: {},
  hr: {},
  ul: {},
  ol: { start: digits },
  li: {},
  blockquote: {},
  table: {},
  thead: {},
  tbody: {},
  tr: {},
  th: { colspan: digits, rowspan: digits },
  td: { colspan: digits, rowspan: digits },
  mark: {},
  span: { class: oneOf(...TEXT_COLORS.map((c) => `tc-${c}`)) },
  a: {
    href: (v) => isSafeBlogHref(decodeEntities(v)),
    target: oneOf('_blank'),
    rel: (v) => v.split(/\s+/).every((t) => ['noopener', 'noreferrer', 'nofollow'].includes(t)),
  },
  aside: { class: oneOf(...CALLOUTS.map((k) => `aviso aviso--${k}`)) },
  figure: { class: oneOf('blog-video'), 'data-youtube': (v) => YT_ID.test(v) },
};

/** Bloques: los de primer nivel; también pueden ir dentro de citas, avisos, elementos de lista y celdas */
const BLOCKS = TOP_LEVEL;

/** Quién puede ir dentro de quién (lo que no está aquí admite contenido en línea) */
const CHILDREN: Record<string, Set<string>> = {
  ul: new Set(['li']),
  ol: new Set(['li']),
  table: new Set(['thead', 'tbody', 'tr']),
  thead: new Set(['tr']),
  tbody: new Set(['tr']),
  tr: new Set(['th', 'td']),
  figure: new Set(['a']),
  aside: BLOCKS,
  blockquote: BLOCKS,
};
/**
 * Contenedores que admiten bloques además de texto: elementos de lista y celdas (Tiptap pone un <p> dentro).
 * Admiten los mismos bloques que el editor deja meter (una tabla en una lista, una lista en una celda…):
 * el validador nunca debe rechazar algo que el editor permite hacer.
 */
const BLOCK_HOSTS = new Set(['li', 'th', 'td']);
const INLINE = new Set(['strong', 'em', 'u', 's', 'br', 'mark', 'span', 'a']);

const ENTITY = /^&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]{2,8});/i;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]{2,8});/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const TAG = /^<(\/?)([a-z][a-z0-9]*)((?:\s+[a-z][a-z0-9-]*="[^"<>]*")*)\s*(\/?)>/;
const ATTR = /\s+([a-z][a-z0-9-]*)="([^"<>]*)"/g;

/**
 * Comprueba que `html` es exactamente lo que puede producir el editor visual. Devuelve errores en llano
 * (vacío = válido). No intenta arreglar nada: lo que no cumple se rechaza.
 */
export function validateBlogHtml(html: string): string[] {
  const errors = new Set<string>();
  const stack: string[] = [];
  let i = 0;
  let videoLinks = 0;
  const src = html.replace(/\r\n?/g, '\n');

  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '<') {
      const m = TAG.exec(src.slice(i));
      if (!m) {
        errors.add('El texto contiene una etiqueta HTML no permitida o mal formada');
        i += 1;
        continue;
      }
      const [all, closing, name, attrs, selfClose] = m as unknown as [string, string, string, string, string];
      i += all.length;
      const rules = ALLOWED[name];
      if (!rules) {
        errors.add(`El texto contiene la etiqueta <${name}>, que no está permitida`);
        continue;
      }
      if (closing) {
        if (attrs.trim()) errors.add(`Etiqueta de cierre </${name}> con atributos`);
        if (stack[stack.length - 1] !== name) errors.add(`Etiquetas mal anidadas: sobra o falta </${name}>`);
        else stack.pop();
        continue;
      }
      // Atributos: solo los de la lista blanca, sin repetir y con valor válido
      const seen = new Set<string>();
      for (const a of attrs.matchAll(ATTR)) {
        const [, key, value] = a as unknown as [string, string, string];
        if (seen.has(key)) errors.add(`Atributo repetido en <${name}>: ${key}`);
        seen.add(key);
        const rule = rules[key];
        if (!rule) errors.add(`Atributo no permitido en <${name}>: ${key}`);
        else if (!rule(value, name)) errors.add(`Valor no permitido en <${name} ${key}>`);
      }
      // Dónde puede ir
      const parent = stack[stack.length - 1];
      if (!parent) {
        if (!TOP_LEVEL.has(name)) errors.add(`<${name}> no puede ir fuera de un párrafo`);
      } else {
        const allowedKids = CHILDREN[parent];
        if (allowedKids ? !allowedKids.has(name) : BLOCK_HOSTS.has(parent) ? !(INLINE.has(name) || BLOCKS.has(name)) : !INLINE.has(name)) {
          errors.add(`<${name}> no puede ir dentro de <${parent}>`);
        }
      }
      if (name === 'figure' && !seen.has('data-youtube')) errors.add('Vídeo sin identificador de YouTube');
      if (name === 'a' && parent === 'figure') {
        videoLinks += 1;
        const figureOpen = src.lastIndexOf('<figure', i);
        const id = /data-youtube="([^"]+)"/.exec(src.slice(figureOpen, i))?.[1];
        const href = /href="([^"]+)"/.exec(attrs)?.[1];
        if (!id || href !== youtubeWatchUrl(id)) errors.add('El enlace del vídeo no coincide con su identificador de YouTube');
      }
      if (VOID.has(name) || selfClose) {
        if (!VOID.has(name)) errors.add(`<${name}/> no puede ir vacío`);
        continue;
      }
      stack.push(name);
      continue;
    }
    if (ch === '>') {
      errors.add('El texto contiene ">" sin escapar');
      i += 1;
      continue;
    }
    if (ch === '&') {
      if (!ENTITY.test(src.slice(i))) errors.add('El texto contiene "&" sin escapar');
      i += 1;
      continue;
    }
    if (ch === '\n') {
      // Forma fija: los saltos de línea solo separan bloques de primer nivel
      if (stack.length) errors.add('Salto de línea dentro de un bloque');
      i += 1;
      continue;
    }
    if (!stack.length && ch.trim()) errors.add('Hay texto fuera de un párrafo');
    i += 1;
  }
  if (stack.length) errors.add(`Faltan etiquetas de cierre: ${stack.map((t) => `</${t}>`).join(' ')}`);
  if (videoLinks === 0 && /<figure/.test(src)) errors.add('Vídeo sin enlace');
  // Una línea por bloque: cada línea no vacía empieza por "<" (nunca la reinterpreta el Markdown)
  for (const line of src.split('\n')) if (line.trim() && !line.startsWith('<')) errors.add('Cada bloque debe empezar en su propia línea');
  return [...errors];
}

/** Texto legible del HTML (para contar palabras, comprobar si está vacío y las reglas de contenido). */
export function blogHtmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<figure[\s\S]*?<\/figure>/g, ' ')
      .replace(/<\/(p|h2|h3|li|th|td|blockquote|aside)>/g, ' $&')
      .replace(/<br\s*\/?>/g, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
