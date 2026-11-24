import { describe, expect, it } from 'vitest';
import { applyFormat, diffRange, insertLink, isSafeHref, normalizeHref, parseBlocks, parseInline } from '../../src/domain/markdownLite';
import { blogRules, uniqueSlug } from '../../src/domain/blogRules';

/** Barra de formato y vista previa del editor del blog (ADR-027). */
describe('applyFormat', () => {
  it('negrita y cursiva envuelven la selección y la dejan seleccionada', () => {
    const r = applyFormat('Carga la batería', 6, 16, 'bold');
    expect(r.text).toBe('Carga **la batería**');
    expect(r.text.slice(r.start, r.end)).toBe('la batería');
    const i = applyFormat('Carga la batería', 0, 5, 'italic');
    expect(i.text).toBe('*Carga* la batería');
  });

  it('sin selección inserta un texto de ejemplo seleccionado para escribir encima', () => {
    const r = applyFormat('Hola ', 5, 5, 'bold');
    expect(r.text).toBe('Hola **texto en negrita**');
    expect(r.text.slice(r.start, r.end)).toBe('texto en negrita');
  });

  it('pulsar otra vez quita el formato (interruptor), también si se seleccionó con las marcas', () => {
    const on = applyFormat('uno dos', 4, 7, 'bold');
    const off = applyFormat(on.text, on.start, on.end, 'bold');
    expect(off.text).toBe('uno dos');
    expect(applyFormat('**dos**', 0, 7, 'bold').text).toBe('dos');
    // La cursiva no confunde las marcas de la negrita
    expect(applyFormat('**dos**', 2, 5, 'italic').text).toBe('***dos***');
  });

  it('los espacios de los bordes quedan fuera de las marcas', () => {
    expect(applyFormat('a hola b', 1, 7, 'bold').text).toBe('a **hola** b');
  });

  it('título, lista y lista numerada actúan sobre las líneas tocadas y se pueden quitar', () => {
    const text = 'Intro\nuno\ndos\nfin';
    const ul = applyFormat(text, 7, 12, 'bullets');
    expect(ul.text).toBe('Intro\n- uno\n- dos\nfin');
    expect(applyFormat(ul.text, ul.start, ul.end, 'bullets').text).toBe(text);
    const ol = applyFormat(text, 7, 12, 'numbers');
    expect(ol.text).toBe('Intro\n1. uno\n2. dos\nfin');
    // De lista a numerada se cambia la marca, no se acumula
    expect(applyFormat(ul.text, ul.start, ul.end, 'numbers').text).toBe('Intro\n1. uno\n2. dos\nfin');
    const h = applyFormat(text, 0, 0, 'heading');
    expect(h.text).toBe('## Intro\nuno\ndos\nfin');
    expect(applyFormat(h.text, 0, 0, 'heading').text).toBe(text);
  });

  it('en una línea vacía inserta la marca con un ejemplo', () => {
    const r = applyFormat('Hola\n\n', 6, 6, 'heading');
    expect(r.text).toBe('Hola\n\n## Título de la sección');
    expect(r.text.slice(r.start, r.end)).toBe('Título de la sección');
  });
});

describe('enlaces', () => {
  it('insertLink sustituye la selección por [texto](dirección)', () => {
    const r = insertLink('Mira los repuestos aquí', 9, 18, 'repuestos', '/repuestos');
    expect(r.text).toBe('Mira los [repuestos](/repuestos) aquí');
    expect(r.text.slice(r.start, r.end)).toBe('repuestos');
    expect(insertLink('', 0, 0, ' ', 'https://raiden.com.pe').text).toBe('[https://raiden.com.pe](https://raiden.com.pe)');
    expect(insertLink('', 0, 0, 'a [b] c', '/x').text).toBe('[a b c](/x)');
  });

  it('solo direcciones seguras; "raiden.com.pe/x" se completa con https://', () => {
    for (const ok of ['https://raiden.com.pe', '/repuestos', 'mailto:ventas@example.test', '#faq']) expect(isSafeHref(ok), ok).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'raiden.com.pe', '', 'https://a b']) expect(isSafeHref(bad), bad).toBe(false);
    expect(normalizeHref(' raiden.com.pe/repuestos ')).toBe('https://raiden.com.pe/repuestos');
    expect(normalizeHref('www.youtube.com')).toBe('https://www.youtube.com');
    expect(normalizeHref('/repuestos')).toBe('/repuestos');
    expect(normalizeHref('javascript:alert(1)')).toBe('javascript:alert(1)');
  });
});

