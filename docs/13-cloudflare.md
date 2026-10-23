# 13 — Cloudflare Pages

Raiden se despliega en Cloudflare Pages (plan Free) como hosting estático. Cloudflare es el proveedor elegido para el MVP, no una dependencia: la salida de `astro build` es HTML/CSS/JS plano y puede servirse desde cualquier CDN (ver [20-migration](./20-migration.md)). Todo lo descrito aquí que sea específico de Cloudflare está marcado como tal y tiene equivalente documentado.

## 1. Plan Free: límites y encaje

| Concepto | Límite Free | Uso previsto Raiden |
|---|---|---|
| Builds | 500 / mes | < 100 (CI filtra ramas, ver [14-devops](./14-devops.md)) |
| Builds concurrentes | 1 | Suficiente; los previews se encolan |
| Ancho de banda | Ilimitado | Sin riesgo por picos de campañas |
| Peticiones | Ilimitadas | — |
| Ficheros por deploy | 20.000 | ~300 páginas + ~1.500 imágenes derivadas (AVIF/WebP) |
| Tamaño por fichero | 25 MB | Imagen más grande < 1 MB tras sharp |
| Proyectos | Sin límite práctico | 1 (`raiden`) |
| Dominios personalizados | 100 por proyecto | 2 (`raiden.pe`, `www.raiden.pe`, provisional) |
| Retención de deploys | Sin caducidad | Rollback instantáneo a cualquier deploy |

Riesgo a vigilar: el límite de 20.000 ficheros. Cada `<Image>` con `widths` múltiples y dos formatos genera N×2 ficheros. El presupuesto se controla en [09-performance](./09-performance.md): máximo 4 anchos por imagen de producto.

## 2. Configuración del proyecto

Creación desde el dashboard (Workers & Pages → Create → Pages → Connect to Git) con el repositorio de GitHub.

| Ajuste | Valor |
|---|---|
| Production branch | `main` |
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Node version | 22 (variable `NODE_VERSION=22.12.0`) |
| Build system | v3 |

El preset Astro de Cloudflare ejecuta `npm ci` automáticamente cuando existe `package-lock.json`. El lockfile se versiona siempre.

### Variables de entorno

Solo se exponen variables con prefijo `PUBLIC_`; no existen secretos en el frontend ([10-security](./10-security.md)).

| Variable | Producción | Preview | Uso |
|---|---|---|---|
| `NODE_VERSION` | `22.12.0` | `22.12.0` | Versión de Node en el builder |
| `PUBLIC_SITE_URL` | `https://raiden.pe` | `https://raiden-preview.pages.dev` | `site` de Astro: canonicals, sitemap, JSON-LD |
| `PUBLIC_WHATSAPP_NUMBER` | Número real E.164 sin `+` | Número de pruebas del equipo | `src/config/site.ts` |
| `PUBLIC_ANALYTICS_ADAPTER` | `cloudflare` o `noop` | `console` | Selección de adaptador de `AnalyticsService` |

Las variables se definen por entorno en Settings → Environment variables. Un cambio de variable no redepliega: hay que lanzar un nuevo build (Retry deployment) para que `astro build` la lea.

## 3. Ficheros `_headers` y `_redirects`

Ambos viven en `public/` y Astro los copia tal cual a `dist/`. Son convención compartida con Netlify; Vercel usa `vercel.json` (equivalente en [20-migration](./20-migration.md)).

### `public/_headers`

```
/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/favicon.*
  Cache-Control: public, max-age=604800
```

Notas:
- Los ficheros de `/_astro/` llevan hash en el nombre; `immutable` es seguro.
- El HTML no lleva `Cache-Control` explícito: Cloudflare sirve con revalidación y cada deploy invalida la caché de la edge.
- Las entradas de `cloudflareinsights.com` solo son necesarias si se activa Web Analytics (sección 6). Si se desactiva, se retiran de la CSP.
- `style-src 'unsafe-inline'` es necesario por `build.inlineStylesheets: 'auto'`. Se revisa en [10-security](./10-security.md).

### `public/_redirects`

```
# Canonical: www -> apex
https://www.raiden.pe/*  https://raiden.pe/:splat  301

# Rutas del catálogo anterior (ADR-015): solo si llegaron a indexarse
/motos-electricas          /productos     301
/accesorios                /repuestos     301
/scooters-electricos       /bicimotos     301
/motos-electricas-urbanas  /bicimotos     301

# Sin trailing slash (trailingSlash: 'never')
/*/                  /:splat                     301
```

Cloudflare Pages soporta hasta 2.000 redirecciones estáticas y 100 dinámicas por proyecto. No se usan reglas con `200` (rewrites) porque Vercel y Netlify las interpretan de forma distinta.

## 4. Dominios y DNS

1. Añadir el dominio en el proyecto: Custom domains → Set up a custom domain → `raiden.pe` y `www.raiden.pe`.
2. Si la zona DNS está en Cloudflare, se crean automáticamente registros `CNAME` hacia `raiden.pages.dev` (apex mediante CNAME flattening). Si el DNS está en otro registrador, se crea manualmente `CNAME www → raiden.pages.dev` y para el apex se usa ALIAS/ANAME o se traslada la zona.
3. Certificado TLS: emitido automáticamente (Universal SSL). Modo SSL/TLS en "Full (strict)".
4. Activar "Always Use HTTPS" y HSTS solo tras confirmar que todos los subdominios sirven TLS.
5. Verificación de propiedad en Google Search Console mediante registro TXT ([08-seo](./08-seo.md)).

