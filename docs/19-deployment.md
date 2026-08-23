# 19 — Despliegue

Procedimiento de despliegue de Raiden en Cloudflare Pages desde GitHub, con verificación y rollback. Alternativas de hosting al final. Relacionado con [13-cloudflare](./13-cloudflare.md), [14-devops](./14-devops.md), [10-security](./10-security.md) y [20-migration](./20-migration.md).

## 1. Principios

- El artefacto de despliegue es la carpeta `dist/` generada por `astro build` (`output: 'static'`). Cualquier servidor de ficheros estáticos puede servirla.
- No hay secretos en build: solo variables `PUBLIC_*`.
- Producción se despliega únicamente desde `main`. Cualquier otra rama genera una preview.
- Nada específico de Cloudflare en el código fuente; lo específico vive en `public/_headers`, `public/_redirects` y la configuración del panel.

## 2. Pipeline en Cloudflare Pages desde GitHub

1. En el panel de Cloudflare: Workers & Pages → Create → Pages → Connect to Git → seleccionar el repositorio `motos-electricas`.
2. Rama de producción: `main`.
3. Configuración de build (sección 3). Guardar y lanzar el primer despliegue.
4. Añadir las variables de entorno para Production y Preview (sección 4). Relanzar el build (las variables no se aplican a builds anteriores).
5. Configurar dominio personalizado (sección 6).
6. Activar "Build caching" y, en Preview, "Preview deployments: all branches" con acceso protegido mediante Cloudflare Access (gratuito hasta 50 usuarios) para que las previews no se indexen ni sean públicas.
7. En GitHub: proteger `main` (PR obligatoria, checks `ci` en verde: lint, typecheck, vitest, playwright, lighthouse-ci).

Flujo resultante: `push` a rama → Cloudflare construye preview y comenta la URL en la PR → revisión → merge a `main` → build de producción → dominio actualizado en 1–2 minutos.

## 3. Configuración de build

| Campo | Valor |
|---|---|
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Node version | `NODE_VERSION=22.12.0` (variable de entorno) |
| Install command | `npm ci` (por defecto) |

`npm run build` ejecuta `astro check && astro build`. Si `astro check` falla, no hay despliegue.

## 4. Variables por entorno

| Variable | Production | Preview | Uso |
|---|---|---|---|
| `NODE_VERSION` | `22.12.0` | `22.12.0` | Runtime de build |
| `PUBLIC_SITE_URL` | `https://raiden.pe` (o dominio final) | `https://preview.raiden.pe` | `site` en `astro.config.mjs`, canonicals, sitemap |
| `PUBLIC_WHATSAPP_NUMBER` | Número real de ventas | Número de pruebas del equipo | `src/config/site.ts` |
| `PUBLIC_ANALYTICS_PROVIDER` | `cloudflare` (o `noop`) | `console` | [18-analytics](./18-analytics.md) |
| `PUBLIC_CF_BEACON_TOKEN` | Token del panel Web Analytics | vacío | Beacon |
| `PUBLIC_ROBOTS` | `index` | `noindex` | `robots.txt` y meta robots se generan según este valor |

En preview, `public/_headers` añade `X-Robots-Tag: noindex` cuando `PUBLIC_ROBOTS=noindex` (se genera en build copiando la plantilla correspondiente desde `scripts/headers.mjs`).

## 5. Previews por PR

- Cada PR obtiene `https://<hash>.raiden.pages.dev` y, por rama, `https://<rama>.raiden.pages.dev`.
- El bot de Cloudflare publica la URL en la PR. QA ejecuta la checklist de la sección 7 sobre esa URL.
- Las previews usan el número de WhatsApp de pruebas: ningún clic de QA llega a ventas.
- Las previews caducan con la rama; no se conservan como entornos permanentes.

## 6. Dominio y HTTPS

1. Pages → Custom domains → añadir `raiden.pe` y `www.raiden.pe`.
2. Si el DNS está en Cloudflare, los registros CNAME se crean solos; si no, crear `CNAME www → raiden.pages.dev` y usar CNAME flattening o ALIAS en el apex.
3. SSL/TLS: modo Full (strict); certificado Universal emitido automáticamente. Activar "Always Use HTTPS" y HSTS (max-age 6 meses, includeSubDomains, preload solo tras dos semanas sin incidencias).
4. Redirección `www → apex` (o al revés, una sola canónica) en `public/_redirects`:

```
https://www.raiden.pe/* https://raiden.pe/:splat 301
```

5. Comprobar que `PUBLIC_SITE_URL` coincide exactamente con la canónica elegida.

## 7. Verificación post-deploy (checklist)

