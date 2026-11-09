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
| Node version | `NODE_VERSION=22.23.4` (variable de entorno) |
| Install command | `npm ci` (por defecto) |

`npm run build` ejecuta `astro check && astro build`. Si `astro check` falla, no hay despliegue.

## 4. Variables por entorno

| Variable | Production | Preview | Uso |
|---|---|---|---|
| `NODE_VERSION` | `22.23.4` | `22.23.4` | Runtime de build |
| `PUBLIC_SITE_URL` | `https://raiden.pe` (o dominio final) | `https://preview.raiden.pe` | `site` en `astro.config.mjs`, canonicals, sitemap |
| `PUBLIC_WHATSAPP_NUMBER` | Número real de ventas | Número de pruebas del equipo | `src/config/site.ts` |
| `PUBLIC_ANALYTICS_PROVIDER` | `cloudflare` (o `noop`) | `console` | [18-analytics](./18-analytics.md) |
| `PUBLIC_CF_BEACON_TOKEN` | Token del panel Web Analytics | vacío | Beacon |
| `PUBLIC_ROBOTS` | `index` | `noindex` | `robots.txt` y meta robots se generan según este valor |
| Panel de administración (`ADMIN_EMAILS`, `EDITOR_EMAILS`, `CF_ACCESS_*`, `GITHUB_*`, `CF_API_TOKEN`…) | Ver §12 | Normalmente vacías (sin panel en previews) | Pages Functions `functions/api/admin` (ADR-018) |

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
- Node fijado con `NODE_VERSION` y `.nvmrc` (`22.23.4`) para que local, CI y Pages coincidan.

## 11. Runbook

| Situación | Acción |
|---|---|
| Build falla en Pages | Abrir el log; reproducir con `npm ci && npm run build` en local con Node 22.23.4. Causa habitual: `astro check` o variable ausente |
| Sitio caído tras deploy | Rollback (sección 8); después investigar en la preview |
| Enlace WhatsApp abre número incorrecto | Comprobar `PUBLIC_WHATSAPP_NUMBER` del entorno; relanzar build. No hay números en código |
| Cabeceras ausentes | Verificar que `public/_headers` está en `dist/_headers`; `_headers` no admite comodines anidados mal formados: validar con `npx wrangler pages dev dist` |
| Sitemap con dominio `raiden.example.com` | `PUBLIC_SITE_URL` no definido en ese entorno |
| Certificado pendiente > 15 min | Comprobar que el CNAME apunta a `raiden.pages.dev` y que no hay registros AAAA residuales |
| Preview indexada en Google | Confirmar `PUBLIC_ROBOTS=noindex` y Cloudflare Access activo en previews |
| Necesidad de purgar caché | Pages invalida por despliegue; para assets con hash no es necesario. Para `robots.txt` o `_headers`: Caching → Purge by URL |

Responsable operativo: DevOps. Aprobación de cambios en este documento: DevOps + Tech Lead (portabilidad).

## 12. Panel de administración `/admin` (ADR-018): alta en Cloudflare y GitHub

El panel necesita Pages Functions, un KV y las variables de abajo (ADR-024: login por email y contraseña; Cloudflare Access es opcional). Se da de alta **después** del primer despliegue (§2) y antes de entregar el acceso a Wiliam. Nada de esto toca el sitio público: si una variable falta, `/api/admin/*` responde 500 con un mensaje de configuración y el resto de la web sigue igual. Qué hace el panel: [17-admin-panel](./17-admin-panel.md); cómo se usa: [23-catalog-editing](./23-catalog-editing.md).

### 12.1 Token de GitHub (bot de contenido)

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Nombre `raiden-admin-panel`; *Resource owner* el propietario del repo; *Repository access*: **Only select repositories → `diego-1795/motos-electricas`**; *Permissions → Repository → Contents: Read and write* (nada más; *Metadata* se marca sola). Caducidad: 1 año (anotar en el calendario; al renovar, basta cambiar la variable y relanzar el build).
3. Si `main` está protegida con "require pull request", el token del usuario que la administra debe poder saltarse la protección o hay que permitir pushes directos al bot; si no, los commits del panel fallarán con 409/422 de GitHub. Recomendación: crear el token con la cuenta de Diego (los commits aparecerán como suyos, con el email del editor en el mensaje).