El dominio `*.pages.dev` sigue activo tras añadir el dominio propio. Para evitar contenido duplicado, el layout emite `<meta name="robots" content="noindex">` cuando `PUBLIC_SITE_URL` no coincide con el dominio de producción.

## 5. Preview deployments por rama

- Cada push a una rama distinta de `main` genera un deploy en `https://<hash>.raiden.pages.dev` y un alias estable `https://<rama>.raiden.pages.dev`.
- Configuración recomendada en Settings → Builds: "Preview branches: Custom" incluyendo `feat/*`, `fix/*`, `content/*` y excluyendo `renovate/*` y `dependabot/*` para no agotar builds.
- Los previews leen las variables del entorno Preview: número de WhatsApp de pruebas y `noindex`.
- Protección de acceso a previews (Cloudflare Access) es de pago por encima de 50 usuarios; no se usa. Los previews son públicos pero no indexables.
- La URL del preview se publica automáticamente como comentario en la PR mediante la integración de GitHub.

## 6. Cloudflare Web Analytics (opcional)

Analítica sin cookies y sin datos personales, gratuita. Se integra como adaptador `cloudflare` de `AnalyticsService` ([18-analytics](./18-analytics.md)):

- Se activa desde Pages → Metrics → Enable Web Analytics. Cloudflare inyecta el beacon en el HTML servido; no se añade `<script>` manual para que el build siga siendo agnóstico.
- Proporciona Core Web Vitals reales (RUM) en el dashboard.
- No permite eventos personalizados; los eventos de negocio (`whatsapp_click`, `purchase_request`) se registran solo a través de los adaptadores `console`/`dataLayer` o de un futuro endpoint propio.
- No requiere banner de cookies ([15-content-strategy](./15-content-strategy.md), página de cookies).

## 7. Turnstile y Workers: futuro, no MVP

| Capacidad | Cuándo | Alternativa agnóstica |
|---|---|---|
| Turnstile (anti-bot) | Si se añade formulario de contacto con backend | hCaptcha, o validación en Supabase Edge Function |
| Pages Functions / Workers | Endpoint de `order_requests`, rate limiting, proxy a Supabase | Supabase Edge Functions (Deno), ejecutables en cualquier proveedor |
| KV / D1 / R2 | No previstos | Supabase (Postgres + Storage) |
| Adapter `@astrojs/cloudflare` | Solo si se optase por `/admin` SSR en Pages ([17-admin-panel](./17-admin-panel.md)) | `@astrojs/node` en cualquier VPS o `@astrojs/vercel` |

Cualquier uso de estas capacidades requiere revisión DevOps + Tech Lead (regla de gobernanza de [01-architecture](./01-architecture.md)).

## 8. Qué NO usar para mantener la portabilidad

| Funcionalidad Cloudflare | Motivo de exclusión | Equivalente agnóstico adoptado |
|---|---|---|
| Cloudflare Images / Image Resizing | Coste y lock-in de URLs | `<Image>` de Astro con sharp en build |
| Transform Rules / Page Rules para cabeceras | Viven fuera del repositorio | `public/_headers` versionado |
| Bulk Redirects en dashboard | No auditables en git | `public/_redirects` |
| Workers KV para contenido | Lock-in de API | JSON en `src/content/` y, después, Supabase |
| Durable Objects | Sin caso de uso | — |
| Email Routing para formularios | Dependencia del proveedor | `EmailService` con adaptador (Resend u otro) |
| Zaraz (gestor de tags) | Inyecta terceros fuera de CSP versionada | Adaptador `dataLayer` de `AnalyticsService` |
| Cloudflare Access en previews | Coste por usuario | `noindex` + URLs no públicas |
| `wrangler.toml` con bindings | Ata el build a Workers | Ninguno en MVP; `astro.config.mjs` es la única configuración |

Regla: si una funcionalidad no se puede reproducir con un fichero del repositorio o con una variable de entorno estándar, no entra en el MVP.

## 9. Costes

| Partida | Coste mensual |
|---|---|
| Cloudflare Pages Free | S/ 0 |
| Cloudflare Web Analytics | S/ 0 |
| Dominio `.pe` / `.com.pe` (registrador externo) o `.com` (Cloudflare Registrar) | ~S/ 4–15/mes (≈ S/ 40–180/año según extensión) |
| GitHub (repositorio privado, Actions 2.000 min/mes) | S/ 0 |
| Supabase Free (fase posterior) | S/ 0 |
| **Total MVP** | **≈ S/ 4–15/mes (solo dominio)** |

Escenario de crecimiento: Pages Pro (20 USD/mes) solo aporta 5.000 builds y builds concurrentes; no se prevé necesitarlo. El primer coste real aparecería con Workers Paid (5 USD/mes) si se implementa backend en Cloudflare, opción descartada frente a Supabase por portabilidad.

## 10. Checklist de alta del proyecto

- [ ] Repositorio conectado, rama de producción `main`.
- [ ] `NODE_VERSION`, `PUBLIC_SITE_URL`, `PUBLIC_WHATSAPP_NUMBER` definidas en Production y Preview.
- [ ] `public/_headers` y `public/_redirects` presentes y verificados con `curl -I`.
- [ ] Dominio propio con TLS "Full (strict)" y redirección www → apex.
- [ ] Preview branches limitadas a `feat/*`, `fix/*`, `content/*`.
- [ ] Web Analytics activado o CSP sin dominios de insights.
- [ ] Primer deploy validado con Lighthouse CI ([11-testing](./11-testing.md)).
