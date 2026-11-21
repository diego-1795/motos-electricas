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
| Node version | 22 (variable `NODE_VERSION=22.23.4`) |
| Build system | v3 |

El preset Astro de Cloudflare ejecuta `npm ci` automáticamente cuando existe `package-lock.json`. El lockfile se versiona siempre.

### Variables de entorno

Solo se exponen al build variables con prefijo `PUBLIC_`; no existen secretos en el frontend ([10-security](./10-security.md)). Son exactamente las que lee el código (`src/config/site.ts`, `src/lib/analytics-init.ts`, `astro.config.mjs`):

| Variable | Producción | Preview | Uso |
|---|---|---|---|
| `NODE_VERSION` | `22.23.4` | `22.23.4` | Versión de Node en el builder (Astro 7.4 no compila con menos) |
| `PUBLIC_SITE_URL` | `https://raiden.pe` (provisional: `https://raiden.pages.dev`) | URL de la preview | `site` de Astro: canonicals, sitemap, robots.txt, JSON-LD, OG |
| `PUBLIC_WHATSAPP_NUMBER` | Número real E.164 sin `+` | Número de pruebas del equipo | `src/config/site.ts` |
| `PUBLIC_CONTACT_EMAIL` | Email de contacto real | El mismo o uno de pruebas | Pie y JSON-LD `Organization` |
| `PUBLIC_ANALYTICS` | vacío (noop) o `datalayer` | `console` | Adaptador de `AnalyticsService`: `console` \| `datalayer` \| vacío = noop |
| `PUBLIC_CF_BEACON_TOKEN` | Token de Web Analytics (§6) o vacío | vacío | Si está definido se carga el beacon de Cloudflare |

Las variables del panel `/admin` (no `PUBLIC_*`) y el binding KV `ADMIN_KV` están en [19-deployment](./19-deployment.md) §12. Las variables se definen por entorno en Settings → Variables and Secrets. Un cambio de variable no redepliega: hay que lanzar un nuevo build (Retry deployment) para que `astro build` y las Functions la lean.

## 3. Ficheros `_headers` y `_redirects`

Ambos viven en `public/` y Astro los copia tal cual a `dist/`. Son convención compartida con Netlify; Vercel usa `vercel.json` (equivalente en [20-migration](./20-migration.md)).

### `public/_headers`

La fuente de verdad es el propio fichero (comentado línea a línea); su equivalente para Vercel es `vercel.json` y ambos se mantienen sincronizados. Contiene:

- `/*`: CSP sin `'unsafe-inline'` en `script-src` (los scripts inline de Astro se autorizan por hash sha256), HSTS con `includeSubDomains; preload`, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP.
- `/admin` y `/admin/*`: CSP propia (sin insights ni YouTube), `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`.
- `/api/admin/*`, `/docs/*` (PDF con `Content-Disposition: attachment`), `/_astro/*` (inmutable un año), sitemaps, `robots.txt`, favicon y `og-default.png`.

Notas:
- `npm run build` termina con `scripts/check-csp.mjs`: si un `<script>` inline de `dist/` no tiene su hash en `_headers` y `vercel.json`, el build falla e imprime los hashes a añadir. Pasa al editar el `<script>` de un componente `.astro` o al actualizar Astro.
- El HTML no lleva `Cache-Control` explícito: Cloudflare sirve con revalidación y cada deploy invalida la caché de la edge.
- Las entradas de `cloudflareinsights.com` solo se usan si `PUBLIC_CF_BEACON_TOKEN` está definido (§6); son inofensivas si no.
- `style-src 'unsafe-inline'` es necesario por `build.inlineStylesheets: 'auto'`. Se revisa en [10-security](./10-security.md).
- HSTS con `includeSubDomains; preload`: antes de apuntar el dominio del cliente, confirmar que **todos** sus subdominios sirven HTTPS.

### `public/_redirects` (todavía no existe)

No hace falta hasta tener dominio propio. La barra final ya no necesita regla: con `build.format: 'file'` Pages sirve `/productos` con 200 y redirige `/productos/` → `/productos` (ADR-024). Cuando haya dominio, crear el fichero con la canónica:

