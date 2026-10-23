import { describe, it, expect } from 'vitest';
import { absolute, buildTitle, canonical, clampDescription } from '../../src/lib/seo/meta';
import {
  partSchema,
  articleSchema,
  breadcrumbSchema,
  faqSchema,
  itemListSchema,
  organizationSchema,
  productSchema,
  websiteSchema,
} from '../../src/lib/seo/jsonld';
import { site } from '../../src/config/site';
import { pen } from '../../src/domain/money';
import { makePart, makeProduct, variant } from './fixtures';

const BASE = site.url;

describe('config/site en tests', () => {
  it('lee PUBLIC_* desde vitest.config', () => {
    expect(BASE).toBe('https://raiden.test');
    expect(site.whatsappNumber).toBe('51987654321');
  });
});

describe('meta.buildTitle', () => {
  it('añade la marca con separador', () => {
    expect(buildTitle('Catálogo')).toBe('Catálogo · Raiden');
  });
  it('no duplica la marca si ya está incluida', () => {
    expect(buildTitle('Raiden: motos eléctricas')).toBe('Raiden: motos eléctricas');
    expect(buildTitle('Repuestos Raiden')).toBe('Repuestos Raiden');
  });
});

describe('meta.canonical', () => {
  it('raíz → URL del sitio sin barra final', () => {
    expect(canonical('/')).toBe(BASE);
    expect(canonical('')).toBe(BASE);
    expect(canonical('///')).toBe(BASE);
  });
  it('elimina barras finales', () => {
    expect(canonical('/bicimotos/')).toBe(`${BASE}/bicimotos`);
    expect(canonical('/bicimotos//')).toBe(`${BASE}/bicimotos`);
    expect(canonical('/bicimotos/golden-eagle')).toBe(`${BASE}/bicimotos/golden-eagle`);
  });
});

describe('meta.absolute', () => {
  it('prefija rutas relativas y respeta URLs absolutas', () => {
    expect(absolute('/img.png')).toBe(`${BASE}/img.png`);
    expect(absolute('https://cdn.example/x.png')).toBe('https://cdn.example/x.png');
  });
});

describe('meta.clampDescription', () => {
  it('normaliza espacios y deja intacto lo que cabe', () => {
    expect(clampDescription('  hola   mundo \n ok ')).toBe('hola mundo ok');
    expect(clampDescription('a'.repeat(158))).toHaveLength(158);
  });
  it('corta en límite de palabra y añade elipsis, sin pasar de max', () => {
    const words = Array.from({ length: 60 }, (_, i) => `palabra${i}`).join(' ');
    const out = clampDescription(words);
    expect(out.length).toBeLessThanOrEqual(158);
    expect(out.endsWith('…')).toBe(true);
    expect(out.slice(0, -1)).not.toMatch(/\s$/);
    expect(words.startsWith(out.slice(0, -1))).toBe(true);
    // no corta una palabra por la mitad
    const lastWord = out.slice(0, -1).split(' ').pop()!;
    expect(words.split(' ')).toContain(lastWord);
  });
  it('respeta max personalizado', () => {
    expect(clampDescription('uno dos tres cuatro', 10)).toBe('uno dos…');
  });
});

describe('jsonld.productSchema', () => {
  const p = makeProduct({
    slug: 'golden-eagle',
    name: 'Golden Eagle',
    variants: [
      variant({ id: 'a', price: pen(499900), availability: 'agotado', sku: 'SKU-A' }),
      variant({ id: 'b', price: pen(549900), availability: 'bajo-pedido' }),
    ],
  });
  const url = `${BASE}/bicimotos/golden-eagle`;

  it('precios low/high en soles con 2 decimales y offerCount', () => {
    const s = productSchema(p, url, ['img1']);
    expect(s['@type']).toBe('Product');
    expect(s.offers.priceCurrency).toBe('PEN');
    expect(s.offers.lowPrice).toBe('4999.00');
    expect(s.offers.highPrice).toBe('5499.00');
    expect(s.offers.offerCount).toBe(2);
    expect(s.sku).toBe('SKU-A');
    expect(s.image).toEqual(['img1']);
    expect(s.url).toBe(url);
  });

  it('mapea availability al mejor estado de las variantes', () => {
    expect(productSchema(p, url, []).offers.availability).toBe('https://schema.org/BackOrder');
    const mk = (a: 'en-stock' | 'proximamente' | 'agotado') => productSchema(makeProduct({ variants: [variant({ availability: a })] }), url, []);
    expect(mk('en-stock').offers.availability).toBe('https://schema.org/InStock');
    expect(mk('proximamente').offers.availability).toBe('https://schema.org/PreOrder');
    expect(mk('agotado').offers.availability).toBe('https://schema.org/OutOfStock');
  });

  it('aggregateRating solo con reviews, con media a 1 decimal', () => {
    expect(productSchema(p, url, [])).not.toHaveProperty('aggregateRating');
    expect(productSchema(makeProduct({ reviews: [] }), url, [])).not.toHaveProperty('aggregateRating');
    const withReviews = makeProduct({
      reviews: [
        { author: 'A', rating: 5, text: 't', date: '2025-01-01' },
        { author: 'B', rating: 4, text: 't', date: '2025-01-02' },
      ],
    });
    const s = productSchema(withReviews, url, []) as { aggregateRating?: { ratingValue: string; reviewCount: number } };
    expect(s.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: '4.5', reviewCount: 2 });
  });

  it('sku cae al id si la primera variante no tiene sku', () => {
    expect(productSchema(makeProduct({ id: 'ID1', variants: [variant({ sku: undefined })] }), url, []).sku).toBe('ID1');
  });
});

