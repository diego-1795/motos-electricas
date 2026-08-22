# 08 — SEO

Voltia se posiciona como showroom digital de movilidad eléctrica en España. El SEO es orgánico y de catálogo: cada producto, categoría y artículo del blog es una página estática con HTML completo, sin dependencia de JS para el contenido indexable. Ver [01-architecture](./01-architecture.md), [04-frontend](./04-frontend.md), [09-performance](./09-performance.md) y [15-content-strategy](./15-content-strategy.md).

## 1. Estrategia de palabras clave

Idioma objetivo: español de España. Sin versión multi-idioma en MVP (no se emite `hreflang`).

| Categoría | Keyword principal | Secundarias | Intención | Ruta |
|---|---|---|---|---|
| Home | movilidad eléctrica | showroom motos eléctricas, comprar moto eléctrica | Navegacional / comercial | `/` |
| Motos (hub) | motos eléctricas | moto eléctrica precio, moto eléctrica España | Comercial | `/motos-electricas` |
| Scooters | scooter eléctrico | scooter eléctrico 125, patinete vs scooter | Comercial | `/scooters-electricos` |
| Urbanas | moto eléctrica urbana | moto eléctrica ciudad, carnet B moto eléctrica | Comercial | `/motos-electricas-urbanas` |
| Bicimotos | bicimoto eléctrica | ciclomotor eléctrico, bicimoto sin carnet | Comercial | `/bicimotos` |
| Trimotos | trimoto eléctrica | moto tres ruedas eléctrica | Comercial | `/trimotos` |
| Carga | vehículo eléctrico de carga | moto de carga eléctrica, reparto eléctrico | Comercial B2B | `/vehiculos-carga` |
| Cuatrimotos | cuatrimoto eléctrica | quad eléctrico | Comercial | `/cuatrimotos` |
| Accesorios | accesorios moto eléctrica | batería adicional, casco, cargador | Transaccional | `/accesorios` |
| Producto | `{marca} {modelo}` | `{modelo} precio`, `{modelo} autonomía` | Transaccional | `/motos-electricas/[slug]` |
| Comparador | comparar motos eléctricas | `{modelo A} vs {modelo B}` | Informacional | `/comparar` (noindex) |
| Finder | qué moto eléctrica comprar | moto eléctrica para ciudad | Informacional | `/encuentra-tu-moto` |
| Blog | guías movilidad eléctrica | autonomía real, carnet, subvenciones MOVES | Informacional | `/blog/[slug]` |
| Garantía / FAQ | garantía moto eléctrica | mantenimiento batería litio | Informacional | `/garantia`, `/faq` |

Reglas: una keyword principal por URL; no canibalizar (una sola página por categoría); las keywords informacionales van al blog y enlazan a categoría/producto.

## 2. Arquitectura de URLs y metadatos

`trailingSlash: 'never'`, minúsculas, guiones, sin acentos ni parámetros. Slugs derivados del nombre del producto (`odin-1-0`). Las URLs son contratos: un cambio de slug exige redirección 301 en `public/_redirects`.

| Ruta | Patrón `<title>` (≤ 60 car.) | Patrón `description` (≤ 155 car.) | Index |
|---|---|---|---|
| `/` | Voltia — Motos eléctricas y movilidad urbana | Showroom de motos, scooters y vehículos eléctricos. Compara, configura y pide por WhatsApp. | sí |
| `/motos-electricas` | Motos eléctricas — Catálogo \| Voltia | Todas las motos eléctricas: urbanas, scooters, bicimotos y más. Precios y autonomía. | sí |
| `/motos-electricas/[slug]` | `{nombre}` — Moto eléctrica `{autonomía} km` \| Voltia | `{nombre}`: `{potencia}`, `{autonomía}` km, desde `{precio}` €. Configura color y batería. | sí |
| `/scooters-electricos` y resto de categorías | `{Categoría}` eléctricos \| Voltia | `{descripción corta de la categoría}` | sí |
| `/accesorios` | Accesorios para moto eléctrica \| Voltia | Baterías, cascos, cargadores y más. | sí |
| `/accesorios/[slug]` | `{nombre}` \| Accesorios Voltia | `{descripción corta}` | sí |
| `/comparar` | Comparar motos eléctricas \| Voltia | — | noindex |
| `/encuentra-tu-moto` | Encuentra tu moto eléctrica \| Voltia | Responde 4 preguntas y te recomendamos el modelo ideal. | sí |
| `/carrito` | Tu solicitud de pedido \| Voltia | — | noindex |
| `/blog` | Blog de movilidad eléctrica \| Voltia | Guías, comparativas y consejos. | sí |
| `/blog/[slug]` | `{título}` \| Blog Voltia | `{extracto}` | sí |
| `/garantia`, `/contacto`, `/faq` | `{Sección}` \| Voltia | `{texto fijo}` | sí |
| `/legal/*` | `{Documento legal}` \| Voltia | — | noindex, follow |
| `404` | Página no encontrada \| Voltia | — | noindex |