```
# Canonical: www -> apex
https://www.raiden.pe/*  https://raiden.pe/:splat  301

# Rutas del catálogo anterior (ADR-015): solo si llegaron a indexarse
/motos-electricas          /productos     301
/accesorios                /repuestos     301
/scooters-electricos       /bicimotos     301
/motos-electricas-urbanas  /bicimotos     301
```

Cloudflare Pages soporta hasta 2.000 redirecciones estáticas y 100 dinámicas por proyecto. No se usan reglas con `200` (rewrites) porque Vercel y Netlify las interpretan de forma distinta.

## 4. Dominios y DNS

1. Añadir el dominio en el proyecto: Custom domains → Set up a custom domain → `raiden.pe` y `www.raiden.pe`.
2. Si la zona DNS está en Cloudflare, se crean automáticamente registros `CNAME` hacia `raiden.pages.dev` (apex mediante CNAME flattening). Si el DNS está en otro registrador, se crea manualmente `CNAME www → raiden.pages.dev` y para el apex se usa ALIAS/ANAME o se traslada la zona.
3. Certificado TLS: emitido automáticamente (Universal SSL). Modo SSL/TLS en "Full (strict)".
4. Activar "Always Use HTTPS" y HSTS solo tras confirmar que todos los subdominios sirven TLS.
5. Verificación de propiedad en Google Search Console mediante registro TXT ([08-seo](./08-seo.md)).

El dominio `*.pages.dev` sigue activo tras añadir el dominio propio y sirve el mismo build. El contenido duplicado lo resuelven las canónicas: cada página emite `<link rel="canonical">` hacia `PUBLIC_SITE_URL`, de modo que la copia en `pages.dev` remite al dominio real. No hay `noindex` automático por entorno: `robots.txt` siempre permite indexar (salvo `/carrito`, `/comparar`, `/admin` y `/api/`). Por eso `PUBLIC_SITE_URL` debe cambiarse al dominio final (y relanzar el build) en cuanto se conecte.

## 5. Preview deployments por rama

- Cada push a una rama distinta de `main` genera un deploy en `https://<hash>.raiden.pages.dev` y un alias estable `https://<rama>.raiden.pages.dev`.
- Mientras no se definan las variables del entorno Preview, dejar Settings → Builds → Branch control → "Preview branches: **None**": una preview sin variables se construye con `raiden.example.com` y el número de WhatsApp por defecto, y gasta builds.
- Cuando se quieran previews: definir las variables de Preview (número de pruebas, `PUBLIC_SITE_URL` de la preview) y pasar a "Custom" incluyendo `feat/*`, `fix/*`, `content/*` y excluyendo `renovate/*` y `dependabot/*`.
- Las previews son públicas y **no** llevan `noindex` automático (ver §4); su canónica apunta a su propia `PUBLIC_SITE_URL`. Si se quiere que no sean accesibles, protegerlas con Cloudflare Access (gratis hasta 50 usuarios).
- La URL del preview se publica automáticamente como comentario en la PR mediante la integración de GitHub.

## 6. Cloudflare Web Analytics (opcional)

Analítica sin cookies y sin datos personales, gratuita. No es un adaptador de `AnalyticsService` ([18-analytics](./18-analytics.md)): `src/lib/analytics-init.ts` añade el beacon (`static.cloudflareinsights.com/beacon.min.js`) solo si `PUBLIC_CF_BEACON_TOKEN` está definido.

- Crear el sitio en Cloudflare → Analytics & Logs → Web Analytics, copiar el token a `PUBLIC_CF_BEACON_TOKEN` (Production) y relanzar el build. **No** activar además la inyección automática de Pages (Metrics → Enable Web Analytics): contaría cada visita dos veces.
- Proporciona Core Web Vitals reales (RUM) en el dashboard.
- No permite eventos personalizados; los eventos de negocio (`whatsapp_click`, `purchase_request`) se registran solo a través de los adaptadores `console`/`dataLayer` o de un futuro endpoint propio.
- No requiere banner de cookies ([15-content-strategy](./15-content-strategy.md), página de cookies).

## 7. Turnstile y Workers: futuro, no MVP

