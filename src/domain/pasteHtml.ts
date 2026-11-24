/**
 * Pegar desde Word, Google Docs o una web en el editor del blog (ADR-030). Puro: recorre nodos con
 * forma de DOM (los del navegador la cumplen; los tests usan nodos hechos a mano) y devuelve el texto
 * en el formato del blog: títulos, párrafos, listas, negrita, cursiva y enlaces absolutos seguros.
 * Todo lo demás (estilos, tablas, imágenes, comentarios condicionales de Word) se queda en texto o
 * se descarta. Nunca se conserva HTML: lo que sale es solo texto con marcas de Markdown.
 */

export interface HtmlLike {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<HtmlLike>;
  getAttribute?: (name: string) => string | null;
}

export interface PasteResult {
  text: string;
  /** El contenido traía imágenes (no se pegan: las fotos las pone el administrador) */
  hadImages: boolean;
}

const TEXT = 3;
const ELEMENT = 1;

const SKIP = new Set(['STYLE', 'SCRIPT', 'META', 'TITLE', 'HEAD', 'LINK', 'XML', 'O:P', 'NOSCRIPT', 'TEMPLATE', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SVG', 'IFRAME', 'OBJECT']);
const BLOCKS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'BLOCKQUOTE', 'PRE', 'TABLE', 'TBODY', 'THEAD', 'TR', 'BODY', 'HTML', 'FIGURE', 'FIGCAPTION', 'DL', 'DD', 'DT', 'CENTER', 'ADDRESS']);

const attr = (n: HtmlLike, name: string): string => (n.getAttribute ? (n.getAttribute(name) ?? '') : '');
const styleOf = (n: HtmlLike): string => attr(n, 'style').toLowerCase().replace(/\s+/g, '');

/** Google Docs envuelve todo en <b style="font-weight:normal" id="docs-internal-guid-…">: eso no es negrita */
function isBold(n: HtmlLike): boolean {
  const s = styleOf(n);
  const w = /font-weight:([a-z0-9]+)/.exec(s)?.[1];
  if (w) return w === 'bold' || w === 'bolder' || Number(w) >= 600;
  return n.nodeName === 'B' || n.nodeName === 'STRONG';
}
function isItalic(n: HtmlLike): boolean {
  const s = styleOf(n);
  const st = /font-style:([a-z]+)/.exec(s)?.[1];
  if (st) return st === 'italic' || st === 'oblique';
  return n.nodeName === 'I' || n.nodeName === 'EM';
}

/** Solo enlaces absolutos (una ruta relativa de otra web apuntaría a una página que aquí no existe) */
function safeLink(href: string): string | null {
  const h = href.trim();
  if (/^https?:\/\/[^\s]+$/i.test(h) || /^mailto:[^\s]+$/i.test(h)) return h;
  return null;
}

/** Párrafo de Word que en realidad es un elemento de lista (mso-list) y si es numerado */
function wordListItem(n: HtmlLike): 'ul' | 'ol' | null {
  if (!/mso-list:l\d/.test(styleOf(n))) return null;
  const marker = findWordListMarker(n);
  return marker && /^\(?\w{1,3}[.)]/.test(marker.trim()) ? 'ol' : 'ul';
}
function findWordListMarker(n: HtmlLike): string | null {
  for (const c of Array.from(n.childNodes)) {
    if (c.nodeType !== ELEMENT) continue;
    if (/mso-list:ignore/.test(styleOf(c))) return c.textContent ?? '';
    const deeper = findWordListMarker(c);
    if (deeper !== null) return deeper;
  }
  return null;
}

/** Envuelve con marcas sin dejar espacios dentro (**hola ** no se vería en negrita) */
function mark(inner: string, m: string): string {
  const core = inner.trim();
  if (!core) return inner;
  const lead = inner.startsWith(' ') ? ' ' : '';
  const trail = inner.endsWith(' ') ? ' ' : '';
  return `${lead}${m}${core}${m}${trail}`;
}

interface Ctx {
  bold: boolean;
  italic: boolean;
  images: { found: boolean };
}

/** Contenido en línea de un nodo (sin saltos de bloque) */
function inline(n: HtmlLike, ctx: Ctx): string {
  if (n.nodeType === TEXT) return (n.textContent ?? '').replace(/[\s ]+/g, ' ');
  if (n.nodeType !== ELEMENT) return '';
  const name = n.nodeName.toUpperCase();
  if (SKIP.has(name)) return '';
  if (name === 'IMG' || name === 'PICTURE' || name === 'V:IMAGEDATA' || name === 'V:SHAPE') {
    ctx.images.found = true;
    return '';
  }
  if (name === 'BR') return '\n';
  // Viñeta o número que Word pinta como texto: la marca de lista ya la pone el bloque
  if (/mso-list:ignore/.test(styleOf(n))) return '';

  const bold = !ctx.bold && isBold(n);
  const italic = !ctx.italic && isItalic(n);
  const next: Ctx = { ...ctx, bold: ctx.bold || bold, italic: ctx.italic || italic };
  let out = Array.from(n.childNodes)
    .map((c) => inline(c, next))
    .join('');
  if (name === 'A') {
    const href = safeLink(attr(n, 'href'));
    const label = out.replace(/\s+/g, ' ').trim();
    if (href && label) out = `[${label.replace(/[[\]]/g, '')}](${href})`;
  }
  if (italic) out = mark(out, '*');
  if (bold) out = mark(out, '**');
  return out;
}

