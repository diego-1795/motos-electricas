# 08 — SEO

Raiden se posiciona como showroom digital de movilidad eléctrica en el Perú. El SEO es orgánico y de catálogo: cada producto, categoría y artículo del blog es una página estática con HTML completo, sin dependencia de JS para el contenido indexable. Ver [01-architecture](./01-architecture.md), [04-frontend](./04-frontend.md), [09-performance](./09-performance.md) y [15-content-strategy](./15-content-strategy.md).

## 1. Estrategia de palabras clave

Idioma objetivo: español del Perú (`es-PE`). Sin versión multi-idioma en MVP (no se emite `hreflang`).

| Categoría | Keyword principal | Secundarias | Intención | Ruta |
|---|---|---|---|---|
| Home | bicimotos eléctricas RAIDEN | trimoto eléctrica de carga, bicimoto eléctrica en Lima, distribuidor oficial RAIDEN | Navegacional / comercial | `/` |
| Catálogo (hub) | bicimotos y trimotos eléctricas | precio en soles, comprar bicimoto eléctrica Perú | Comercial | `/productos` |
| Bicimotos | bicimoto eléctrica | bicimoto eléctrica sin licencia, bicimoto eléctrica Lima, Golden Eagle, Royal Tiger, Vortex Kobra | Comercial | `/bicimotos` |
| Trimotos | trimoto eléctrica de carga | moto de carga eléctrica, trimoto eléctrica Perú, Titan Rhino | Comercial B2B | `/trimotos` |
| Repuestos | repuestos bicimoto eléctrica | batería Chilwee 48V, motor 500 W, controlador, cargador | Transaccional | `/repuestos` |
| Producto | `{modelo}` RAIDEN | `{modelo} precio`, `{modelo} autonomía` | Transaccional | `/bicimotos/[slug]`, `/trimotos/[slug]` |
| Repuesto | `{repuesto}` RAIDEN | `{repuesto} precio`, `{repuesto} {modelo}` | Transaccional | `/repuestos/[slug]` |
| Comparador | comparar bicimotos eléctricas | `{modelo A} vs {modelo B}` | Informacional | `/comparar` (noindex) |
| Finder | qué bicimoto eléctrica comprar | bicimoto eléctrica para ciudad | Informacional | `/encuentra-tu-moto` |
| Blog | guías bicimoto eléctrica | autonomía real, licencia MTC (¿necesito licencia?), cuidado de la batería | Informacional | `/blog/[slug]` |
| Garantía / FAQ / Servicio técnico | garantía bicimoto eléctrica | mantenimiento batería Chilwee, servicio técnico en Callao | Informacional | `/garantia`, `/faq` |

Reglas: una keyword principal por URL; no canibalizar (una sola página por categoría); las keywords informacionales van al blog y enlazan a categoría/producto.

## 2. Arquitectura de URLs y metadatos

`trailingSlash: 'never'`, minúsculas, guiones, sin acentos ni parámetros. Slugs derivados del nombre del producto (`golden-eagle`, `titan-rhino`). Las URLs son contratos: un cambio de slug exige redirección 301 en `public/_redirects`.

| Ruta | Patrón `<title>` (≤ 60 car.) | Patrón `description` (≤ 155 car.) | Index |
|---|---|---|---|
| `/` | Raiden — Bicimotos y trimotos eléctricas en Lima | Bicimotos y trimotos eléctricas RAIDEN: Golden Eagle, Royal Tiger, Vortex Kobra y Titan Rhino. Pide por WhatsApp. | sí |
| `/productos` | Bicimotos y trimotos eléctricas — Catálogo \| Raiden | Todos los modelos RAIDEN con precios en soles, autonomía y versiones Estándar y Premium. | sí |
| `/bicimotos/[slug]`, `/trimotos/[slug]` | `{nombre}`: `{tipo}` eléctrica RAIDEN \| Desde S/ `{precio}` (ej. `/bicimotos/golden-eagle`) | `{nombre}`: `{velocidad}` km/h, `{licencia}`, batería Chilwee, `{autonomía}` km. Desde S/ `{precio}` con garantía. | sí |
| `/bicimotos`, `/trimotos` | Campo `title` del JSON de la categoría (p. ej. "Bicimotos eléctricas en Lima, Perú") | Campo `description` del JSON de la categoría | sí |
| `/repuestos` | Repuestos para bicimotos eléctricas | Baterías Chilwee, motores, controladores, cargadores y más. Envío a todo el Perú. | sí |
| `/repuestos/[slug]` | `{nombre}` \| Repuestos Raiden | `{descripción corta}` | sí |
| `/nosotros`, `/servicio-tecnico` | `{Sección}` \| Raiden | `{texto fijo}` | sí |
| `/comparar` | Comparar bicimotos eléctricas \| Raiden | — | noindex |
| `/encuentra-tu-moto` | Encuentra tu bicimoto eléctrica \| Raiden | Responde 4 preguntas y te recomendamos el modelo ideal. | sí |
| `/carrito` | Tu solicitud de pedido \| Raiden | — | noindex |
| `/blog` | Blog de movilidad eléctrica \| Raiden | Guías, comparativas y consejos. | sí |
| `/blog/[slug]` | `{título}` \| Blog Raiden | `{extracto}` | sí |
| `/garantia`, `/contacto`, `/faq` | `{Sección}` \| Raiden | `{texto fijo}` | sí |
| `/legal/*` | `{Documento legal}` \| Raiden | — | noindex, follow |
| `404` | Página no encontrada \| Raiden | — | noindex |

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
          'og:locale': 'es_PE', 'og:site_name': SITE.name },
    twitter: { 'twitter:card': 'summary_large_image', 'twitter:title': title,
               'twitter:description': i.description }
  };
}
```

El componente `src/components/seo/Seo.astro` recibe `SeoMeta` y los bloques JSON-LD, y los renderiza en `<head>` desde `BaseLayout`. Todos los builders son funciones puras testadas en Vitest ([11-testing](./11-testing.md)).

## 4. JSON-LD

Un `<script type="application/ld+json">` por entidad. `@context` siempre `https://schema.org`. Sin precios online no hay checkout, pero sí hay precio público, por lo que `Product` lleva `offers`.