describe('vista previa', () => {
  it('títulos, párrafos (líneas unidas), listas y su fin con una línea en blanco', () => {
    const blocks = parseBlocks('## Cuándo cargar\nDespués de\ncada uso.\n\n- uno\n- dos\n\n1. primero\n2. segundo\n### Detalle');
    expect(blocks.map((b) => b.t)).toEqual(['h2', 'p', 'ul', 'ol', 'h3']);
    expect(blocks[1]).toEqual({ t: 'p', c: [{ t: 'text', v: 'Después de cada uso.' }] });
    expect(blocks[2]).toEqual({ t: 'ul', items: [[{ t: 'text', v: 'uno' }], [{ t: 'text', v: 'dos' }]] });
  });

  it('negrita, cursiva y enlaces anidados', () => {
    expect(parseInline('Hola **mundo *bonito* feliz** y [la tienda](/repuestos).')).toEqual([
      { t: 'text', v: 'Hola ' },
      { t: 'b', c: [{ t: 'text', v: 'mundo ' }, { t: 'i', c: [{ t: 'text', v: 'bonito' }] }, { t: 'text', v: ' feliz' }] },
      { t: 'text', v: ' y ' },
      { t: 'a', href: '/repuestos', c: [{ t: 'text', v: 'la tienda' }] },
      { t: 'text', v: '.' },
    ]);
  });

  it('un enlace peligroso se queda como texto y el HTML nunca se interpreta', () => {
    expect(parseInline('[clic](javascript:alert(1))')).toEqual([{ t: 'text', v: '[clic](javascript:alert(1))' }]);
    expect(parseBlocks('<script>alert(1)</script>')).toEqual([{ t: 'p', c: [{ t: 'text', v: '<script>alert(1)</script>' }] }]);
  });

  it('precios con asterisco suelto o guiones bajos dentro de palabras no se convierten', () => {
    expect(parseInline('S/ 1,200 * 2 = S/ 2,400')).toEqual([{ t: 'text', v: 'S/ 1,200 * 2 = S/ 2,400' }]);
    expect(parseInline('motor_350w')).toEqual([{ t: 'text', v: 'motor_350w' }]);
  });
});

describe('diffRange (deshacer, ADR-029)', () => {
  it('devuelve el tramo mínimo a sustituir para pasar de un texto al otro', () => {
    const apply = (a: string, b: string) => {
      const d = diffRange(a, b);
      return a.slice(0, d.from) + d.insert + a.slice(d.to);
    };
    for (const [a, b] of [['Carga la batería', 'Carga **la batería**'], ['uno\ndos', '- uno\n- dos'], ['**dos**', 'dos'], ['', 'hola'], ['igual', 'igual'], ['aaa', 'aaaa']] as const) {
      expect(apply(a, b), `${a} → ${b}`).toBe(b);
    }
    // Prefijo y sufijo comunes quedan fuera: solo se reescribe lo que cambia
    expect(diffRange('Carga la batería', 'Carga **la batería**')).toEqual({ from: 6, to: 16, insert: '**la batería**' });
    expect(diffRange('uno dos', 'uno **dos** tres')).toEqual({ from: 4, to: 6, insert: '**dos** tre' }); // la «s» final es común
    expect(diffRange('igual', 'igual')).toEqual({ from: 5, to: 5, insert: '' });
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