type Piece = { kind: 'p' | 'h2' | 'h3'; text: string } | { kind: 'li'; list: 'ul' | 'ol'; text: string };

const clean = (s: string): string =>
  s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();

function blocks(n: HtmlLike, ctx: Ctx, out: Piece[], list: 'ul' | 'ol' | null): void {
  if (n.nodeType === TEXT) {
    const t = clean(inline(n, ctx));
    if (t) out.push({ kind: 'p', text: t });
    return;
  }
  if (n.nodeType !== ELEMENT) return;
  const name = n.nodeName.toUpperCase();
  if (SKIP.has(name)) return;

  const heading = /^H([1-6])$/.exec(name);
  if (heading) {
    // Un título no lleva negrita dentro: ya se ve destacado
    const t = clean(inline(n, { ...ctx, bold: true })).replace(/\n/g, ' ');
    if (t) out.push({ kind: Number(heading[1]) <= 2 ? 'h2' : 'h3', text: t });
    return;
  }
  if (name === 'UL' || name === 'OL') {
    for (const c of Array.from(n.childNodes)) blocks(c, ctx, out, name === 'OL' ? 'ol' : 'ul');
    return;
  }
  if (name === 'LI') {
    // Sublistas: se aplanan detrás del elemento
    const own: HtmlLike[] = [];
    const nested: HtmlLike[] = [];
    for (const c of Array.from(n.childNodes)) (c.nodeType === ELEMENT && (c.nodeName === 'UL' || c.nodeName === 'OL') ? nested : own).push(c);
    const t = clean(own.map((c) => inline(c, ctx)).join('')).replace(/\n/g, ' ');
    if (t) out.push({ kind: 'li', list: list ?? 'ul', text: t });
    for (const c of nested) blocks(c, ctx, out, null);
    return;
  }
  const wordList = name === 'P' ? wordListItem(n) : null;
  if (wordList) {
    const t = clean(inline(n, ctx)).replace(/\n/g, ' ');
    if (t) out.push({ kind: 'li', list: wordList, text: t });
    return;
  }
  if (name === 'TD' || name === 'TH') {
    const t = clean(inline(n, ctx));
    if (t) out.push({ kind: 'p', text: t });
    return;
  }

  // Contenedor (body, div, o el <b id="docs-internal-guid…"> de Google Docs) con bloques dentro: se recorre
  if (containsBlock(n)) {
    // Texto suelto entre bloques: se agrupa en párrafos
    let run: HtmlLike[] = [];
    const flush = () => {
      if (!run.length) return;
      const t = clean(run.map((c) => inline(c, ctx)).join(''));
      if (t) out.push({ kind: 'p', text: t });
      run = [];
    };
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === ELEMENT && (isBlockName(c.nodeName.toUpperCase()) || containsBlock(c))) {
        flush();
        blocks(c, ctx, out, list);
      } else run.push(c);
    }
    flush();
    return;
  }
  // Párrafo, div sin bloques dentro o elemento en línea suelto en la raíz
  const t = clean(inline(n, ctx));
  if (t) out.push({ kind: 'p', text: t });
}

const isBlockName = (name: string): boolean => BLOCKS.has(name) || /^H[1-6]$|^UL$|^OL$|^LI$|^TD$|^TH$/.test(name);
function containsBlock(n: HtmlLike): boolean {
  return Array.from(n.childNodes).some((c) => c.nodeType === ELEMENT && !SKIP.has(c.nodeName.toUpperCase()) && (isBlockName(c.nodeName.toUpperCase()) || containsBlock(c)));
}

/** Nodo raíz (body de lo pegado) → texto en el formato del blog. */
export function htmlToMarkdown(root: HtmlLike): PasteResult {
  const ctx: Ctx = { bold: false, italic: false, images: { found: false } };
  const pieces: Piece[] = [];
  blocks(root, ctx, pieces, null);

  // Los párrafos en línea seguidos (spans sueltos de la raíz) se unen en uno
  const parts: string[] = [];
  let prev: Piece | null = null;
  let n = 0;
  for (const p of pieces) {
    if (p.kind === 'li') {
      n = prev?.kind === 'li' && prev.list === p.list ? n + 1 : 1;
      const line = p.list === 'ol' ? `${n}. ${p.text}` : `- ${p.text}`;
      if (prev?.kind === 'li') parts[parts.length - 1] += `\n${line}`;
      else parts.push(line);
    } else {
      n = 0;
      // Saltos <br> dentro de un párrafo: Markdown los uniría; se separan en párrafos
      const text = p.text.split('\n').join('\n\n');
      parts.push(p.kind === 'p' ? text : `${p.kind === 'h2' ? '##' : '###'} ${text}`);
    }
    prev = p;
  }
  return { text: parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim(), hadImages: ctx.images.found };
}
