# 01 — Arquitectura

Decisiones tomadas por el Tech Lead. Cualquier desviación se registra en [21-decisions](./21-decisions.md).

## 1. Principios

1. **Estático por defecto.** Astro 7 con `output: 'static'`. Todo lo que pueda resolverse en build se resuelve en build.
2. **JS solo donde hay interacción.** Islas Preact para carrito, configurador, comparador y finder. El resto es HTML + CSS.
3. **Dominio independiente de la infraestructura.** `src/domain` y `src/services` no importan nada de Astro, Supabase ni del navegador.
4. **Inversión de dependencias.** Las páginas dependen de interfaces (`ProductRepository`, `AnalyticsService`); los adaptadores concretos se inyectan desde un único punto.
5. **Agnóstico del proveedor.** Ninguna API específica de Cloudflare en código de aplicación. Lo específico vive en `public/_headers` y `astro.config.mjs`.
6. **Cero secretos en el frontend.** Solo variables `PUBLIC_*`.
7. **TypeScript strict** en todo el árbol, incluidos `.astro`.

## 2. Capas

```
┌────────────────────────────────────────────────────────────┐
│ PRESENTACIÓN   src/pages · src/layouts · src/components     │
│                src/islands (Preact)                        │
├────────────────────────────────────────────────────────────┤
│ APLICACIÓN     src/services  (CartService, WhatsApp,        │
│                RecommendationService, AnalyticsService…)   │
├────────────────────────────────────────────────────────────┤
│ DOMINIO        src/domain  (entidades, funciones puras)     │
├────────────────────────────────────────────────────────────┤
│ DATOS          src/data  (ProductRepository + adaptadores)  │
│                src/content (JSON, content collections)     │
├────────────────────────────────────────────────────────────┤
│ INFRAESTRUCTURA  src/config · src/lib · public/_headers     │
│                  astro.config.mjs · variables de entorno   │
└────────────────────────────────────────────────────────────┘
Regla: las flechas de import solo apuntan hacia abajo. Dominio no importa nada de arriba.
```

## 3. Árbol de directorios de `src/`

```
src/
├── assets/                  # imágenes optimizadas en build (sharp)
│   ├── products/<slug>/
│   └── brand/
├── components/
│   ├── ui/                  # Button, Card, Input, Select, Badge, Tabs, Table, SpecTile, ColorSwatch…
│   ├── layout/              # Header, Footer, Nav, MobileNav, Container, Breadcrumbs
│   ├── product/             # Gallery, SpecList, VariantList (estático), PriceBlock
│   ├── catalog/             # ProductGrid, ProductCard, FilterBar (formulario GET, sin JS)
│   ├── home/                # Hero, CategoryGrid, FeaturedProducts, FinderCta
│   └── seo/                 # Head, JsonLd
├── config/
│   └── site.ts              # marca, PUBLIC_WHATSAPP_NUMBER, URLs, PEN, es-PE
├── content/
│   ├── config.ts            # definición de colecciones
│   ├── products/*.json
│   ├── categories/*.json
│   ├── accessories/*.json
│   ├── brands/*.json
│   ├── blog/*.md
│   └── faqs/*.json
├── data/
│   ├── repositories/        # interfaces: ProductRepository, CategoryRepository, AccessoryRepository, BlogRepository, FaqRepository
│   ├── json/                # JsonProductRepository, JsonCategoryRepository…
│   ├── supabase/            # SupabaseProductRepository… (futuro, misma interfaz)
│   └── index.ts             # composición: exporta la implementación activa
├── domain/
│   ├── entities/            # Product, ProductVariant, ProductColor, Category, Brand, Battery, Accessory,
│   │                        # Cart, CartItem, OrderRequest, Customer, WhatsAppRequest, BlogPost, FAQ, Review
│   ├── pricing.ts           # lineTotal, cartTotal, formatPrice
│   ├── compare.ts           # diffSpecs, compareRows
│   ├── finder.ts            # scoreProduct, rankProducts
│   └── validation.ts        # validadores manuales (cantidades, notas, slugs)
├── islands/                 # Preact: CartDrawer, AddToCart, Configurator, CompareTable, Finder, CartPage
├── layouts/                 # BaseLayout, ProductLayout, BlogLayout
├── lib/
│   ├── seo/                 # buildMeta, jsonld/{organization,product,breadcrumb,faq,article}.ts
│   ├── format/              # currency, date, units
│   └── url/                 # canonical, whatsappUrl
├── pages/                   # rutas (ver §6)
├── services/
│   ├── cart/                # CartService, store nanostores + persistent
│   ├── whatsapp/            # WhatsAppMessageBuilder
│   ├── recommendation/      # RecommendationService
│   ├── analytics/           # AnalyticsService + adaptadores noop/console/cloudflare/dataLayer
│   ├── storage/             # StorageService (localStorage/memory)
│   ├── cache/               # CacheService (interfaz; memory en MVP)
│   └── email/               # EmailService (interfaz; sin adaptador real en MVP)
├── stores/                  # cart.ts, compare.ts (nanostores)
├── styles/
│   ├── tokens.css
│   ├── base.css
│   └── components.css
└── env.d.ts
```

