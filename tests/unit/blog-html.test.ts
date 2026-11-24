import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blogHtmlToText, validateBlogHtml, youtubeWatchUrl } from '../../src/domain/blogHtml';
import { markdownToHtml } from '../../src/domain/markdownLite';
import { blogRules } from '../../src/domain/blogRules';

/** Formato HTML del editor visual del blog (ADR-031): lista blanca estricta y forma fija. */

const BLOG_DIR = join(process.cwd(), 'src/content/blog');

describe('validateBlogHtml: lo que produce el editor', () => {
  it('acepta títulos, párrafos centrados, marcas, colores, resaltado, listas, citas, avisos, tablas, separador y vídeo', () => {
    const html = [
      '<h2 class="al-centro">Cuidado de la batería</h2>',
      '<p>Carga <strong>cada noche</strong>, <em>sin</em> <u>prisas</u> y <s>nunca</s> al <mark>100 %</mark> con <span class="tc-azul">calma</span>.<br>Otra línea &amp; más.</p>',
      '<ul><li><p>uno</p><ol start="3"><li><p>anidado</p></li></ol></li><li><p><a href="https://raiden.com.pe/repuestos" target="_blank" rel="noopener noreferrer nofollow">repuestos</a></p></li></ul>',
      '<blockquote><p>Una cita</p></blockquote>',
      '<aside class="aviso aviso--importante"><p>No dejes la batería al sol.</p></aside>',
      '<table><tbody><tr><th><p>Modelo</p></th><th colspan="2"><p>Autonomía</p></th></tr><tr><td><p>Golden</p></td><td><p>60 km</p></td><td><p></p></td></tr></tbody></table>',
      '<hr>',
      `<figure class="blog-video" data-youtube="dQw4w9WgXcQ"><a href="${youtubeWatchUrl('dQw4w9WgXcQ')}">Ver el vídeo en YouTube</a></figure>`,
      '<p><a href="/repuestos">interno</a> y <a href="mailto:ventas@example.test">correo</a></p>',
    ].join('\n\n');
    expect(validateBlogHtml(html)).toEqual([]);
  });

  it('rechaza todo lo ejecutable o fuera de la lista blanca', () => {
    const bad: [string, RegExp][] = [
      ['<p><script>alert(1)</script></p>', /script/],
      ['<p onclick="x()">hola</p>', /onclick/],
      ['<p style="color:red">hola</p>', /style/],
      ['<p><a href="javascript:alert(1)">x</a></p>', /Valor no permitido/],
      ['<p><a href="java&#115;cript:alert(1)">x</a></p>', /Valor no permitido/],
      ['<p><span class="tc-morado">x</span></p>', /Valor no permitido/],
      ['<p><img src="x" onerror="y"></p>', /<img>/],
      ['<iframe src="https://evil.test"></iframe>', /<iframe>/],
      ['<p>sin cerrar', /cierre/],
      ['<p>a</strong></p>', /mal anidadas/],
      ['texto suelto', /fuera de un párrafo/],
      ['<p>a & b</p>', /&/],
      ['<p>uno\n\ndos</p>', /Salto de línea/],
      ['<li><p>x</p></li>', /fuera de un párrafo/],
      ['<p><p>x</p></p>', /dentro de <p>/],
      ['<p>x</p>\n    <p>sangrado</p>', /su propia línea/],
      ['<figure class="blog-video" data-youtube="dQw4w9WgXcQ"><a href="https://evil.test">x</a></figure>', /no coincide/],
      ['<figure class="blog-video" data-youtube="nope"><a href="x">x</a></figure>', /Valor no permitido/],
      ['<!-- comentario --><p>x</p>', /mal formada/],
      ['<P>mayúsculas</P>', /mal formada/],
    ];
    for (const [html, re] of bad) {
      const errs = validateBlogHtml(html);
      expect(errs.length, html).toBeGreaterThan(0);
      expect(errs.join(' | '), html).toMatch(re);
    }
  });

  it('blogHtmlToText: texto legible sin etiquetas, con entidades y sin el vídeo', () => {
    expect(blogHtmlToText('<h2>Hola</h2>\n\n<p>a &amp; <strong>b</strong></p>\n\n<figure class="blog-video" data-youtube="dQw4w9WgXcQ"><a href="x">Ver</a></figure>')).toBe('Hola a & b');
    expect(blogHtmlToText('<p></p>')).toBe('');
  });
});

describe('blogRules con format: html', () => {
  const fm = { title: 'T', description: 'D', category: 'guias' as const, publishedAt: '2026-11-24T08:00:00.000Z', author: 'A', relatedProducts: [], format: 'html' as const };
  it('valida la lista blanca, el vacío y la regla de mercado sobre el texto', () => {
    expect(blogRules('t', fm, '<p>Hola</p>')).toEqual([]);
    expect(blogRules('t', fm, '<p></p>')).toEqual(['El texto del artículo está vacío']);
    expect(blogRules('t', { ...fm, draft: true }, '<p></p>')).toEqual([]);
    expect(blogRules('t', fm, '<p onclick="x">Hola</p>').join(' ')).toMatch(/onclick/);
    expect(blogRules('t', fm, '<p>Cuesta 300 €</p>').join(' ')).toMatch(/España o del euro/);
  });
});

describe('markdownToHtml: los artículos actuales se abren en el editor visual', () => {
  it('cada artículo de src/content/blog se convierte a HTML válido, con sus tablas y sin perder texto', () => {
    const files = readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);
    let tables = 0;
    for (const f of files) {
      const body = readFileSync(join(BLOG_DIR, f), 'utf8').split(/^---\s*$/m).slice(2).join('---');
      const html = markdownToHtml(body);
      expect(validateBlogHtml(html), f).toEqual([]);
      tables += (html.match(/<table>/g) ?? []).length;
      // Ninguna marca de Markdown sobrevive como texto (salvo asteriscos sueltos de precios)
      expect(blogHtmlToText(html), f).not.toMatch(/\*\*|^#|\]\(/m);
    }
    expect(tables).toBeGreaterThan(0);
  });

  it('tabla GFM, cita, separador, tachado y enlace inseguro', () => {
    expect(markdownToHtml('| A | B |\n|---|:---:|\n| 1 | **2** |\n\n> cita\n\n---\n\n~~no~~ [x](javascript:alert(1))')).toBe(
      '<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p><strong>2</strong></p></td></tr></tbody></table>\n\n<blockquote><p>cita</p></blockquote>\n\n<hr>\n\n<p><s>no</s> [x](javascript:alert(1))</p>',
    );
  });
});
