/**
 * Ayudas de escritura del editor del blog (ADR-027). Puro: sin DOM.
 *
 * - `applyFormat` / `insertLink`: lo que hace cada botón de la barra de formato sobre el texto y la
 *   selección del <textarea> (devuelve el texto nuevo y la selección que debe quedar).
 * - `parseBlocks`: el subconjunto de Markdown que se usa en el blog (títulos, párrafos, listas,
 *   negrita, cursiva y enlaces) convertido en una estructura que la vista previa pinta con elementos
 *   de Preact, nunca con innerHTML. La web publica el artículo con el Markdown de Astro; la vista
 *   previa es una aproximación fiel para ese subconjunto.
 */

export type FormatKind = 'heading' | 'bold' | 'italic' | 'bullets' | 'numbers';

export interface TextEdit {
  text: string;
  start: number;
  end: number;
}

const PLACEHOLDER: Record<FormatKind, string> = {
  heading: 'Título de la sección',
  bold: 'texto en negrita',
  italic: 'texto en cursiva',
  bullets: 'Elemento de la lista',
  numbers: 'Primer paso',
};

/** Límites de las líneas que toca la selección [start, end). */
function lineRange(text: string, start: number, end: number): { from: number; to: number } {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  // Si la selección termina justo tras un salto de línea, esa línea siguiente no cuenta
  const last = end > start && text[end - 1] === '\n' ? end - 1 : end;
  const nl = text.indexOf('\n', last);
  return { from, to: nl === -1 ? text.length : nl };
}

function wrap(text: string, start: number, end: number, marker: string, placeholder: string): TextEdit {
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  // Ya estaba envuelto: se quita (el botón funciona como interruptor)
  if (before.endsWith(marker) && after.startsWith(marker) && !(marker === '*' && (before.endsWith('**') || after.startsWith('**')))) {
    return { text: before.slice(0, -marker.length) + selected + after.slice(marker.length), start: start - marker.length, end: end - marker.length };
  }
  if (selected.length > 2 * marker.length && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(marker.length, -marker.length);
    return { text: before + inner + after, start, end: start + inner.length };
  }
  // Los espacios de los bordes quedan fuera de las marcas (**hola ** no se ve en negrita)
  const lead = selected.length - selected.trimStart().length;
  const trail = selected.length - selected.trimEnd().length;
  const core = selected.trim() || placeholder;
  const s = start + lead + marker.length;
  return {
    text: before + selected.slice(0, lead) + marker + core + marker + selected.slice(selected.length - trail) + after,
    start: s,
    end: s + core.length,
  };
}

const BULLET_RE = /^\s*[-*+]\s+/;
const NUMBER_RE = /^\s*\d+[.)]\s+/;
const HEADING_RE = /^#{1,6}\s+/;

function prefixLines(text: string, start: number, end: number, kind: 'heading' | 'bullets' | 'numbers'): TextEdit {
  const { from, to } = lineRange(text, start, end);
  const block = text.slice(from, to);
  const lines = block.split('\n');
  const re = kind === 'heading' ? HEADING_RE : kind === 'bullets' ? BULLET_RE : NUMBER_RE;
  const content = lines.filter((l) => l.trim());

  // Una sola línea vacía: se inserta la marca con un texto de ejemplo seleccionado
  if (!content.length) {
    const marker = kind === 'heading' ? '## ' : kind === 'bullets' ? '- ' : '1. ';
    const inserted = marker + PLACEHOLDER[kind];
    const s = from + marker.length;
    return { text: text.slice(0, from) + inserted + text.slice(to), start: s, end: s + PLACEHOLDER[kind].length };
  }

  const allMarked = content.every((l) => re.test(l));
  let n = 0;
  const next = lines.map((l) => {
    if (!l.trim()) return l;
    const bare = l.replace(HEADING_RE, '').replace(BULLET_RE, '').replace(NUMBER_RE, '');
    if (allMarked) return bare;
    n += 1;
    return (kind === 'heading' ? '## ' : kind === 'bullets' ? '- ' : `${n}. `) + bare;
  });
  const replaced = next.join('\n');
  return { text: text.slice(0, from) + replaced + text.slice(to), start: from, end: from + replaced.length };
}

