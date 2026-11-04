import { describe, expect, it } from 'vitest';
import { blogRules, slugify, type BlogFrontmatter } from '../../src/domain/blogRules';
import { blogSchema, parsePost } from '../../src/content/schemas';

/** Esquema + reglas de los artículos del blog que ejecuta el servidor del panel (ADR-023). */

const fm = (over: Partial<BlogFrontmatter> = {}): BlogFrontmatter => ({
  title: 'Cómo cuidar la batería',
  description: 'Guía práctica.',
  category: 'baterias',
  publishedAt: '2026-10-27T08:00:00.000Z',
  author: 'Equipo Raiden',
  relatedProducts: ['golden-eagle'],
  ...over,
});

const ctx = { productSlugs: ['golden-eagle', 'royal-tiger'] };

describe('blogSchema', () => {
  it('acepta un frontmatter válido y aplica relatedProducts por defecto', () => {
    const r = blogSchema.strict().safeParse({ title: 't', description: 'd', category: 'guias', publishedAt: '2026-01-01', author: 'a' });
    expect(r.success && r.data.relatedProducts).toEqual([]);
  });

  it('rechaza categorías desconocidas, claves extra, readingMinutes escrito a mano e imágenes inseguras', () => {
    expect(blogSchema.strict().safeParse(fm({ category: 'otra' as never })).success).toBe(false);
    expect(blogSchema.strict().safeParse({ ...fm(), readingMinutes: 5 }).success).toBe(false);
    expect(blogSchema.strict().safeParse(fm({ image: { src: 'javascript:1', alt: 'x', width: 1, height: 1 } })).success).toBe(false);
    expect(blogSchema.strict().safeParse(fm({ image: { src: '~/assets/blog/x.webp', alt: 'x', width: 0, height: 1 } })).success).toBe(false);
  });
});

describe('blogRules', () => {
  it('un artículo válido no produce errores', () => {
    expect(blogRules('como-cuidar-la-bateria', fm(), 'Texto del artículo.', ctx)).toEqual([]);
    expect(blogRules('x', fm({ image: { src: '~/assets/blog/x.webp', alt: 'Foto', width: 1600, height: 900 }, updatedAt: '2026-11-01' }), 'ok', ctx)).toEqual([]);
  });

  it('slug kebab-case, campos obligatorios, fechas y cuerpo', () => {
    expect(blogRules('Mal Slug', fm(), 'x')[0]).toMatch(/kebab-case/);
    const e = blogRules('ok', fm({ title: ' ', description: '', author: '', publishedAt: '27/10/2026', updatedAt: 'ayer' }), '   ');
    expect(e).toEqual(expect.arrayContaining([expect.stringMatching(/^title es obligatorio/), expect.stringMatching(/^description/), expect.stringMatching(/^author/), expect.stringMatching(/publishedAt/), expect.stringMatching(/updatedAt/), expect.stringMatching(/cuerpo.*vacío/)]));
    expect(blogRules('ok', fm(), 'x'.repeat(60_001))).toEqual([expect.stringMatching(/supera/)]);
  });

  it('relatedProducts existentes y sin repetir', () => {
    expect(blogRules('ok', fm({ relatedProducts: ['golden-eagle', 'golden-eagle', 'nope'] }), 'x', ctx)).toEqual(['relatedProducts repetido: golden-eagle', 'relatedProducts desconocido: nope']);
    // Sin contexto no se comprueba la existencia (el panel lo pasa siempre; el build lo valida aparte)
    expect(blogRules('ok', fm({ relatedProducts: ['nope'] }), 'x')).toEqual([]);
  });

  it('la foto debe ser un webp de src/assets/blog con alt', () => {
    expect(blogRules('ok', fm({ image: { src: '~/assets/products/x.webp', alt: 'a', width: 1, height: 1 } }), 'x')[0]).toMatch(/~\/assets\/blog/);
    expect(blogRules('ok', fm({ image: { src: '~/assets/blog/x.jpg', alt: 'a', width: 1, height: 1 } }), 'x')[0]).toMatch(/webp/);
    expect(blogRules('ok', fm({ image: { src: '~/assets/blog/x.webp', alt: ' ', width: 1, height: 1 } }), 'x')).toEqual(['image.alt es obligatorio (texto alternativo de la foto)']);
  });

  it('sin referencias a España/EUR (misma regla que validate:content)', () => {
    for (const bad of ['Cuesta 300 €', 'precio en EUR', 'necesitas carnet', 'incluye IVA']) {
      expect(blogRules('ok', fm(), bad), bad).toEqual([expect.stringMatching(/España\/EUR/)]);
    }
    expect(blogRules('ok', fm({ title: 'Precio con IVA' }), 'ok')).toHaveLength(1);
    expect(blogRules('ok', fm(), 'Cuesta S/ 1,200 con IGV y licencia; privada no es IVA')).toHaveLength(1);
    expect(blogRules('ok', fm(), 'Cuesta S/ 1,200 con IGV; se necesita licencia; equivalente')).toEqual([]);
  });
});

describe('parsePost', () => {
  it('esquema + reglas con rutas legibles', () => {
    const ok = parsePost('como-cuidar-la-bateria', fm(), 'Texto', ctx);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value).toEqual({ slug: 'como-cuidar-la-bateria', frontmatter: fm(), body: 'Texto' });
    const bad = parsePost('como-cuidar-la-bateria', { ...fm(), category: 'x', extra: 1 }, 'Texto', ctx);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.some((e) => e.startsWith('category'))).toBe(true);
    const rules = parsePost('x', fm({ relatedProducts: ['nope'] }), '', ctx);
    expect(!rules.ok && rules.errors).toEqual(['relatedProducts desconocido: nope', 'el cuerpo del artículo está vacío']);
    expect(parsePost('x', fm(), 42 as never).ok).toBe(false);
  });
});

describe('slugify', () => {
  it('propone slugs kebab-case sin tildes ni signos', () => {
    expect(slugify('¿Cómo elegir una bicimoto eléctrica?')).toBe('como-elegir-una-bicimoto-electrica');
    expect(slugify('  Ñandú & Co. — 2026!  ')).toBe('nandu-co-2026');
    expect(slugify('')).toBe('');
    expect(slugify('a'.repeat(100))).toHaveLength(80);
  });
});
