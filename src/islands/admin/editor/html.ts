/**
 * HTML del editor visual ↔ fichero (ADR-031). Necesita DOM (DOMParser): solo navegador.
 *
 * - `cleanEditorHtml`: lo que devuelve Tiptap (getHTML) → forma fija que acepta validateBlogHtml:
 *   sin style=, sin <colgroup>, sin colspan/rowspan="1", sin el párrafo vacío final, y un bloque de primer
 *   nivel por línea separados por una línea en blanco.
 * - `normalizePastedHtml`: lo que se pega desde Word se arregla antes de que lo lea el editor (Word escribe
 *   las listas como párrafos con estilo mso-list y la viñeta como texto). Google Docs y las webs ya los
 *   entiende el editor por sí mismo.
 */
import { blogHtmlToText } from '../../../domain/blogHtml';

const parse = (html: string): HTMLElement => new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html').body;

export function cleanEditorHtml(html: string): string {
  const body = parse(html);
  body.querySelectorAll('colgroup').forEach((el) => el.remove());
  body.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));
  body.querySelectorAll('th, td').forEach((el) => {
    for (const a of ['colspan', 'rowspan']) if (el.getAttribute(a) === '1') el.removeAttribute(a);
    el.removeAttribute('colwidth');
  });
  // El párrafo vacío que el editor deja al final (para poder seguir escribiendo tras una tabla o un vídeo)
  let last = body.lastElementChild;
  while (last && last.tagName === 'P' && !last.textContent?.trim() && !last.querySelector('br')) {
    last.remove();
    last = body.lastElementChild;
  }
  const blocks = Array.from(body.children).map((el) => el.outerHTML);
  const out = blocks.join('\n\n');
  // Sin texto, ni tabla, ni vídeo, ni separador: artículo vacío
  return blogHtmlToText(out) || /<(table|figure|hr)\b/.test(out) ? out : '';
}

export function normalizePastedHtml(html: string): string {
  if (!/mso-list/i.test(html)) return html;
  const body = parse(html);
  body.querySelectorAll('o\\:p').forEach((el) => el.remove());
  const listId = (el: Element | null): string | null => (el && el.tagName === 'P' ? (/mso-list:\s*(l\d+)/i.exec(el.getAttribute('style') ?? '')?.[1] ?? null) : null);
  const isWordItem = (el: Element | null): el is HTMLElement => listId(el) !== null;
  const marker = (p: HTMLElement): string => {
    const ignore = Array.from(p.querySelectorAll('span')).find((s) => /mso-list:\s*ignore/i.test(s.getAttribute('style') ?? ''));
    return ignore?.textContent?.trim() ?? '';
  };
  for (const p of Array.from(body.querySelectorAll('p'))) {
    if (!isWordItem(p) || !p.isConnected) continue;
    // Agrupa los elementos seguidos de la misma lista (mismo mso-list:lN)
    const id = listId(p);
    const ordered = /^\(?\w{1,3}[.)]/.test(marker(p));
    const list = body.ownerDocument.createElement(ordered ? 'ol' : 'ul');
    p.before(list);
    let cur: Element | null = p;
    while (isWordItem(cur) && listId(cur) === id) {
      const next: Element | null = cur.nextElementSibling;
      cur.querySelectorAll('span').forEach((s) => {
        if (/mso-list:\s*ignore/i.test(s.getAttribute('style') ?? '')) s.remove();
      });
      const li = body.ownerDocument.createElement('li');
      li.append(...Array.from(cur.childNodes));
      list.append(li);
      cur.remove();
      cur = next;
    }
  }
  return body.innerHTML;
}