### 12.2 KV, secreto de sesión y contraseñas temporales (ADR-024)

1. **KV:** Workers & Pages → KV → *Create namespace* → `raiden-admin`. En el proyecto de Pages: Settings → Functions → **KV namespace bindings** → variable `ADMIN_KV` → ese namespace (Production; en Preview, otro namespace o ninguno).
2. **Secreto de sesión:** en el portátil, `npm run admin:password -- --secret` → copiar el valor a la variable `SESSION_SECRET` (marcar *Encrypt*). Distinto del de `.dev.vars`.
3. **Contraseñas temporales:** por cada persona, `npm run admin:password -- <email>`. Imprime la contraseña en claro **una sola vez** (entregarla en mano o por un canal distinto del email) y la línea `email:pbkdf2-sha256:…` para la variable `ADMIN_INITIAL_PASSWORDS` (varias separadas por coma). Al entrar por primera vez el panel obliga a cambiarla; después la variable deja de consultarse para ese email.
4. **Resetear una contraseña:** generar otra entrada para ese email, sustituirla en la variable, borrar la clave `user:<email>` del KV (Workers & Pages → KV → raiden-admin → *View*) y *Retry deployment*.

**Cloudflare Access (opcional, segunda barrera).** Ver [13-cloudflare](./13-cloudflare.md) §11: aplicación *self-hosted* sobre `/admin` y `/api/admin`, política *Allow* con los emails, método *One-time PIN*. Si se configura, anotar el **team domain** y el **AUD tag**; las Functions exigirán el JWT además de la contraseña.

### 12.3 Variables en Pages (Settings → Environment variables → Production)

| Variable | Valor | Secreto |
|---|---|---|
| `ADMIN_EMAILS` | `diegoo.1795@gmail.com` (varios separados por coma) | No |
| `EDITOR_EMAILS` | email de Wiliam | No |
| `ADMIN_KV` (binding KV, no variable) | namespace `raiden-admin` (§12.2) | — |
| `SESSION_SECRET` | ≥ 32 caracteres aleatorios (`npm run admin:password -- --secret`) | **Sí** |
| `ADMIN_INITIAL_PASSWORDS` | `email:pbkdf2-sha256:…` por persona, separadas por coma (§12.2) | **Sí** (son hashes, pero no hace falta exponerlos) |
| `CF_ACCESS_TEAM_DOMAIN` (opcional) | `<equipo>.cloudflareaccess.com` (vale también solo `<equipo>`) | No |
| `CF_ACCESS_AUD` (opcional) | AUD tag de la aplicación de Access (64 hex) | No |
| `GITHUB_TOKEN` | token fine-grained de §12.1 | **Sí** (Encrypt) |
| `GITHUB_REPO` | `diego-1795/motos-electricas` | No |
| `GITHUB_BRANCH` | `main` | No |
| `CF_API_TOKEN` (opcional) | token de API con *Account → Cloudflare Pages: Read* | **Sí** |
| `CF_ACCOUNT_ID` (opcional) | ID de la cuenta | No |
| `CF_PAGES_PROJECT` (opcional) | `raiden` (nombre del proyecto de Pages) | No |

Las tres opcionales permiten que el panel muestre el estado real del último build; sin ellas muestra "Publicando… ~3 min". Tras guardar las variables, **Retry deployment** para que las Functions las reciban. **No definir nunca `ADMIN_LOCAL_USER` en Pages**: el runtime de Pages no define `NODE_ENV`, así que la garantía real en producción es que esa variable no exista (la comprobación de host `localhost` es la segunda barrera). En *Preview* dejar todo vacío salvo que se quiera probar el panel contra una rama (`GITHUB_BRANCH` = esa rama).

### 12.4 Comprobación