| Capacidad | Cuándo | Alternativa agnóstica |
|---|---|---|
| Turnstile (anti-bot) | Si se añade formulario de contacto con backend | hCaptcha, o validación en Supabase Edge Function |
| Pages Functions | **En uso desde ADR-018**: `functions/api/admin/*` (panel de administración). Futuro: `order_requests`, rate limiting | Worker/Edge Function/Node con el mismo `src/domain` y `src/content/schemas.ts` |
| Cloudflare Access | **En uso desde ADR-018**: protege `/admin` y `/api/admin/*` (plan Zero Trust Free, hasta 50 usuarios) | Cualquier proxy de identidad que emita un JWT verificable (p. ej. Vercel/Netlify Identity, oauth2-proxy) |
| KV | **En uso desde ADR-024**: binding `ADMIN_KV` con usuarios del panel y contadores de intentos (no contenido) | Cualquier almacén clave-valor (Redis, tabla en Supabase) |
| D1 / R2 | No previstos | Supabase (Postgres + Storage) |
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
| Cloudflare Access en previews | Coste por usuario a partir de 50 | Previews desactivadas o con URLs no difundidas (§5); Access es opcional para `/admin` (ADR-024: dos usuarios, dentro del plan Free) |
| `wrangler.toml` con bindings | Ata el build a Workers | Sin `wrangler.toml`: el único binding (`ADMIN_KV`, ADR-024) se asigna en el panel de Pages y en local con `--kv ADMIN_KV`; el resto son variables de entorno. `wrangler` se usa únicamente en local (`npm run admin:dev`) |

Regla: si una funcionalidad no se puede reproducir con un fichero del repositorio o con una variable de entorno estándar, no entra en el MVP. El panel de administración cumple la regla: `functions/` es código del repositorio y todo lo demás son variables de entorno.

## 11. Cloudflare Access para el panel `/admin` (ADR-018; opcional desde ADR-024)

Desde ADR-024 el panel se protege con su propio login por email y contraseña ([19-deployment](./19-deployment.md) §12). Access es una **segunda barrera opcional**: si se configura, las Functions exigen además el JWT. Configuración en Zero Trust (gratuito hasta 50 usuarios):

1. **Zero Trust → Settings → Custom Pages**: anotar el *team domain* (`<equipo>.cloudflareaccess.com`) → variable `CF_ACCESS_TEAM_DOMAIN`.
2. **Access → Applications → Add → Self-hosted**: dominio `raiden.pe` (y `www`), rutas `/admin` y `/api/admin` (una aplicación con dos rutas, o dos aplicaciones con la misma política). Duración de sesión: 24 h. Método: *One-time PIN* (código al email); no hace falta proveedor de identidad.
3. **Política "Catálogo RAIDEN"** (Allow): *Emails* = los de Diego y Wiliam. Cualquier otro email ve la pantalla de Access y no entra.
4. En la aplicación, *Overview → Application Audience (AUD) Tag* → variable `CF_ACCESS_AUD`.
5. El dominio `*.pages.dev` no pasa por Access salvo que se añada como dominio de la aplicación; con Access activado, añadir también `raiden.pages.dev` (misma política). Sin `CF_ACCESS_*`, el panel funciona solo con contraseña.

Las Functions no confían en que Access "esté delante": verifican el JWT en cada petición (firma, `aud`, `iss`, `exp`) y exigen que su email sea el de la sesión por contraseña, de modo que una ruta mal configurada en Access no abre el API.

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
- [ ] `NODE_VERSION`, `PUBLIC_SITE_URL`, `PUBLIC_WHATSAPP_NUMBER`, `PUBLIC_CONTACT_EMAIL` definidas en Production (y en Preview si hay previews).
- [ ] Cabeceras de `public/_headers` verificadas con `curl -I`.
- [ ] Dominio propio con TLS "Full (strict)", `PUBLIC_SITE_URL` actualizado y `public/_redirects` creado con la redirección www → apex.
- [ ] Preview branches en "None" o limitadas a `feat/*`, `fix/*`, `content/*` con variables de Preview definidas.
- [ ] Web Analytics: `PUBLIC_CF_BEACON_TOKEN` definido o vacío (sin inyección automática de Pages).
- [ ] Panel `/admin`: KV, variables y comprobaciones de [19-deployment](./19-deployment.md) §12.
- [ ] Primer deploy validado con Lighthouse CI ([11-testing](./11-testing.md)).