```json
{ "@type": "Organization", "name": "Raiden", "url": "https://raiden.example.com",
  "logo": "https://raiden.example.com/logo.png",
  "contactPoint": { "@type": "ContactPoint", "contactType": "sales",
    "telephone": "+51XXXXXXXXX", "availableLanguage": "es" } }
```

```json
{ "@type": "Product", "name": "Golden Eagle", "brand": { "@type": "Brand", "name": "Raiden" },
  "sku": "RD-GOLDENEAGLE-350", "image": ["https://raiden.example.com/_astro/golden-eagle-negro.avif"],
  "description": "Bicimoto eléctrica urbana, 25 km/h, batería Chilwee 48V 12Ah, 30-35 km de autonomía.",
  "offers": { "@type": "Offer", "price": "1200", "priceCurrency": "PEN",
    "availability": "https://schema.org/InStock",
    "url": "https://raiden.example.com/bicimotos/golden-eagle", "itemCondition": "https://schema.org/NewCondition" } }
```

Reglas de `Product`: precio de la variante base; `availability` derivada del campo `availability` del JSON (`en-stock` → `InStock`, `bajo-pedido` → `PreOrder`, `agotado` → `OutOfStock`); `aggregateRating` solo cuando existan reseñas reales en `reviews`.

```json
{ "@type": "BreadcrumbList", "itemListElement": [
  { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://raiden.example.com/" },
  { "@type": "ListItem", "position": 2, "name": "Bicimotos", "item": "https://raiden.example.com/bicimotos" },
  { "@type": "ListItem", "position": 3, "name": "Golden Eagle" } ] }
```

```json
{ "@type": "FAQPage", "mainEntity": [ { "@type": "Question", "name": "¿Necesito licencia?",
  "acceptedAnswer": { "@type": "Answer", "text": "Las bicimotos RAIDEN de 25 km/h en general no requieren licencia de conducir (confirma la norma vigente con el MTC)." } } ] }
```

```json
{ "@type": "Article", "headline": "¿Necesito licencia para una bicimoto eléctrica en Perú?", "datePublished": "2026-09-01",
  "dateModified": "2026-09-01", "author": { "@type": "Organization", "name": "Raiden" },
  "image": "https://raiden.example.com/blog/necesito-licencia.jpg", "mainEntityOfPage": "https://raiden.example.com/blog/necesito-licencia-para-una-bicimoto-electrica-en-peru" }
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
Sitemap: https://raiden.example.com/sitemap-index.xml
```

- Canonical absoluta en todas las páginas, generada desde `site` de `astro.config.mjs` (`PUBLIC_SITE_URL`). Sin parámetros de consulta; las páginas de categoría con filtros en la URL (`?marca=`) se resuelven en cliente y mantienen canonical limpia.
- `noindex` por meta robots (no en robots.txt) para carrito, comparador y 404, de modo que se sigan los enlaces.

## 6. Open Graph, Twitter e imágenes

- OG/Twitter salen de `buildMeta`. Imagen por defecto `public/og/default.jpg` (1200×630). Productos: imagen principal del producto renderizada a 1200×630 en build.
- Imágenes de producto en `src/assets/products/{slug}-{color}.jpg` (p. ej. `golden-eagle-negro.jpg`) y de repuestos en `src/assets/repuestos/`. `alt` descriptivo y específico: "Golden Eagle en color negro". Nunca `alt` vacío en imágenes de contenido; `alt=""` solo en decorativas.
- AVIF/WebP con `<Picture>`; `width`/`height` explícitos (evitan CLS, factor de ranking vía Core Web Vitals).

## 7. Core Web Vitals

Google usa CWV como señal. Presupuestos en [09-performance](./09-performance.md): LCP < 2,0 s, INP < 200 ms, CLS < 0,1. Lighthouse CI bloquea PR que incumplan. El contenido indexable nunca depende de islas Preact.

## 8. Enlazado interno

- Breadcrumbs en todas las páginas de catálogo y blog (visibles + JSON-LD).
- Producto → categoría, modelos relacionados (campo `related`), repuestos compatibles, artículo del blog relevante.
- Categoría → todos sus productos, enlace al finder y a la comparativa de la categoría.
- Blog → producto/categoría con anchor descriptivo ("ver la Golden Eagle"), nunca "clic aquí".
- Footer: categorías, nosotros, servicio técnico, garantía, FAQ, contacto, legal. Máximo 3 niveles de profundidad desde la home.

## 9. Blog y contenido

El blog sostiene las keywords informacionales (licencia MTC, autonomía, carga de la batería, mantenimiento). Cada artículo: H1 único, H2 por sección, 900–1.500 palabras, `Article` JSON-LD, fecha visible, enlace a producto. Calendario y tono en [15-content-strategy](./15-content-strategy.md). Contenido en `src/content/blog/*.md`.

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
