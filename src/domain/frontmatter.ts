/**
 * Frontmatter YAML de los artículos del blog (src/content/blog/<slug>.md): lectura y escritura
 * deterministas del subconjunto que usa el proyecto, sin dependencias (ADR-023).
 *
 * Subconjunto admitido (es el que generan Astro/este módulo y el que hay en el repo):
 *   clave: "texto entre comillas dobles"   (escapes JSON)
 *   clave: 'texto entre comillas simples'  ('' = comilla)
 *   clave: texto plano | 123 | true/false
 *   clave: ["a", "b"]                      (lista en línea)
 *   clave:                                 (lista en bloque)
 *     - "a"
 *   clave:                                 (objeto anidado, 2 espacios)
 *     sub: valor
 * Cualquier otra construcción (anclas, multilínea `|`/`>`, tabuladores…) se rechaza con un error
 * legible: mejor que escribir algo que el build de Astro interpretaría de otra forma.
 *
 * `serializeFrontmatter` escribe siempre lo mismo para los mismos datos: cadenas con comillas
 * dobles (JSON, válido en YAML), listas de escalares en línea, objetos en bloque, orden de claves
 * el del objeto. Las claves con valor `undefined` o `null` se omiten.
 */

export type Scalar = string | number | boolean;
export type FrontmatterValue = Scalar | Scalar[] | { [key: string]: FrontmatterValue | undefined };
export type Frontmatter = Record<string, FrontmatterValue | undefined>;

export interface ParsedDocument {
  data: Record<string, unknown>;
  body: string;
}

const KEY_RE = /^[A-Za-z_][\w-]*$/;

export class FrontmatterError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(`frontmatter línea ${line}: ${message}`);
    this.name = 'FrontmatterError';
    this.line = line;
  }
}

/* ---------- Lectura ---------- */

/** Separa `---\n…\n---\n` del cuerpo. Sin frontmatter → data vacío y body = texto completo. */
export function splitFrontmatter(text: string): { yaml: string | null; body: string } {
  const normalized = text.replace(/\r\n?/g, '\n');
  if (!normalized.startsWith('---\n')) return { yaml: null, body: normalized };
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) throw new FrontmatterError('falta el cierre --- del frontmatter', 1);
  const after = normalized.slice(end + 4);
  if (after !== '' && !after.startsWith('\n')) throw new FrontmatterError('el cierre --- debe ir solo en su línea', normalized.slice(0, end).split('\n').length + 1);
  return { yaml: normalized.slice(4, end), body: after.replace(/^\n+/, '') };
}

