import { describe, expect, it } from 'vitest';
import { isSafeHref, parseBlocks, parseInline } from '../../src/domain/markdownLite';
import { blogRules, uniqueSlug } from '../../src/domain/blogRules';

/** Lectura del Markdown de los artículos anteriores al editor visual (ADR-031) y utilidades del editor. */
describe('parseBlocks / parseInline', () => {
  it('títulos, párrafos (líneas unidas), listas y su fin con una línea en blanco', () => {
    const blocks = parseBlocks('## Cuándo cargar\nDespués de\ncada uso.\n\n- uno\n- dos\n\n1. primero\n2. segundo\n### Detalle');
    expect(blocks.map((b) => b.t)).toEqual(['h2', 'p', 'ul', 'ol', 'h3']);
    expect(blocks[1]).toEqual({ t: 'p', c: [{ t: 'text', v: 'Después de cada uso.' }] });
    expect(blocks[2]).toEqual({ t: 'ul', items: [[{ t: 'text', v: 'uno' }], [{ t: 'text', v: 'dos' }]] });
  });

  it('negrita, cursiva, tachado y enlaces anidados', () => {
    expect(parseInline('Hola **mundo *bonito* feliz** ~~no~~ y [la tienda](/repuestos).')).toEqual([
      { t: 'text', v: 'Hola ' },
      { t: 'b', c: [{ t: 'text', v: 'mundo ' }, { t: 'i', c: [{ t: 'text', v: 'bonito' }] }, { t: 'text', v: ' feliz' }] },
      { t: 'text', v: ' ' },
      { t: 's', c: [{ t: 'text', v: 'no' }] },
      { t: 'text', v: ' y ' },
      { t: 'a', href: '/repuestos', c: [{ t: 'text', v: 'la tienda' }] },
      { t: 'text', v: '.' },
    ]);
  });

  it('un enlace peligroso se queda como texto; precios con asterisco o guiones bajos no se convierten', () => {
    expect(parseInline('[clic](javascript:alert(1))')).toEqual([{ t: 'text', v: '[clic](javascript:alert(1))' }]);
    expect(parseInline('S/ 1,200 * 2 = S/ 2,400')).toEqual([{ t: 'text', v: 'S/ 1,200 * 2 = S/ 2,400' }]);
    expect(parseInline('motor_350w')).toEqual([{ t: 'text', v: 'motor_350w' }]);
  });

  it('tablas GFM con alineación y celdas que faltan', () => {
    const [t] = parseBlocks('| Modelo | Autonomía |\n|:--|--:|\n| Golden | 60 km |\n| Tigre |');
    expect(t).toEqual({
      t: 'table',
      head: [[{ t: 'text', v: 'Modelo' }], [{ t: 'text', v: 'Autonomía' }]],
      rows: [[[{ t: 'text', v: 'Golden' }], [{ t: 'text', v: '60 km' }]], [[{ t: 'text', v: 'Tigre' }]]],
    });
  });

  it('isSafeHref: solo https, rutas del sitio, mailto y #', () => {
    for (const ok of ['https://raiden.com.pe', '/repuestos', 'mailto:ventas@example.test', '#faq']) expect(isSafeHref(ok), ok).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'raiden.com.pe', '', 'https://a b']) expect(isSafeHref(bad), bad).toBe(false);
  });
});

describe('blogRules con borrador (ADR-029)', () => {
  const fm = { title: 'A medias', description: '', category: 'guias' as const, publishedAt: '2026-11-24T08:00:00.000Z', author: '', relatedProducts: [] };
  it('un borrador solo exige título; publicado exige descripción, autor y texto', () => {
    expect(blogRules('a-medias', { ...fm, draft: true }, '')).toEqual([]);
    expect(blogRules('a-medias', { ...fm, title: '', draft: true }, '')).toEqual(['El título es obligatorio']);
    expect(blogRules('a-medias', fm, '')).toEqual(['La descripción es obligatoria', 'El autor es obligatorio', 'El texto del artículo está vacío']);
    // Las reglas de seguridad siguen en el borrador
    expect(blogRules('a-medias', { ...fm, draft: true }, '<script>x</script>')).toHaveLength(1);
  });
});

describe('uniqueSlug', () => {
  it('añade -2, -3… si la dirección ya existe, sin pasar de 80 caracteres', () => {
    expect(uniqueSlug('precios', [])).toBe('precios');
    expect(uniqueSlug('precios', ['precios'])).toBe('precios-2');
    expect(uniqueSlug('precios', ['precios', 'precios-2'])).toBe('precios-3');
    const long = 'a'.repeat(80);
    expect(uniqueSlug(long, [long])).toHaveLength(80);
    expect(uniqueSlug('', ['x'])).toBe('');
  });
});