## 4. Responsabilidad de cada capa

| Capa | Responsabilidad | Prohibido |
|---|---|---|
| `pages/`, `layouts/`, `components/` | Componer HTML, llamar a repositorios en frontmatter (build), metadatos SEO | Lógica de negocio, acceso directo a JSON, teléfonos hardcodeados |
| `islands/` | Interactividad en cliente; leen stores y llaman a servicios | `fetch` a terceros, acceso a `import.meta.env` salvo `PUBLIC_*` |
| `services/` | Casos de uso: construir mensaje, operar carrito, puntuar, emitir eventos | Importar Astro, DOM directo (salvo adaptadores de storage/analytics) |
| `domain/` | Tipos y funciones puras, deterministas y testables con Vitest | Efectos secundarios, imports externos |
| `data/` | Implementar interfaces de repositorio contra JSON (MVP) o Supabase (futuro) | Transformar presentación, formatear moneda |
| `config/`, `lib/` | Constantes, entorno, utilidades (SEO, formato, URL) | Estado mutable |

## 5. Flujo de datos

**Build-time (SSG)**

1. `astro build` carga content collections (`src/content`).
2. `JsonProductRepository` expone `findAll`, `findBySlug`, `findByCategory`.
3. Cada página llama al repositorio en el frontmatter y genera HTML + JSON-LD + imágenes optimizadas.
4. `@astrojs/sitemap` genera el sitemap excluyendo `/carrito` y `/comparar`.
5. Las islas reciben sus datos como **props serializables** (producto, variantes, colores, accesorios compatibles). No hacen peticiones en runtime.

**Runtime (navegador)**

1. La página se pinta sin JS. Las islas se hidratan según su directiva.
2. `cartStore` (`@nanostores/persistent`, clave `raiden:cart:v1`) se rehidrata desde `localStorage`.
3. `AddToCart` → `CartService.add()` → store → `CartDrawer` se actualiza y `AnalyticsService.track('add_to_cart')`.
4. `CartPage` → `WhatsAppMessageBuilder.build(orderRequest)` → `whatsappUrl()` → `wa.me` con `encodeURIComponent`.
5. El comparador usa `compareStore` (sesión, no persistente) con los productos pasados por props o leídos de un JSON estático por categoría generado en build (`/data/compare/<category>.json`).

## 6. Islas y criterios de hidratación

| Isla | Directiva | Motivo |
|---|---|---|
| `CartDrawer` | `client:idle` | Presente en todas las páginas; no bloquea LCP, debe estar listo antes de la primera interacción |
| `CartBadge` (contador en header) | `client:idle` | Necesita leer el store persistente; ligero |
| `AddToCart` / `Configurator` | `client:load` | Es la acción principal de la ficha; debe responder de inmediato |
| `CompareTable` | `client:load` | La página `/comparar` no tiene otro contenido |
| `CompareToggle` (botón en ProductCard) | `client:visible` | Muchas instancias en el grid; solo hidrata las visibles |
| `Finder` | `client:load` | Página dedicada, formulario multi-paso |
| `CartPage` | `client:load` | Página dedicada; lista, cantidades, notas y botón WhatsApp |
| `Toast` | `client:idle` | Feedback global; montado junto al drawer |