/** Aplica el botón `kind` al texto con la selección [start, end). */
export function applyFormat(text: string, start: number, end: number, kind: FormatKind): TextEdit {
  const a = Math.max(0, Math.min(start, end, text.length));
  const b = Math.max(0, Math.min(Math.max(start, end), text.length));
  if (kind === 'bold') return wrap(text, a, b, '**', PLACEHOLDER.bold);
  if (kind === 'italic') return wrap(text, a, b, '*', PLACEHOLDER.italic);
  return prefixLines(text, a, b, kind);
}

/** Direcciones que admite un enlace del blog (las mismas que acepta blogRules). */
export function isSafeHref(href: string): boolean {
  const h = href.trim();
  return /^https?:\/\/[^\s]+$/i.test(h) || /^\/[^\s]*$/.test(h) || /^mailto:[^\s]+$/i.test(h) || /^#[^\s]*$/.test(h);
}

/** "raiden.com.pe/x" → "https://raiden.com.pe/x"; lo demás tal cual (recortado). */
export function normalizeHref(href: string): string {
  const h = href.trim();
  if (/^www\.|^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(h) && !/^[a-z]+:/i.test(h)) return `https://${h}`;
  return h;
}

/** Sustituye la selección por `[label](href)` y deja seleccionado el texto del enlace. */
export function insertLink(text: string, start: number, end: number, label: string, href: string): TextEdit {
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  const shown = label.trim().replace(/[[\]]/g, '') || href;
  const piece = `[${shown}](${href.trim()})`;
  return { text: text.slice(0, a) + piece + text.slice(b), start: a + 1, end: a + 1 + shown.length };
}

/* ---------- Vista previa ---------- */

export type Inline = { t: 'text'; v: string } | { t: 'b' | 'i'; c: Inline[] } | { t: 'a'; href: string; c: Inline[] };
export type Block = { t: 'h2' | 'h3' | 'p'; c: Inline[] } | { t: 'ul' | 'ol'; items: Inline[][] };

const INLINE_RES: { t: 'a' | 'b' | 'i'; re: RegExp }[] = [
  { t: 'a', re: /\[([^\]\n]+)\]\(([^)\s]+)\)/ },
  { t: 'b', re: /\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__/ },
  { t: 'i', re: /\*(?=\S)([^*]*?\S)\*|(?<![\w])_(?=\S)([^_]*?\S)_(?![\w])/ },
];

/** Texto de una línea o párrafo → nodos en línea (negrita, cursiva, enlaces seguros). */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  while (rest) {
    let best: { t: 'a' | 'b' | 'i'; m: RegExpExecArray } | null = null;
    for (const { t, re } of INLINE_RES) {
      const m = re.exec(rest);
      if (m && (!best || m.index < best.m.index)) best = { t, m };
    }
    if (!best) {
      out.push({ t: 'text', v: rest });
      break;
    }
    const { t, m } = best;
    if (m.index > 0) out.push({ t: 'text', v: rest.slice(0, m.index) });
    if (t === 'a') {
      const href = m[2]!;
      // Un enlace no permitido (javascript:, data:…) se muestra como texto, nunca como enlace
      out.push(isSafeHref(href) ? { t: 'a', href, c: parseInline(m[1]!) } : { t: 'text', v: m[0] });
    } else {
      out.push({ t, c: parseInline(m[1] ?? m[2] ?? '') });
    }
    rest = rest.slice(m.index + m[0].length);
  }
  // Textos contiguos en un solo nodo (un enlace rechazado deja dos trozos seguidos)
  return out.reduce<Inline[]>((acc, n) => {
    const last = acc[acc.length - 1];
    if (n.t === 'text' && last?.t === 'text') acc[acc.length - 1] = { t: 'text', v: last.v + n.v };
    else acc.push(n);
    return acc;
  }, []);
}

/** Markdown del artículo → bloques para la vista previa. */
export function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { t: 'ul' | 'ol'; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join(' ')) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ t: list.t, items: list.items.map(parseInline) });
    list = null;
  };

  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (h) {
      flushPara();
      flushList();
      blocks.push({ t: h[1]!.length >= 3 ? 'h3' : 'h2', c: parseInline(h[2]!.replace(/\s+#+$/, '')) });
      continue;
    }
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const t = ul ? 'ul' : 'ol';
      if (list && list.t !== t) flushList();
      if (!list) list = { t, items: [] };
      list.items.push((ul ?? ol)![1]!);
      continue;
    }
    // Línea de texto tras una lista sin línea en blanco: continúa el último elemento (como en Markdown)
    if (list) {
      const l: { t: 'ul' | 'ol'; items: string[] } = list;
      l.items[l.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}