## 3. Builder de metadatos (`src/lib/seo/`)

```
src/lib/seo/
  meta.ts          # buildMeta(input): SeoMeta
  jsonld/
    organization.ts
    product.ts
    breadcrumb.ts
    faq.ts
    article.ts
  index.ts
```

```ts
// src/lib/seo/meta.ts
export interface SeoInput {
  title: string; description: string; path: string;
  image?: string; noindex?: boolean; type?: 'website' | 'article' | 'product';
}
export interface SeoMeta {
  title: string; description: string; canonical: string;
  robots: string; og: Record<string, string>; twitter: Record<string, string>;
}
export function buildMeta(i: SeoInput, site = SITE.url): SeoMeta {
  const canonical = new URL(i.path, site).toString();
  const title = i.title.length > 60 ? i.title.slice(0, 57) + '…' : i.title;
  return {
    title, description: i.description.slice(0, 155), canonical,
    robots: i.noindex ? 'noindex, follow' : 'index, follow',
    og: { 'og:type': i.type ?? 'website', 'og:title': title, 'og:description': i.description,
          'og:url': canonical, 'og:image': new URL(i.image ?? '/og/default.jpg', site).toString(),
          'og:locale': 'es_ES', 'og:site_name': SITE.name },
    twitter: { 'twitter:card': 'summary_large_image', 'twitter:title': title,
               'twitter:description': i.description }
  };
}
```

El componente `src/components/seo/Seo.astro` recibe `SeoMeta` y los bloques JSON-LD, y los renderiza en `<head>` desde `BaseLayout`. Todos los builders son funciones puras testadas en Vitest ([11-testing](./11-testing.md)).

## 4. JSON-LD

Un `<script type="application/ld+json">` por entidad. `@context` siempre `https://schema.org`. Sin precios online no hay checkout, pero sí hay precio público, por lo que `Product` lleva `offers`.

```json
{ "@type": "Organization", "name": "Voltia", "url": "https://voltia.example.com",
  "logo": "https://voltia.example.com/logo.png",
  "contactPoint": { "@type": "ContactPoint", "contactType": "sales",
    "telephone": "+34XXXXXXXXX", "availableLanguage": "es" } }
```

```json
{ "@type": "Product", "name": "ODIN 1.0", "brand": { "@type": "Brand", "name": "Voltia" },
  "sku": "odin-1-0-72v50ah", "image": ["https://voltia.example.com/_astro/odin-1.avif"],
  "description": "Moto eléctrica urbana, 72V 50Ah, 120 km de autonomía.",
  "offers": { "@type": "Offer", "price": "5499", "priceCurrency": "EUR",
    "availability": "https://schema.org/InStock",
    "url": "https://voltia.example.com/motos-electricas/odin-1-0", "itemCondition": "https://schema.org/NewCondition" } }
```

Reglas de `Product`: precio de la variante base; `availability` derivada del campo `stock` del JSON (`InStock`, `PreOrder`, `OutOfStock`); `aggregateRating` solo cuando existan reseñas reales en `reviews`.

```json
{ "@type": "BreadcrumbList", "itemListElement": [
  { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://voltia.example.com/" },
  { "@type": "ListItem", "position": 2, "name": "Motos eléctricas", "item": "https://voltia.example.com/motos-electricas" },
  { "@type": "ListItem", "position": 3, "name": "ODIN 1.0" } ] }
```

