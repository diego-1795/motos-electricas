import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, type HtmlLike } from '../../src/domain/pasteHtml';

/** Pegar desde Word / Google Docs / una web (ADR-030). Nodos con forma de DOM hechos a mano. */
type Child = HtmlLike | string;
const t = (text: string): HtmlLike => ({ nodeType: 3, nodeName: '#text', textContent: text, childNodes: [] });
function h(name: string, attrs: Record<string, string> = {}, ...children: Child[]): HtmlLike {
  const kids = children.map((c) => (typeof c === 'string' ? t(c) : c));
  return {
    nodeType: 1,
    nodeName: name.toUpperCase(),
    get textContent() {
      return kids.map((k) => k.textContent ?? '').join('');
    },
    childNodes: kids,
    getAttribute: (n: string) => attrs[n] ?? null,
  };
}
const body = (...c: Child[]) => h('body', {}, ...c);

describe('Google Docs', () => {
  it('envoltorio <b font-weight:normal>, títulos, negrita por estilo y listas con <p> dentro', () => {
    const doc = body(
      h('meta', { charset: 'utf-8' }),
      h(
        'b',
        { style: 'font-weight:normal;', id: 'docs-internal-guid-abc' },
        h('h2', {}, h('span', { style: 'font-weight:400' }, 'Cuidado de la batería')),
        h('p', {}, h('span', { style: 'font-weight:400' }, 'Carga '), h('span', { style: 'font-weight:700' }, 'cada noche'), h('span', {}, '.')),
        h('ul', {}, h('li', {}, h('p', {}, h('span', {}, 'uno'))), h('li', {}, h('p', {}, h('span', { style: 'font-style:italic' }, 'dos')))),
      ),
    );
    expect(htmlToMarkdown(doc)).toEqual({ text: '## Cuidado de la batería\n\nCarga **cada noche**.\n\n- uno\n- *dos*', hadImages: false });
  });
});

describe('Word', () => {
  it('párrafos MsoNormal, <o:p>, <style> y listas mso-list (viñetas y numeradas)', () => {
    const doc = h(
      'html',
      {},
      h('head', {}, h('style', {}, 'p.MsoNormal { margin: 0 }')),
      body(
        h('p', { class: 'MsoNormal' }, h('b', {}, 'Importante:'), ' revisa los frenos', h('o:p', {})),
        h('p', { style: 'mso-list:l0 level1 lfo1' }, h('span', { style: 'mso-list:Ignore' }, '·', h('span', {}, '\u00a0\u00a0')), 'Frenos'),
        h('p', { style: 'mso-list:l0 level1 lfo1' }, h('span', { style: 'mso-list:Ignore' }, '·'), 'Luces'),
        h('p', { class: 'MsoNormal' }, 'Después:'),
        h('p', { style: 'mso-list: l1 level1 lfo2' }, h('span', { style: 'mso-list:Ignore' }, '1.'), 'Primero'),
        h('p', { style: 'mso-list: l1 level1 lfo2' }, h('span', { style: 'mso-list:Ignore' }, '2.'), 'Segundo'),
      ),
    );
    expect(htmlToMarkdown(doc).text).toBe('**Importante:** revisa los frenos\n\n- Frenos\n- Luces\n\nDespués:\n\n1. Primero\n2. Segundo');
  });
});

describe('web y casos raros', () => {
  it('enlaces: absolutos y mailto se conservan; relativos y javascript: quedan como texto', () => {
    const doc = body(
      h('p', {}, 'Ver ', h('a', { href: 'https://raiden.com.pe/repuestos' }, 'repuestos'), ', ', h('a', { href: '/otra-web' }, 'esto'), ' y ', h('a', { href: 'javascript:alert(1)' }, 'aquello'), '.'),
      h('p', {}, h('a', { href: 'mailto:ventas@example.test' }, 'escríbenos')),
    );
    expect(htmlToMarkdown(doc).text).toBe('Ver [repuestos](https://raiden.com.pe/repuestos), esto y aquello.\n\n[escríbenos](mailto:ventas@example.test)');
  });

  it('las imágenes no se pegan pero se avisa; espacios fuera de las marcas; <br> separa párrafos', () => {
    const r = htmlToMarkdown(body(h('p', {}, h('b', {}, 'hola '), 'mundo', h('br'), 'otra línea'), h('p', {}, h('img', { src: 'x.png' }))));
    expect(r).toEqual({ text: '**hola** mundo\n\notra línea', hadImages: true });
  });

  it('nunca deja HTML: script, style, iframe y botones se descartan; h1 → ##, h4 → ###', () => {
    const doc = body(h('script', {}, 'alert(1)'), h('h1', {}, 'Título'), h('h4', {}, h('strong', {}, 'Sub')), h('iframe', { src: 'x' }), h('p', {}, '<b>no es html</b>'));
    expect(htmlToMarkdown(doc).text).toBe('## Título\n\n### Sub\n\n<b>no es html</b>');
  });

  it('tablas: cada celda es un párrafo; sublistas se aplanan', () => {
    const doc = body(
      h('table', {}, h('tr', {}, h('td', {}, 'Autonomía'), h('td', {}, '60 km'))),
      h('ul', {}, h('li', {}, 'a', h('ul', {}, h('li', {}, 'a1'))), h('li', {}, 'b')),
    );
    expect(htmlToMarkdown(doc).text).toBe('Autonomía\n\n60 km\n\n- a\n- a1\n- b');
  });

  it('texto vacío o solo espacios → cadena vacía', () => {
    expect(htmlToMarkdown(body(h('p', {}, '  '), h('o:p', {}))).text).toBe('');
  });
});