| # | Comprobación | Resultado esperado |
|---|---|---|
| 1 | `https://raiden.pe/admin` sin sesión | Pantalla "Iniciar sesión" (email + contraseña); con Access activado, antes el 302 a `<equipo>.cloudflareaccess.com` |
| 2 | `curl -i https://raiden.pe/api/admin/me` sin sesión | 401 JSON `{ code: "unauthorized" }` con `Cache-Control: no-store`, nunca datos |
| 2b | `curl -i -X POST https://raiden.pe/api/admin/auth/login -d '{}'` | 415 (sin `Content-Type: application/json`); con la cabecera y credenciales falsas, 401; a la sexta vez, 423 |
| 3 | Entrar con el email de Diego y su contraseña temporal | Pide elegir una contraseña nueva; después panel con rol **admin**, botones Nuevo/Editar ficha/Borrar visibles |
| 4 | Entrar con el email de Wiliam (otra ventana privada) | Mismo cambio obligatorio; rol **editor**: solo precios y ocultar/mostrar, sin lista de administradores en Accesos |
| 4b | "Cambiar contraseña" y recargar en la otra ventana | La otra sesión queda cerrada (vuelve al inicio de sesión) |
| 5 | Cambiar un precio de prueba y revertirlo | Dos commits `chore(catalog): actualizar … por …` en GitHub y dos builds en Pages |
| 6 | `curl -I https://raiden.pe/admin` con sesión | `Cache-Control: no-store`, `X-Robots-Tag: noindex`, CSP con `connect-src 'self'` |
| 7 | `https://raiden.pe/sitemap-0.xml` y `/robots.txt` | Sin `/admin` ni `/legal/*`; `Disallow: /admin` |
| 8 | `curl -I https://raiden.pe/productos` | **200** (no 308 a `/productos/`): `build.format: 'file'`, ADR-024 |

### 12.5 Desarrollo local (sin Cloudflare)

```bash
cp .dev.vars.example .dev.vars   # rellenar SESSION_SECRET, ADMIN_INITIAL_PASSWORDS (npm run admin:password), GITHUB_TOKEN y GITHUB_BRANCH=admin-sandbox
npm run build && npm run admin:dev   # http://localhost:8788/admin
```

`wrangler pages dev dist --kv ADMIN_KV` sirve el build estático, las Functions de `functions/` y un KV local (persistido en `.wrangler/state`, ignorado por git): el login por contraseña funciona igual que en producción. Para desarrollar la interfaz sin contraseña, descomentar `ADMIN_LOCAL_USER` (solo cuenta en `localhost`; cabecera `x-admin-local-user` para probar el rol editor desde el propio panel). Las escrituras van a la rama `GITHUB_BRANCH` indicada: crear antes `admin-sandbox` desde `main` para no lanzar builds de producción desde el portátil. Sin `GITHUB_TOKEN` el login funciona pero el catálogo devuelve 500 de configuración.

Para volver a probar la contraseña temporal en local (o "resetear" un usuario), con el servidor parado:

```bash
npx wrangler kv key delete "user:<email>" --namespace-id ADMIN_KV --local
```

### 12.6 Operación

- **Los commits del panel nacen en GitHub.** Antes de seguir desarrollando: `git pull`. Si se desarrolla sobre un `main` desactualizado, el push fallará (no es destructivo).
- **Rotar el token** (caducidad o filtración): revocar en GitHub, crear otro, actualizar `GITHUB_TOKEN`, *Retry deployment*.
- **Quitar o añadir un editor:** editar `EDITOR_EMAILS`/`ADMIN_EMAILS` (y la política de Access si está activado), añadir su contraseña temporal a `ADMIN_INITIAL_PASSWORDS` (§12.2) y relanzar el build. Quitar a alguien de las listas basta para que no pueda entrar (sin rol no se emite sesión); para limpiar, borrar también su `user:<email>` del KV.
- **Rotar `SESSION_SECRET`:** cambiar la variable y relanzar el build cierra todas las sesiones abiertas.
- **Build fallido tras un cambio del panel:** el JSON pasó los validadores, así que la causa suele ser una imagen inexistente referenciada en el "JSON avanzado". Abrir el log de Pages, corregir desde el panel (o por git) y volverá a construir. Mientras tanto el sitio sirve el último deploy correcto (Pages no publica builds fallidos).
