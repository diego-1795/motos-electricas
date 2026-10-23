# 20 — Migraciones

Rutas de evolución previstas para Raiden. Cada una se diseñó para que el cambio quede confinado a configuración o a un adaptador, sin tocar dominio, componentes ni islas. Relacionado con [01-architecture](./01-architecture.md), [05-backend](./05-backend.md), [06-database](./06-database.md), [19-deployment](./19-deployment.md) y [21-decisions](./21-decisions.md).

## Resumen

| Ruta | Qué cambia | Qué no cambia | Esfuerzo | Reversible |
|---|---|---|---|---|
| (a) Cloudflare Pages → Vercel / Netlify / Nginx | Hosting, cabeceras, redirecciones | Código, build, `dist/` | 0,5 día | Sí, DNS |
| (b) SSG → SSR con adapter | `astro.config.mjs`, páginas marcadas `prerender=false` | Componentes, dominio, datos | 1 día | Sí |
| (c) JSON → Supabase | `ProductRepository` activo, script de import | Páginas y componentes (consumen la interfaz) | 2–3 días | Sí, doble lectura |
| (d) wa.me → WhatsApp Business API | `WhatsAppSender`, necesita backend | `WhatsAppMessageBuilder`, carrito | 3–5 días | Sí, feature flag |
| (e) noop analytics → otro proveedor | Variable de entorno y/o nuevo adaptador | Llamadas `analytics.track` | 0,5 día | Sí |
| (f) Cambio de tipografías self-hosted (hoy Montserrat + Integral CF) | `fonts.css`, `tokens.css`, preload en `BaseLayout.astro` | Componentes | 0,5 día | Sí |

## (a) Cloudflare Pages → Vercel / Netlify / Nginx

Pasos comunes:

1. Construir en local `npm run build` y verificar `dist/` con `npx serve dist`.
2. Trasladar cabeceras y redirecciones al formato del destino (abajo).
3. Configurar variables `PUBLIC_*` idénticas a las de [19-deployment](./19-deployment.md) §4.
4. Desplegar en dominio temporal, pasar la checklist post-deploy completa.
5. Cambiar DNS; mantener Cloudflare Pages activo 72 h como respaldo.

### `_headers` → `vercel.json`

`public/_headers` de referencia:

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' cloudflareinsights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  Strict-Transport-Security: max-age=15552000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
```

Equivalente completo en `vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "trailingSlash": false,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
        { "key": "Strict-Transport-Security", "value": "max-age=15552000; includeSubDomains" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=()" }
      ]
    },
    {
      "source": "/_astro/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ],
  "redirects": [
    { "source": "/:path*", "has": [{ "type": "host", "value": "www.raiden.pe" }], "destination": "https://raiden.pe/:path*", "permanent": true }
  ]
}
```

Nota: al salir de Cloudflare se eliminan de la CSP los hosts de `cloudflareinsights.com` y se cambia `PUBLIC_ANALYTICS_PROVIDER` (ruta e).

### `netlify.toml`

Netlify lee `public/_headers` y `public/_redirects` con el mismo formato que Cloudflare; solo hace falta:

```toml
[build]
  command = "npm run build"
  publish = "dist"
[build.environment]
  NODE_VERSION = "22.12.0"