```json
{ "@type": "FAQPage", "mainEntity": [ { "@type": "Question", "name": "¿Necesito carnet?",
  "acceptedAnswer": { "@type": "Answer", "text": "Depende de la categoría: L1e con AM, L3e con A1/B+3 años." } } ] }
```

```json
{ "@type": "Article", "headline": "Autonomía real de una moto eléctrica", "datePublished": "2026-09-01",
  "dateModified": "2026-09-01", "author": { "@type": "Organization", "name": "Voltia" },
  "image": "https://voltia.example.com/blog/autonomia.jpg", "mainEntityOfPage": "https://voltia.example.com/blog/autonomia-real" }
```

`FAQPage` solo en `/faq` y en productos con bloque de preguntas visible; nunca ocultar el texto.

## 5. Sitemap, robots y canonical

- `@astrojs/sitemap` ya configurado: filtro que excluye `/carrito` y `/comparar`, `changefreq: weekly`. Añadir a la exclusión `/404` y `/legal/*` si procede.
- `public/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /carrito
Disallow: /comparar
Sitemap: https://voltia.example.com/sitemap-index.xml
```

- Canonical absoluta en todas las páginas, generada desde `site` de `astro.config.mjs` (`PUBLIC_SITE_URL`). Sin parámetros de consulta; las páginas de categoría con filtros en la URL (`?marca=`) se resuelven en cliente y mantienen canonical limpia.
- `noindex` por meta robots (no en robots.txt) para carrito, comparador y 404, de modo que se sigan los enlaces.

## 6. Open Graph, Twitter e imágenes

- OG/Twitter salen de `buildMeta`. Imagen por defecto `public/og/default.jpg` (1200×630). Productos: imagen principal del producto renderizada a 1200×630 en build.
- Imágenes de producto en `src/assets/products/{slug}/{slug}-{vista}.jpg` (p. ej. `odin-1-0-lateral.jpg`). `alt` descriptivo y específico: "ODIN 1.0 en color negro, vista lateral". Nunca `alt` vacío en imágenes de contenido; `alt=""` solo en decorativas.
- AVIF/WebP con `<Picture>`; `width`/`height` explícitos (evitan CLS, factor de ranking vía Core Web Vitals).

## 7. Core Web Vitals

Google usa CWV como señal. Presupuestos en [09-performance](./09-performance.md): LCP < 2,0 s, INP < 200 ms, CLS < 0,1. Lighthouse CI bloquea PR que incumplan. El contenido indexable nunca depende de islas Preact.

## 8. Enlazado interno

- Breadcrumbs en todas las páginas de catálogo y blog (visibles + JSON-LD).
- Producto → categoría, 3 productos relacionados (misma categoría), accesorios compatibles, artículo del blog relevante.
- Categoría → todos sus productos, enlace al finder y a la comparativa de la categoría.
- Blog → producto/categoría con anchor descriptivo ("ver la ODIN 1.0"), nunca "clic aquí".
- Footer: categorías, garantía, FAQ, contacto, legal. Máximo 3 niveles de profundidad desde la home.

## 9. Blog y contenido

El blog sostiene las keywords informacionales (carnet, subvenciones, autonomía, mantenimiento). Cada artículo: H1 único, H2 por sección, 900–1.500 palabras, `Article` JSON-LD, fecha visible, enlace a producto. Calendario y tono en [15-content-strategy](./15-content-strategy.md). Contenido en `src/content/blog/*.md`.

## 10. Checklist por página

- [ ] `title` único ≤ 60 caracteres con keyword principal.
- [ ] `description` única ≤ 155 caracteres con llamada a la acción.
- [ ] Un solo H1; jerarquía H2/H3 sin saltos.
- [ ] Canonical absoluta correcta; robots coherente con la tabla.
- [ ] JSON-LD válido (Rich Results Test) y coherente con el contenido visible.
- [ ] Breadcrumb visible + `BreadcrumbList`.
- [ ] Imágenes con `alt`, dimensiones y formato moderno.
- [ ] OG image 1200×630 presente.
- [ ] Enlaces internos: al menos 3 salientes contextuales.
- [ ] Página presente en `sitemap-index.xml` (o excluida a propósito).
- [ ] Lighthouse SEO = 100 y CWV dentro de presupuesto.