Regla: ninguna isla supera 15 KB gz individualmente; el total de JS en la ficha de producto es < 60 KB gz ([09-performance](./09-performance.md)).

## 7. Inversión de dependencias

```ts
// src/data/repositories/ProductRepository.ts
import type { Product, Category } from '@/domain/entities';

export interface ProductRepository {
  findAll(): Promise<Product[]>;
  findBySlug(slug: string): Promise<Product | null>;
  findByCategory(category: Category['slug']): Promise<Product[]>;
  findFeatured(limit?: number): Promise<Product[]>;
}

// src/services/analytics/AnalyticsService.ts
export type AnalyticsEvent =
  | 'page_view' | 'product_view' | 'add_to_cart' | 'cart_open'
  | 'purchase_request' | 'whatsapp_click' | 'compare_add' | 'finder_complete';

export interface AnalyticsService {
  track(event: AnalyticsEvent, payload?: Record<string, string | number | boolean>): void;
}

// src/services/storage/StorageService.ts
export interface StorageService {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

// src/data/index.ts — único punto de composición
import { JsonProductRepository } from './json/JsonProductRepository';
export const productRepository: ProductRepository = new JsonProductRepository();
// Futuro: new SupabaseProductRepository(createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY))
```

`WhatsAppMessageBuilder` recibe `siteConfig` y `OrderRequest`; nunca lee el entorno directamente. `RecommendationService` recibe `Product[]` y las respuestas del finder y devuelve `ScoredProduct[]` ordenados; la función de puntuación está en `domain/finder.ts`.

## 8. Variables de entorno

| Variable | Obligatoria | Ejemplo | Uso |
|---|---|---|---|
| `PUBLIC_SITE_URL` | Sí en producción | `https://raiden.pe` | `site` en `astro.config.mjs`, canónicas, sitemap |
| `PUBLIC_WHATSAPP_NUMBER` | Sí | `51987654321` (sin `+`) | Enlace `wa.me` |
| `PUBLIC_ANALYTICS_ADAPTER` | No | `noop` \| `console` \| `cloudflare` \| `datalayer` | Selección del adaptador |
| `PUBLIC_CF_ANALYTICS_TOKEN` | No | token del beacon | Solo si adapter = `cloudflare` |
| `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` | No (futuro) | — | `SupabaseProductRepository` |

Se validan al arrancar en `src/config/site.ts`; un número de WhatsApp ausente hace fallar el build en producción y muestra aviso en desarrollo.

## 9. Portabilidad entre proveedores

| Aspecto | Cloudflare Pages (MVP) | Vercel | Netlify | Node / VPS |
|---|---|---|---|---|
| Build | `astro build` → `dist/` | igual | igual | igual |
| Cabeceras | `public/_headers` | `vercel.json` | `public/_headers` | nginx/Caddy |
| SSR futuro | `@astrojs/cloudflare` | `@astrojs/vercel` | `@astrojs/netlify` | `@astrojs/node` |
| Analítica | Web Analytics beacon | cambiar adapter | cambiar adapter | cambiar adapter |

Nada del código de `src/` cambia. Procedimiento detallado en [20-migration](./20-migration.md) y [13-cloudflare](./13-cloudflare.md).

## 10. Límites y no-objetivos

- No hay servidor en el MVP: sin formularios que envíen a backend, sin rate limiting (pertenece a Workers / Supabase Edge Functions futuros; [10-security](./10-security.md)).
- No hay estado compartido entre dispositivos; el carrito es local.
- No se soporta i18n ni multi-moneda en la arquitectura actual; añadirlo implicaría rutas por locale y un `PriceFormatter` parametrizado.
- No se introduce un framework de estado adicional ni un router en cliente. La navegación es multi-página con `prefetch` en hover.
- Los repositorios de Supabase existen como adaptadores vacíos/documentados, no como código activo, hasta la fase de admin ([17-admin-panel](./17-admin-panel.md), [06-database](./06-database.md)).
