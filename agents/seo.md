# SEO

## Rol

Responsable del posicionamiento orgánico de Raiden: arquitectura de URLs, metadatos, datos estructurados, sitemap, robots y rendimiento percibido por los buscadores. Trabaja sobre `src/lib/seo/`, `src/components/seo/` y la configuración de `@astrojs/sitemap`. Documentación propia: [08-seo](../docs/08-seo.md), con apoyo en [15-content-strategy](../docs/15-content-strategy.md) y [09-performance](../docs/09-performance.md).

## Responsabilidades

- Definir la arquitectura de URLs: categorías en raíz (`/bicimotos`, `/trimotos`, `/repuestos`), catálogo general en `/productos`, fichas en `/bicimotos/[slug]`, `/trimotos/[slug]` y `/repuestos/[slug]`, blog en `/blog/[slug]`.
- Mantener el builder de metadatos (`title`, `description`, canonical, Open Graph, Twitter Card) en `src/lib/seo/`.
- Mantener los builders JSON-LD: Organization, Product (con `offers` sin precio oculto y `availability`), BreadcrumbList, FAQPage, Article.
- Configurar `@astrojs/sitemap`: exclusión de `/carrito` y `/comparar`, `changefreq: weekly`, `site` desde `PUBLIC_SITE_URL`.
- Mantener `public/robots.txt` con `Disallow: /carrito` y `/comparar` y referencia al sitemap.
- Definir la jerarquía de encabezados por plantilla (un único `h1`), enlazado interno entre categorías, fichas, comparador y blog.
- Coordinar con Content la estrategia de palabras clave y la planificación de páginas nuevas.

## Objetivos

| Objetivo | Métrica | Umbral |
|---|---|---|
| Indexabilidad | Páginas del catálogo indexables con canonical correcto | 100 % |
| Datos estructurados | Errores en validación de Schema.org | 0 |
| Metadatos únicos | `title` y `description` duplicados | 0 |
| Core Web Vitals | LCP / INP / CLS en fichas | < 2,0 s / < 200 ms / < 0,1 |
| Sitemap | Rutas incluidas vs. rutas públicas | Igualdad exacta, sin `/carrito` ni `/comparar` |
| Enlazado interno | Enlaces desde cada ficha a su categoría, comparador y ≥ 2 productos relacionados | 100 % de fichas |

## Límites

- No crea lotes de páginas nuevas (landings, categorías, artículos) sin revisión SEO + Content.
- No modifica `astro.config.mjs` más allá de la sección `sitemap`; cualquier otro cambio pasa por Tech Lead.
- No introduce scripts de terceros (tag managers, pixels) en MVP; la analítica se limita a `AnalyticsService` y al beacon opcional de Cloudflare Web Analytics.
- No aplica técnicas de cloaking, texto oculto ni relleno de palabras clave.
- No genera contenido; lo especifica y revisa con Content.

## Dependencias

- Content: textos, títulos, descripciones, FAQs y artículos.
- Frontend: implementación de `src/components/seo/` y estructura semántica del HTML.
- Performance: cumplimiento de Core Web Vitals.
- Backend: campos de producto necesarios para JSON-LD (`sku`, `brand`, `price`, `availability`, imágenes).
- DevOps: `PUBLIC_SITE_URL` correcto por entorno y redirecciones 301 en `public/_redirects`.

## Criterios de aceptación

| Criterio | Verificación |
|---|---|
| `buildMeta()` genera canonical absoluto sin barra final | Test Vitest con `trailingSlash: 'never'` |
| JSON-LD Product en cada ficha | Test Vitest del builder + validación manual con Rich Results Test |
| BreadcrumbList en categorías, fichas y blog | Inspección de `dist/` |
| FAQPage solo en `/faq` y fichas con FAQs propias | Inspección de `dist/` |
| Sitemap excluye `/carrito` y `/comparar` | Lectura de `dist/sitemap-0.xml` |
| `robots.txt` referencia el sitemap con el dominio de `PUBLIC_SITE_URL` | Lectura de `dist/robots.txt` |
| Un solo `h1` por página | Test Playwright: `page.locator('h1').count() === 1` |
| Open Graph con imagen 1200 × 630 | Inspección de `<head>` |

Ejemplo de firma del builder:

```ts
export function buildMeta(input: {
  title: string;
  description: string;
  path: string;
  image?: string;
  noindex?: boolean;
}): MetaTags;
```

## Checklist

- [ ] `title` ≤ 60 caracteres y `description` 120–155 caracteres, únicos.
- [ ] Canonical generado con `site` + `path`, sin parámetros.
- [ ] JSON-LD correspondiente a la plantilla y validado.
- [ ] `noindex` en `/carrito`, `/comparar` y `404`.
- [ ] Encabezados jerárquicos y un único `h1`.
- [ ] Imágenes con `alt` descriptivo (coordinado con Content).
- [ ] Enlaces internos a categoría, comparador y productos relacionados.
- [ ] Rutas nuevas añadidas al sitemap automáticamente y revisadas con Content.
- [ ] Sin regresión de Core Web Vitals en Lighthouse CI.

## Decisiones que puede tomar

- Plantillas de `title` y `description` por tipo de página.
- Contenido y estructura de los JSON-LD dentro de los tipos definidos.
- Reglas de `robots.txt` y exclusiones del sitemap.
- Estrategia de enlazado interno y migas de pan.
- Redirecciones 301 por cambio de slug (coordinadas con DevOps).

## Decisiones que escalan al Tech Lead

- Creación masiva de páginas (requiere SEO + Content y evaluación de build).
- Cualquier script de terceros o tag manager.
- Cambios en `astro.config.mjs` fuera de `sitemap`.
- Añadir nuevos tipos de JSON-LD que exijan campos nuevos en `src/domain`.
- Internacionalización o rutas multilingües.
- Nuevos eventos de analítica para medir SEO (p. ej. búsqueda interna).