function parseScalar(raw: string, line: number): Scalar {
  const v = raw.trim();
  if (v === '') return '';
  if (v.startsWith('"')) {
    if (!v.endsWith('"') || v.length < 2) throw new FrontmatterError('comillas dobles sin cerrar', line);
    try {
      return JSON.parse(v) as string;
    } catch {
      throw new FrontmatterError('texto entre comillas con escapes no válidos', line);
    }
  }
  if (v.startsWith("'")) {
    if (!v.endsWith("'") || v.length < 2) throw new FrontmatterError('comillas simples sin cerrar', line);
    return v.slice(1, -1).replace(/''/g, "'");
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (/^[&*!|>]/.test(v) || v.includes(': ') || v.startsWith('#')) throw new FrontmatterError(`valor no admitido: ${v}`, line);
  return v.replace(/\s+#.*$/, '');
}

/** `["a", "b", 3]` → escalares (respeta comillas y comas dentro de ellas). */
function parseInlineList(raw: string, line: number): Scalar[] {
  const inner = raw.trim().slice(1, -1).trim();
  if (inner === '') return [];
  const items: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (quote) {
      cur += ch;
      if (ch === '\\' && quote === '"' && i + 1 < inner.length) cur += inner[++i];
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ',') {
      items.push(cur);
      cur = '';
    } else if (ch === '[' || ch === '{') {
      throw new FrontmatterError('listas anidadas u objetos en línea no admitidos', line);
    } else {
      cur += ch;
    }
  }
  if (quote) throw new FrontmatterError('comillas sin cerrar en la lista', line);
  items.push(cur);
  return items.map((s) => parseScalar(s, line));
}

interface Line {
  indent: number;
  text: string;
  n: number;
}

function toLines(yaml: string): Line[] {
  return yaml.split('\n').map((raw, i) => {
    const n = i + 2; // la línea 1 es el --- de apertura
    if (raw.includes('\t')) throw new FrontmatterError('no se admiten tabuladores (usa espacios)', n);
    const indent = raw.length - raw.trimStart().length;
    return { indent, text: raw.trim(), n };
  }).filter((l) => l.text !== '' && !l.text.startsWith('#'));
}

function parseBlock(lines: Line[], start: number, indent: number): { value: Record<string, unknown>; next: number } {
  const out: Record<string, unknown> = {};
  let i = start;
  while (i < lines.length) {
    const l = lines[i]!;
    if (l.indent < indent) break;
    if (l.indent > indent) throw new FrontmatterError('sangría inesperada', l.n);
    const m = /^([^:\s]+):(?:\s+(.*))?$/.exec(l.text);
    if (!m) throw new FrontmatterError(`se esperaba "clave: valor" (${l.text})`, l.n);
    const key = m[1]!;
    if (!KEY_RE.test(key) || key === '__proto__') throw new FrontmatterError(`clave no válida: ${key}`, l.n);
    if (Object.hasOwn(out, key)) throw new FrontmatterError(`clave repetida: ${key}`, l.n);
    const rest = (m[2] ?? '').trim();
    if (rest === '' && l.text.endsWith(':')) {
      const next = lines[i + 1];
      if (!next || next.indent <= indent) {
        out[key] = '';
        i++;
        continue;
      }
      if (next.text.startsWith('- ') || next.text === '-') {
        const list: Scalar[] = [];
        let j = i + 1;
        while (j < lines.length && lines[j]!.indent === next.indent && (lines[j]!.text.startsWith('- ') || lines[j]!.text === '-')) {
          list.push(parseScalar(lines[j]!.text.slice(1), lines[j]!.n));
          j++;
        }
        if (j < lines.length && lines[j]!.indent > indent) throw new FrontmatterError('sangría inesperada tras la lista', lines[j]!.n);
        out[key] = list;
        i = j;
        continue;
      }
      const nested = parseBlock(lines, i + 1, next.indent);
      out[key] = nested.value;
      i = nested.next;
      continue;
    }
    if (rest.startsWith('[')) {
      if (!rest.endsWith(']')) throw new FrontmatterError('lista en línea sin cerrar', l.n);
      out[key] = parseInlineList(rest, l.n);
    } else {
      out[key] = parseScalar(rest, l.n);
    }
    i++;
  }
  return { value: out, next: i };
}

/** Markdown con frontmatter → { data, body }. Lanza FrontmatterError si el YAML sale del subconjunto. */
export function parseFrontmatter(text: string): ParsedDocument {
  const { yaml, body } = splitFrontmatter(text);
  if (yaml === null) return { data: {}, body };
  const lines = toLines(yaml);
  const { value, next } = parseBlock(lines, 0, 0);
  if (next !== lines.length) throw new FrontmatterError('sangría inesperada', lines[next]!.n);
  return { data: value, body };
}

/* ---------- Escritura ---------- */

const isScalar = (v: unknown): v is Scalar => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

function scalar(v: Scalar): string {
  // JSON.stringify deja U+2028/U+2029 en crudo (son separadores de línea para las expresiones regulares del
  // lector): se escapan para que un texto pegado con esos caracteres pueda volver a leerse.
  if (typeof v === 'string') return JSON.stringify(v).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('frontmatter: número no finito');
    return String(v);
  }
  return v ? 'true' : 'false';
}

function writeEntries(obj: Record<string, unknown>, indent: string, out: string[]): void {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (!KEY_RE.test(key)) throw new Error(`frontmatter: clave no válida "${key}"`);
    if (isScalar(value)) {
      out.push(`${indent}${key}: ${scalar(value)}`);
    } else if (Array.isArray(value)) {
      if (!value.every(isScalar)) throw new Error(`frontmatter: la lista "${key}" solo admite escalares`);
      out.push(`${indent}${key}: [${value.map(scalar).join(', ')}]`);
    } else if (typeof value === 'object') {
      out.push(`${indent}${key}:`);
      writeEntries(value as Record<string, unknown>, `${indent}  `, out);
    } else {
      throw new Error(`frontmatter: valor no serializable en "${key}"`);
    }
  }
}

/** { data, body } → texto Markdown. Determinista: mismo dato, mismo fichero (diffs mínimos en git). */
export function serializeFrontmatter(data: Record<string, unknown>, body: string): string {
  const lines: string[] = [];
  writeEntries(data, '', lines);
  const content = body.replace(/\r\n?/g, '\n').replace(/^\n+/, '').replace(/\s+$/, '');
  return `---\n${lines.join('\n')}\n---\n${content ? `\n${content}\n` : ''}`;
}