describe('jsonld.breadcrumbSchema', () => {
  it('posiciones consecutivas y URLs absolutas', () => {
    const s = breadcrumbSchema([
      { name: 'Inicio', url: '/' },
      { name: 'Bicimotos', url: '/bicimotos' },
      { name: 'Ext', url: 'https://ext.example/x' },
    ]);
    expect(s['@type']).toBe('BreadcrumbList');
    expect(s.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(s.itemListElement[0]!.item).toBe(`${BASE}/`);
    expect(s.itemListElement[1]!.item).toBe(`${BASE}/bicimotos`);
    expect(s.itemListElement[2]!.item).toBe('https://ext.example/x');
  });
});

describe('jsonld.faqSchema', () => {
  it('mapea preguntas/respuestas', () => {
    const s = faqSchema([{ question: '¿Q?', answer: 'A' }]);
    expect(s['@type']).toBe('FAQPage');
    expect(s.mainEntity).toEqual([{ '@type': 'Question', name: '¿Q?', acceptedAnswer: { '@type': 'Answer', text: 'A' } }]);
  });
  it('lista vacía → mainEntity vacío', () => {
    expect(faqSchema([]).mainEntity).toEqual([]);
  });
});

describe('jsonld: otros esquemas', () => {
  it('organization/website usan site', () => {
    const o = organizationSchema();
    expect(o.url).toBe(BASE);
    expect(o.contactPoint[0]!.telephone).toBe('+51987654321');
    expect(websiteSchema().url).toBe(BASE);
  });
  it('partSchema: Product con Offer en PEN, precio con 2 decimales, sku = id, imagen opcional', () => {
    const part = makePart({ id: 'rp-04', slug: 'motor-350w', name: 'Motor 350 W', price: pen(35000), kind: 'motor', availability: 'bajo-pedido' });
    const s = partSchema(part, `${BASE}/repuestos/motor-350w`, 'img');
    expect(s['@type']).toBe('Product');
    expect(s.sku).toBe('rp-04');
    expect(s.category).toBe('Repuestos');
    expect(s.offers['@type']).toBe('Offer');
    expect(s.offers.priceCurrency).toBe('PEN');
    expect(s.offers.price).toBe('350.00');
    expect(s.offers.availability).toBe('https://schema.org/BackOrder');
    expect(s.offers.url).toBe(`${BASE}/repuestos/motor-350w`);
    expect(s.image).toEqual(['img']);
    expect(partSchema(part, 'u')).not.toHaveProperty('image');
  });
  it('articleSchema usa publishedAt como dateModified si no hay updatedAt', () => {
    const post = { slug: 's', title: 'T', description: 'D', category: 'guias' as const, publishedAt: '2025-01-01', author: 'Raiden', readingMinutes: 3, relatedProducts: [] };
    expect(articleSchema(post, 'u').dateModified).toBe('2025-01-01');
    expect(articleSchema({ ...post, updatedAt: '2025-02-01' }, 'u').dateModified).toBe('2025-02-01');
  });
  it('itemListSchema absolutiza urls con posiciones', () => {
    const s = itemListSchema([{ name: 'A', url: '/a' }]);
    expect(s.itemListElement[0]).toEqual({ '@type': 'ListItem', position: 1, name: 'A', url: `${BASE}/a` });
  });
});
