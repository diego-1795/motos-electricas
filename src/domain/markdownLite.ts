/**
 * Markdown de los artículos anteriores al editor visual → HTML del editor (ADR-031). Puro.
 *
 * Los artículos escritos a mano o con el editor de texto (ADR-027) son Markdown. Al abrirlos en el editor
 * visual se convierten a HTML con este subconjunto: títulos, párrafos, listas, citas, separadores, tablas
 * (GFM), negrita, cursiva, tachado y enlaces. El HTML resultante cumple `validateBlogHtml` (blogHtml.ts):
 * el texto siempre se escapa y un enlace no permitido se queda como texto.
 */
import { escapeHtml, isSafeBlogHref } from './blogHtml';

export const isSafeHref = isSafeBlogHref;

export type Inline = { t: 'text'; v: string } | { t: 'b' | 'i' | 's'; c: Inline[] } | { t: 'a'; href: string; c: Inline[] };
export type Block =
  | { t: 'h2' | 'h3' | 'p'; c: Inline[] }
  | { t: 'ul' | 'ol'; items: Inline[][] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'hr' }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] };

const INLINE_RES: { t: 'a' | 'b' | 'i' | 's'; re: RegExp }[] = [
  { t: 'a', re: /\[([^\]\n]+)\]\(([^)\s]+)\)/ },
  { t: 'b', re: /\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__/ },
  { t: 's', re: /~~(?=\S)([\s\S]*?\S)~~/ },
  { t: 'i', re: /\*(?=\S)([^*]*?\S)\*|(?<![\w])_(?=\S)([^_]*?\S)_(?![\w])/ },
];

/** Texto de una línea o párrafo → nodos en línea (negrita, cursiva, tachado, enlaces seguros). */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  while (rest) {
    let best: { t: 'a' | 'b' | 'i' | 's'; m: RegExpExecArray } | null = null;
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
      // Un enlace no permitido (javascript:, data:…) se queda como texto, nunca como enlace
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

const TABLE_ROW = /^\s*\|.*\|\s*$/;
// GFM: cada celda del separador es uno o más guiones, con dos puntos opcionales para alinear
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));

/** Markdown del artículo → bloques. */
export function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let list: { t: 'ul' | 'ol'; items: string[] } | null = null;
  let quote: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join(' ')) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ t: list.t, items: list.items.map(parseInline) });
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) blocks.push({ t: 'quote', c: parseInline(quote.join(' ')) });
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!.trimEnd();
    if (!line.trim()) {
      flushAll();
      continue;
    }
    // Tabla GFM: fila de cabecera + separador + filas
    if (TABLE_ROW.test(line) && TABLE_SEP.test(lines[i + 1] ?? '')) {
      flushAll();
      const head = cells(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i]!)) {
        rows.push(cells(lines[i]!).map(parseInline));
        i += 1;
      }
      i -= 1;
      blocks.push({ t: 'table', head, rows });
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushAll();
      blocks.push({ t: 'hr' });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (h) {
      flushAll();
      blocks.push({ t: h[1]!.length >= 3 ? 'h3' : 'h2', c: parseInline(h[2]!.replace(/\s+#+$/, '')) });
      continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) {
      flushPara();
      flushList();
      quote.push(q[1]!.trim());
      continue;
    }
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      flushQuote();
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
    flushQuote();
    para.push(line.trim());
  }
  flushAll();
  return blocks;
}

function inlineHtml(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      if (n.t === 'text') return escapeHtml(n.v);
      if (n.t === 'a') return `<a href="${escapeHtml(n.href)}">${inlineHtml(n.c)}</a>`;
      const tag = n.t === 'b' ? 'strong' : n.t === 'i' ? 'em' : 's';
      return `<${tag}>${inlineHtml(n.c)}</${tag}>`;
    })
    .join('');
}

/** Markdown → HTML del editor: un bloque por línea, separados por una línea en blanco. */
export function markdownToHtml(md: string): string {
  return parseBlocks(md)
    .map((b) => {
      if (b.t === 'hr') return '<hr>';
      if (b.t === 'quote') return `<blockquote><p>${inlineHtml(b.c)}</p></blockquote>`;
      if (b.t === 'table') {
        const head = `<tr>${b.head.map((c) => `<th><p>${inlineHtml(c)}</p></th>`).join('')}</tr>`;
        const rows = b.rows.map((r) => `<tr>${b.head.map((_, j) => `<td><p>${inlineHtml(r[j] ?? [])}</p></td>`).join('')}</tr>`).join('');
        return `<table><tbody>${head}${rows}</tbody></table>`;
      }
      if ('items' in b) return `<${b.t}>${b.items.map((it) => `<li><p>${inlineHtml(it)}</p></li>`).join('')}</${b.t}>`;
      return `<${b.t}>${inlineHtml(b.c)}</${b.t}>`;
    })
    .join('\n\n');
}
