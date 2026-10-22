import type { BlogPost, FAQ, Part, Product } from '../../domain/types';
import { site } from '../../config/site';
import { availabilityLabel, fromPrice, productAvailability } from '../../domain/product';

/** Constructores de JSON-LD (schema.org). Salida serializada en <SeoHead>. */

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    url: site.url,
    logo: `${site.url}/favicon.svg`,
    sameAs: Object.values(site.social),
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'sales',
        telephone: `+${site.whatsappNumber}`,
        availableLanguage: ['es'],
      },
    ],
  };
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: site.url,
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url.startsWith('http') ? it.url : `${site.url}${it.url}`,
    })),
  };
}

const schemaAvailability: Record<ReturnType<typeof productAvailability>, string> = {
  'en-stock': 'https://schema.org/InStock',
  'bajo-pedido': 'https://schema.org/BackOrder',
  proximamente: 'https://schema.org/PreOrder',
  agotado: 'https://schema.org/OutOfStock',
};

export function productSchema(p: Product, url: string, imageUrls: string[]) {
  const price = fromPrice(p);
  const reviews = p.reviews ?? [];
  const rating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.description,
    sku: p.variants[0]?.sku ?? p.id,
    brand: { '@type': 'Brand', name: p.brand },
    category: p.category,
    image: imageUrls,
    url,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'PEN',
      lowPrice: (price.amount / 100).toFixed(2),
      highPrice: (Math.max(...p.variants.map((v) => v.price.amount)) / 100).toFixed(2),
      offerCount: p.variants.length,
      availability: schemaAvailability[productAvailability(p)],
      url,
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Autonomía', value: `${p.specs.rangeKm} km` },
      { '@type': 'PropertyValue', name: 'Velocidad máxima', value: `${p.specs.topSpeedKmh} km/h` },
      { '@type': 'PropertyValue', name: 'Potencia', value: `${p.specs.powerW} W` },
      { '@type': 'PropertyValue', name: 'Disponibilidad', value: availabilityLabel[productAvailability(p)] },
    ],
    ...(rating
      ? {
          aggregateRating: { '@type': 'AggregateRating', ratingValue: rating.toFixed(1), reviewCount: reviews.length },
        }
      : {}),
  };
}

export function partSchema(a: Part, url: string, imageUrl?: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: a.name,
    description: a.description,
    sku: a.id,
    brand: { '@type': 'Brand', name: site.name },
    category: 'Repuestos',
    ...(imageUrl ? { image: [imageUrl] } : {}),
    url,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'PEN',
      price: (a.price.amount / 100).toFixed(2),
      availability: schemaAvailability[a.availability],
      url,
    },
  };
}

export function faqSchema(faqs: FAQ[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

export function articleSchema(post: BlogPost, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    author: { '@type': 'Organization', name: post.author },
    publisher: { '@type': 'Organization', name: site.name, url: site.url },
    mainEntityOfPage: url,
  };
}

export function itemListSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, url: `${site.url}${it.url}` })),
  };
}
export const accessorySchema = partSchema;