```

### Nginx

Bloque `server` con `root /var/www/raiden/dist; try_files $uri $uri.html $uri/index.html =404; error_page 404 /404.html;` y un `add_header` por cada cabecera de la lista. `trailingSlash: 'never'` obliga a incluir `$uri.html` en `try_files`.

## (b) SSG → SSR con adapter

Motivos previstos: rutas `/admin`, stock en tiempo real, formularios con backend.

1. Instalar el adapter del hosting activo: `@astrojs/cloudflare`, `@astrojs/vercel` o `@astrojs/node` (standalone para Nginx).
2. `astro.config.mjs`: `output: 'static'` se mantiene; añadir `adapter: cloudflare()` (o el que toque). En Astro 5+ las páginas son estáticas por defecto y se vuelven dinámicas página a página.
3. Marcar `export const prerender = false` solo en: `src/pages/admin/**`, `src/pages/api/**` y, si se decide stock en vivo, `src/pages/[categoria]/[slug].astro`.
4. Todo el resto (home, listados, blog, legal, comparar, carrito, finder) sigue prerenderizado: no cambia rendimiento ni SEO.
5. Variables no `PUBLIC_*` (claves de servicio) pasan a estar disponibles solo en código servidor; nunca en islas.
6. Repetir Lighthouse CI: las páginas prerenderizadas deben dar el mismo resultado que antes.

Reversión: retirar el adapter y los `prerender = false`; las páginas dinámicas dejan de existir.

## (c) JSON → Supabase

1. Crear el esquema de [06-database](./06-database.md) con las migraciones SQL del repo (`supabase/migrations`). RLS: lectura pública en `products`, `product_variants`, `product_colors`, `parts`, `product_parts`, `categories`, `brands`; escritura solo rol `admin`.
2. Implementar `src/data/supabase/SupabaseProductRepository.ts` cumpliendo `ProductRepository` (`all`, `bySlug`, `byCategory`, `bySlugs`) y `PartRepository` (`all`, `bySlug`, `compatibleWith`). Mapear filas a `Product` del dominio en un `mapper.ts`; el dominio no conoce columnas.
3. Script de import `scripts/import-products.ts`: lee `src/content/products/*.json` y `src/content/repuestos/*.json`, valida con los validadores manuales de `src/domain`, hace `upsert` por `slug` con la clave de servicio (solo en local/CI, nunca en build de Pages).
4. Doble lectura durante la transición: `src/data/index.ts` exporta el repositorio según `PUBLIC_PRODUCT_SOURCE` (`json|supabase`). En build, un test compara que ambos repositorios devuelven el mismo conjunto de slugs y precios; si difieren, el build falla.
5. En SSG, Supabase se consulta en tiempo de build (la clave anónima es `PUBLIC_SUPABASE_ANON_KEY`); cada cambio en datos exige un rebuild vía webhook de Supabase → Deploy Hook de Pages.
6. Tras dos semanas con `supabase` en producción sin discrepancias, retirar los JSON y el repositorio JSON del path de producción (se conservan como fixtures de tests).

Reversión: `PUBLIC_PRODUCT_SOURCE=json` y rebuild.

## (d) wa.me → WhatsApp Business API

Requiere backend (ruta b o Supabase Edge Function). El `WhatsAppMessageBuilder` no cambia: produce el mismo texto.

1. Definir la interfaz `WhatsAppSender` en `src/services/whatsapp/` con dos implementaciones: `WaMeLinkSender` (actual, devuelve la URL) y `BusinessApiSender` (POST a `/api/whatsapp/request`).
2. La Edge Function recibe `OrderRequest`, la valida, la persiste en `order_requests` + `whatsapp_requests`, y llama a la Cloud API de Meta con plantilla aprobada. Token de Meta solo en secretos del backend.
3. Rate limiting en la función (por IP y por hora) según [10-security](./10-security.md).
4. Feature flag `PUBLIC_WHATSAPP_MODE=link|api`. En modo `api`, si la llamada falla, el drawer recae en el enlace `wa.me` para no perder el pedido.
5. Eventos `purchase_request` y `whatsapp_click` se mantienen; se añade `whatsapp_api_sent`.

Reversión: `PUBLIC_WHATSAPP_MODE=link`.

## (e) noop analytics → otro proveedor

1. Si el proveedor ya existe como adaptador (`console`, `cloudflare`, `datalayer`): cambiar `PUBLIC_ANALYTICS_PROVIDER` y rebuild.
2. Si es nuevo (Plausible, Umami, PostHog): crear `adapters/<Proveedor>Analytics.ts` implementando `AnalyticsService`, usar `enqueue`, añadir el caso al selector, ampliar la CSP con su host y actualizar `/legal/privacidad`.
3. Si el proveedor usa cookies o identificadores persistentes, es obligatorio gestor de consentimiento antes de activarlo.
4. Validar con el test E2E de [18-analytics](./18-analytics.md) §9 en preview.

Reversión: `PUBLIC_ANALYTICS_PROVIDER=noop`.

## (f) Cambio de tipografías self-hosted

Estado actual: Montserrat (variable) e Integral CF self-hosted en `public/fonts/`, declaradas en `src/styles/fonts.css` ([02-design-system](./02-design-system.md)). Para sustituirlas o añadir otra:

1. Colocar el `woff2` (subconjunto latino, licencia verificada: Montserrat es OFL; Integral CF es licencia comercial del cliente) en `public/fonts/<familia>/` con nombre sin corchetes.
2. Declarar el `@font-face` en `fonts.css` con `font-display: swap` y actualizar `--font-sans` / `--font-display` en `tokens.css`.
3. En `BaseLayout.astro`: `<link rel="preload" href="/fonts/..." as="font" type="font/woff2" crossorigin>` solo para las fuentes del primer render.
4. Ajustar `size-adjust`/`ascent-override` en el `@font-face` de fallback para que el intercambio no produzca CLS.
5. Medir: el fichero no cuenta en el presupuesto JS, pero LCP debe seguir dentro de presupuesto ([09-performance](./09-performance.md)).

Reversión: restaurar `fonts.css`, `tokens.css` y el preload anteriores; la pila `system-ui` actúa de respaldo.

## Riesgos

| Riesgo | Ruta | Mitigación |
|---|---|---|
| Cabeceras perdidas al cambiar de hosting | a | Checklist post-deploy §7 de 19-deployment antes de cambiar DNS |
| Páginas SSR sin caché degradan TTFB | b | Solo las rutas listadas; `Cache-Control` en respuestas SSR |
| Datos divergentes JSON/Supabase | c | Test de paridad en build; doble lectura |
| Clave de servicio filtrada al frontend | c, d | Nunca `PUBLIC_`; grep de secretos en CI sobre `dist/` |
| Meta rechaza plantillas o suspende el número | d | Mantener fallback `wa.me` permanente |
| Consentimiento ausente con proveedor con cookies | e | Revisión de Security antes de activar |
| CLS por cambio de fuente | f | `font-display: swap` + fallback ajustado; Lighthouse CI |

## Orden recomendado

1. (e) y (f): sin dependencias, bajo riesgo, se pueden hacer en cualquier momento.
2. (c) JSON → Supabase: base para admin y pedidos.
3. (b) SSG → SSR: necesario para `/admin` y para (d).
4. (d) Business API: después de (b) y (c), cuando el volumen de solicitudes justifique automatizar.
5. (a) Cambio de hosting: solo si Cloudflare deja de ser adecuado; no está en el roadmap.

## Criterios de reversión

Se revierte una migración cuando, en las 48 h posteriores, ocurre cualquiera de:

- Lighthouse móvil cae > 10 puntos o se incumple un presupuesto de [09-performance](./09-performance.md).
- Tasa `purchase_request → whatsapp_click` cae más de un 20 % relativo.
- Aparece un error en consola o un 5xx en más del 0,5 % de las peticiones.
- Una cabecera de seguridad desaparece o la CSP bloquea un recurso propio.
- Discrepancia de datos entre origen antiguo y nuevo (precio, disponibilidad, slug).

Cada reversión se registra en [21-decisions](./21-decisions.md) como ADR con estado "Revertida" y causa.