| # | Comprobación | Cómo | Resultado esperado |
|---|---|---|---|
| 1 | Cabeceras de seguridad | `curl -I https://raiden.pe` | CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` presentes |
| 2 | Sitemap | `curl https://raiden.pe/sitemap-index.xml` | 200, URLs con el dominio canónico, sin `/carrito` ni `/comparar` |
| 3 | robots | `curl https://raiden.pe/robots.txt` | `Allow: /`, `Sitemap:` con URL absoluta; en preview `Disallow: /` |
| 4 | Enlace WhatsApp | Añadir un producto, abrir carrito, pulsar "Solicitar pedido" | URL `https://wa.me/<número>?text=...` con el número de producción y mensaje decodificado correcto |
| 5 | Lighthouse móvil en `/`, un listado y una ficha | `npx lhci autorun` o PageSpeed Insights | Performance ≥ 90, LCP < 2,0 s, INP < 200 ms, CLS < 0,1 |
| 6 | Imágenes | DevTools → Network | AVIF/WebP servidos, `width`/`height` presentes, sin CLS |
| 7 | 404 | `curl -I https://raiden.pe/no-existe` | 404 con página propia |
| 8 | Redirección www | `curl -I https://www.raiden.pe/` | 301 a la canónica |
| 9 | Analítica | Panel de Cloudflare Web Analytics | Visitas registradas en los primeros 10 minutos |
| 10 | Sin secretos | `grep -r "SUPABASE_SERVICE" dist/` | Sin resultados |

Si falla 1, 4 u 10: rollback inmediato. Si falla 5: se abre incidencia a Performance sin rollback salvo regresión > 20 puntos.

## 8. Rollback

- Pages → Deployments → seleccionar el último despliegue correcto → "Rollback to this deployment". Es instantáneo y no requiere rebuild.
- Alternativa desde git: `git revert <sha>` en `main` y push; genera un nuevo build (2–3 minutos).
- Rollback no revierte variables de entorno: si el fallo es de configuración, corregir la variable y relanzar el build.
- Registrar cada rollback en el CHANGELOG con causa y despliegue restaurado.

## 9. Despliegue alternativo

Porque el artefacto es `dist/`, cambiar de hosting es configuración, no código. Detalle de cada migración en [20-migration](./20-migration.md).

| Aspecto | Cloudflare Pages | Vercel | Netlify | S3 + CloudFront | Nginx |
|---|---|---|---|---|---|
| Build | Panel (`npm run build`, `dist`) | `vercel.json` / detección Astro | `netlify.toml` | CI sube `dist/` con `aws s3 sync` | CI hace `rsync` a `/var/www/raiden` |
| Cabeceras | `public/_headers` | `headers` en `vercel.json` | `public/_headers` (mismo formato) | Response Headers Policy en CloudFront | `add_header` en `server {}` |
| Redirecciones | `public/_redirects` | `redirects` en `vercel.json` | `public/_redirects` | CloudFront Function | `return 301` |
| Previews por PR | Sí | Sí | Sí | No (manual) | No |
| HTTPS | Automático | Automático | Automático | ACM | certbot |
| 404 | `dist/404.html` automático | `dist/404.html` automático | `dist/404.html` automático | Custom error response → `/404.html` | `error_page 404 /404.html;` |
| Coste MVP | 0 | 0 (Hobby) | 0 (Starter) | Céntimos/mes | VPS |

## 10. Versiones

- Versionado semántico en `package.json`; cada despliegue a producción corresponde a un tag `vX.Y.Z` en `main`.
- `CHANGELOG.md` con secciones Added/Changed/Fixed; se actualiza en la PR que introduce el cambio.
- Dependencias: `npm ci` con `package-lock.json` commiteado; actualizaciones de Astro y Preact en PR propia con Lighthouse CI en verde.
- Node fijado con `NODE_VERSION` y `.nvmrc` (`22.12.0`) para que local, CI y Pages coincidan.

## 11. Runbook

| Situación | Acción |
|---|---|
| Build falla en Pages | Abrir el log; reproducir con `npm ci && npm run build` en local con Node 22.12. Causa habitual: `astro check` o variable ausente |
| Sitio caído tras deploy | Rollback (sección 8); después investigar en la preview |
| Enlace WhatsApp abre número incorrecto | Comprobar `PUBLIC_WHATSAPP_NUMBER` del entorno; relanzar build. No hay números en código |
| Cabeceras ausentes | Verificar que `public/_headers` está en `dist/_headers`; `_headers` no admite comodines anidados mal formados: validar con `npx wrangler pages dev dist` |
| Sitemap con dominio `raiden.example.com` | `PUBLIC_SITE_URL` no definido en ese entorno |
| Certificado pendiente > 15 min | Comprobar que el CNAME apunta a `raiden.pages.dev` y que no hay registros AAAA residuales |
| Preview indexada en Google | Confirmar `PUBLIC_ROBOTS=noindex` y Cloudflare Access activo en previews |
| Necesidad de purgar caché | Pages invalida por despliegue; para assets con hash no es necesario. Para `robots.txt` o `_headers`: Caching → Purge by URL |

Responsable operativo: DevOps. Aprobación de cambios en este documento: DevOps + Tech Lead (portabilidad).
