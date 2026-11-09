# 17 — Panel de administración

El catálogo (productos y repuestos) y el blog viven como ficheros en el repositorio (JSON y Markdown) y se publican con cada commit (git como CMS). Desde ADR-018 existe un **panel `/admin` ligero sobre git** para que la tienda edite precios, oculte fichas y, en el caso del administrador, cree, edite o borre productos sin tocar git: el panel escribe los mismos ficheros mediante la API de GitHub y Cloudflare Pages reconstruye el sitio. ADR-023 amplía el panel al **blog** (solo admin), a la **subida de PDF** (manual y ficha técnica; única subida de ficheros del panel) y añade al editor de producto los campos **Manual de uso / Ficha técnica / Video de YouTube** y las **fotos por ruta**. Las imágenes nunca se suben desde el panel: van por git en webp (ADR-020) y el contenido solo lleva su ruta. No hay base de datos. El diseño sobre Supabase (§3) queda como evolución futura si el volumen lo justifica.

Documentos relacionados: [21-decisions](./21-decisions.md) ADR-018 y ADR-023, [19-deployment](./19-deployment.md) §12 (alta en Cloudflare), [24-guia-administrador](./24-guia-administrador.md) (guía para el cliente, servida también en `/admin/ayuda`), [23-catalog-editing](./23-catalog-editing.md) (guía técnica de edición), [10-security](./10-security.md).

## 1. Panel `/admin` (fase actual, ADR-018 + ADR-023)

### Alcance

| | admin (Diego) | editor (Wiliam) |
|---|---|---|
| Ver catálogo completo (incluidos ocultos) | ✓ | ✓ |
| Cambiar precios (`variants[].price.amount`, `price.amount`) | ✓ | ✓ |
| Ocultar / mostrar (`hidden`) | ✓ | ✓ |
| Editar cualquier otro campo (categoría, variantes, colores, specs, manual, ficha técnica, video…) | ✓ | ✗ (403) |
| Crear (duplicando una ficha) | ✓ | ✗ (403) |
| Borrar | ✓ | ✗ (403) |
| Blog: listar, leer, crear, editar y borrar artículos (ADR-023) | ✓ | ✗ (403; la pestaña no se muestra) |
| Subir PDF de manual/ficha a `public/docs` (ADR-023) | ✓ | ✗ (403) |
| Ver la guía `/admin/ayuda` | ✓ | ✓ |
| Cambiar su propia contraseña (ADR-024) | ✓ | ✓ |
| Gestionar quién es admin/editor y asignar contraseñas temporales | En Cloudflare (variables `ADMIN_EMAILS`/`EDITOR_EMAILS`, `ADMIN_INITIAL_PASSWORDS`); el panel lo muestra | Solo ve su propio email |

Fuera del panel (siguen por git): **todas las imágenes** (productos, repuestos, blog: se convierten a webp y se colocan en `src/assets/`; el panel solo escribe su ruta), FAQ, testimonios, categorías y textos de `src/config/site.ts`.

### Arquitectura

```
Navegador ─────────────────────────────────────────▶ /admin  (HTML estático + isla Preact, noindex)
   │  POST /api/admin/auth/login (email + contraseña) → cookie de sesión HttpOnly (ADR-024)
   └──────────────────────────────────────────────────▶ /api/admin/*  (Pages Functions, functions/api/admin)
                                                          │ 0. Origin propio + Content-Type JSON (CSRF)
                                                          │ 1. sesión: cookie firmada + usuario en KV (ADMIN_KV)
                                                          │    [opcional: además JWT de Cloudflare Access]
                                                          │ 2. rol = ADMIN_EMAILS / EDITOR_EMAILS (servidor)
                                                          │ 3. valida con src/content/schemas.ts + catalogRules
                                                          │ 4. aplica adminPolicy (editor: solo precio/hidden)
                                                          ▼
                                                   GitHub Contents API (rama main, token del bot)
                                                          │ commit "chore(catalog): … por <email>"
                                                          ▼
                                                   Cloudflare Pages build (2–3 min) → sitio actualizado
```

| Pieza | Dónde | Notas |
|---|---|---|
| Página y layout | `src/pages/admin/index.astro`, `src/pages/admin/ayuda.astro`, `src/layouts/AdminLayout.astro` | Sin cabecera, carrito ni analítica; `noindex`; fuera de sitemap, robots y Pagefind. `/admin/ayuda` renderiza `docs/24-guia-administrador.md` |
| Islas | `src/islands/admin/*` | `LoginForm` y `PasswordForm` (ADR-024), lista, precio inline, interruptor ocultar, editor de ficha (admin), confirmación de borrado, estado de publicación; `BlogPanel`/`BlogEditor` (pestaña Blog), `ImageFields` (imagen por ruta + alt + ancho × alto), `PdfUpload` (manual/ficha) |
| Acceso | `functions/api/admin/_lib/auth.ts` + `src/domain/adminAuth.ts` | PBKDF2, cookie HMAC, usuarios y contadores en KV `ADMIN_KV`, política de contraseñas (≥ 10 caracteres, sin email ni secuencias); `_lib/access.ts` solo para el JWT opcional de Access |
| Cliente HTTP | `src/services/admin/AdminApiClient.ts` | Único punto de `fetch`; sin lógica de negocio |
| Contrato del API | `src/domain/admin.ts` | Tipos compartidos por islas y Functions (catálogo, blog, subidas) |
| Política de roles | `src/domain/adminPolicy.ts` | Pura; `applyProductPatch`/`applyPartPatch` solo tocan precio y `hidden`; operaciones `blog` y `upload` solo admin |
| Reglas de catálogo | `src/domain/catalogRules.ts` | Una variante por defecto, Premium ≥ Estándar, PEN, batería, referencias |
| Reglas del blog | `src/domain/blogRules.ts` | Slug, campos obligatorios, fechas ISO, foto `~/assets/blog/*.webp` con alt, `relatedProducts` existentes, sin €/EUR/carnet/IVA (lo mismo que `validate:content`) |
| Frontmatter | `src/domain/frontmatter.ts` | Lector/escritor determinista del subconjunto YAML de los artículos (sin dependencias) |
| Subidas | `src/domain/uploads.ts` | Solo PDF: ruta blanca `public/docs/<kebab>.pdf`, cabecera real `%PDF-` y tope de 10 MB |
| Video | `src/domain/video.ts` | `normalizeYouTubeUrl` → `https://www.youtube.com/watch?v=<id>` |
| Esquemas | `src/content/schemas.ts` | Los mismos zod del build (`content.config.ts`): `productSchema`, `partSchema`, `blogSchema` + `parsePost` |
| Functions | `functions/api/admin/*` | `_middleware.ts` (Access + rol), `me`, `catalog`, `products/[slug]`, `repuestos/[slug]`, `deploy`, `blog/index`, `blog/[slug]`, `uploads`; `_lib/` (JWT, GitHub, handlers, blog, uploads) |
| Visibilidad | `src/domain/catalog.ts` → `visibleOnly` | Aplicada en `all()` de `src/data/json.ts` (y del ejemplo Supabase) |
| Cabeceras | `public/_headers` (`/admin`, `/admin/*`, `/api/admin/*`) | CSP propia (`connect-src 'self'`), `no-store`, `X-Robots-Tag: noindex` (sin cambios en ADR-023) |

### API

| Método y ruta | Quién | Cuerpo | Respuesta |
|---|---|---|---|
| `POST /api/admin/auth/login` | cualquiera (sin sesión) | `{ email, password }` | `AdminUser` + cookie `raiden_admin`; 401 credenciales (mismo mensaje si el email no existe), 423 bloqueo temporal, 415 sin `Content-Type: application/json` |
| `POST /api/admin/auth/logout` | cualquiera | — | `{ ok: true }`; borra la cookie |
| `POST /api/admin/auth/password` | ambos (con sesión) | `{ currentPassword, newPassword }` | `AdminUser` + cookie nueva; 401 actual incorrecta, 422 política; invalida las otras sesiones |
| `GET /api/admin/me` | ambos | — | `AdminUser` (email, rol, listas —vacías para el editor—, rama, modo local, `mustChangePassword`) |
| `GET /api/admin/catalog` | ambos | — | productos y repuestos con `sha` y ruta (incluye ocultos) |
| `PATCH /api/admin/products/:slug` | ambos | `{ sha, prices?: {variantId: céntimos}, hidden?, reason? }` | ficha actualizada + commit |
| `PATCH /api/admin/repuestos/:slug` | ambos | `{ sha, price?, hidden?, reason? }` | ídem |
| `PUT /api/admin/products/:slug` · `/repuestos/:slug` | admin | `{ sha?, data, reason? }` (sin `sha` = crear) | ficha + commit |
| `DELETE …/:slug` | admin | `{ sha, reason? }` | commit; 409 si otra ficha lo referencia |
| `GET /api/admin/deploy` | ambos | — | estado del último build de Pages o `available: false` |
| `GET /api/admin/blog` | admin | — | `BlogList`: `{ posts: [{ slug, title, category, publishedAt, updatedAt?, author, hasImage, sha, path }], branch }`, más reciente primero |
| `GET /api/admin/blog/:slug` | admin | — | `BlogEntry`: `{ slug, frontmatter, body, sha, path }` (frontmatter ya validado con `blogSchema`) |
| `PUT /api/admin/blog/:slug` | admin | `{ sha?, reason?, frontmatter, body }` (sin `sha` = crear) | `BlogWriteResult` = `BlogEntry` + `commit`; escribe `src/content/blog/<slug>.md` con frontmatter determinista |
| `DELETE /api/admin/blog/:slug` | admin | `{ sha, reason? }` | `{ path, commit }` (sin comprobación de referencias: nadie apunta a un artículo) |
| `POST /api/admin/uploads` | admin | `{ path, contentBase64, reason? }` · `path` = `public/docs/<kebab>.pdf` (solo PDF) | `UploadResult`: `{ path, ref ("/docs/x.pdf"), bytes, sha, replaced, commit }`; si el fichero existe lo sustituye |

Errores en JSON `{ code, error, details? }`: 401 sin identidad, 403 fuera de rol, 404, 409 conflicto de `sha` o referencias, 413 cuerpo demasiado grande, 422 validación (lista de errores legibles; en uploads: ruta fuera de `public/docs`, cabecera que no es `%PDF-`, tamaño), 502 fallo de GitHub o fichero del repo que no pasa el esquema.

Commits: `chore(catalog): …` (productos y repuestos), `chore(blog): <crear|actualizar|borrar> <slug> por <email>` y `chore(assets): subir <ruta> por <email>`.

### Blog y subidas (ADR-023)

- **Artículos.** `src/content/blog/<slug>.md` = frontmatter (`title`, `description`, `category`, `publishedAt`, `updatedAt?`, `author`, `image?`, `relatedProducts`) + cuerpo Markdown. `blogSchema` vive en `src/content/schemas.ts` y lo usan tanto `content.config.ts` como las Functions; `parsePost` añade `blogRules`. El tiempo de lectura no se escribe (ADR-016). El servidor serializa el frontmatter con `src/domain/frontmatter.ts` (cadenas JSON entre comillas dobles, listas en línea, `image` en bloque, orden fijo de claves): guardar sin cambios no produce diff. Un fichero del repo escrito a mano con YAML fuera de ese subconjunto (bloques `|`, anclas, tabuladores) se señala con 502 y se corrige por git.
- **Imágenes: siempre por git, solo por ruta.** El panel no sube imágenes (ni de productos ni del blog). El cliente envía las fotos a Diego, que las convierte a webp (`cwebp -q 90`, ADR-020) y las coloca en `src/assets/products/` o `src/assets/blog/`. En el panel, la galería del producto (`images[]`), la foto de cada color (`colors[].image`) y la foto del artículo (`image`) son campos visibles de ruta + alt + ancho × alto (`ImageFields`), validados con `safeUrl` (`~/assets/`, `/` o `https://`; en el blog, `~/assets/blog/<kebab>.webp`). Una ruta inexistente hace fallar el build: el producto puede guardarse `hidden` hasta que las fotos estén.
- **PDF.** `public/docs/<slug>-manual.pdf` y `<slug>-ficha.pdf` (cabecera `%PDF-`); el editor de producto rellena `manualUrl`/`datasheetUrl` con `/docs/…`. `public/docs/` se crea con la primera subida.
- **Topes.** PDF 10 MB, cuerpo de `/uploads` 14 MB (`MAX_UPLOAD_BODY_BYTES`). GitHub admite 100 MB, pero una Pages Function tiene 128 MB de memoria y el cuerpo pasa por JSON + base64 (×1,33) + decodificación: 10 MB de PDF ≈ 24 MB en memoria con margen. Un manual mayor se comprime antes.
- **Cada subida de PDF es un commit propio** (y un build) distinto del guardado de la ficha: subir el PDF y no guardar la ficha deja el fichero en `public/docs` sin enlazar (inofensivo).
- **Video.** `videoUrl` se normaliza a `https://www.youtube.com/watch?v=<id>` (`src/domain/video.ts`); `ProductTabs.astro` extrae el id y crea el iframe de `youtube-nocookie.com` solo al pulsar reproducir (CSP global ya con `frame-src https://www.youtube-nocookie.com`).
- **Subpeticiones.** `GET /api/admin/blog` lee cada `.md` (1 + N): con el límite de 50 por petición del plan gratuito, hasta ~45 artículos (hoy 8). Misma salida que el catálogo si crece: Git Trees API.

### Flujo de un cambio de precio

1. Wiliam entra en `https://<dominio>/admin` con su email y su contraseña (la primera vez, la temporal que le dio Diego, que el panel le obliga a cambiar).
2. El panel carga `me` y `catalog`. Cambia el precio Estándar a 1,250 y pulsa Guardar.
3. `PATCH /api/admin/products/royal-tiger` con `{ sha, prices: { estandar: 125000 } }`.
4. La Function comprueba la cookie de sesión (y el JWT de Access si está activado), resuelve `editor`, lee el JSON actual de GitHub, compara el `sha`, aplica el patch (rechaza cualquier otra clave), valida (Premium ≥ Estándar) y hace el commit `chore(catalog): actualizar royal-tiger por wiliam@…`.
5. Pages detecta el push y reconstruye. El panel muestra "Publicando… ~3 min" (o el estado real si la API de Pages está configurada).

### Seguridad

- La sesión por contraseña es la puerta (ADR-024): sin cookie válida no hay respuesta útil (401). Contraseñas en PBKDF2 (KV), temporal obligatoria de cambiar, bloqueo tras 5 intentos, cookie `HttpOnly`/`SameSite=Strict`, `Origin` y `Content-Type` comprobados. Cloudflare Access, si se configura, es una segunda barrera. El rol se decide en el servidor con `ADMIN_EMAILS`/`EDITOR_EMAILS`; la interfaz solo oculta lo que el rol no puede hacer.
- El token de GitHub es *fine-grained*, limitado al repositorio y al permiso *Contents*; vive en las variables de Pages (secreto), nunca en `src/` ni en `PUBLIC_*`.
- Todo lo que se escribe pasa por los esquemas del build: un JSON inválido no llega al repo (y si llegara, CI y el build lo detendrían).
- Auditoría = historial de git: cada commit lleva autor (email), acción, slug, cambios y motivo.
- El modo local (`ADMIN_LOCAL_USER`) solo actúa en `localhost`; no se define en Pages.

### Límites

- Cada guardado es un commit y un build (2–3 min). Adecuado para < 20 cambios por semana.
- Solo sube PDFs (ADR-023): todas las imágenes siguen por git en webp ([23-catalog-editing](./23-catalog-editing.md) §3 y §5); el panel las referencia por ruta.
- Si dos personas editan la misma ficha, la segunda recibe 409 y debe recargar.
- Requiere el despliegue en Cloudflare Pages (fase 16) con el KV `ADMIN_KV`, `SESSION_SECRET` y `ADMIN_INITIAL_PASSWORDS`; hasta entonces funciona en local con `npm run admin:dev` (login real contra el KV local de wrangler).
- **Tamaño del catálogo:** `GET /api/admin/catalog` (y `DELETE`, que comprueba referencias) lee cada JSON con una subpetición a GitHub: 2 + N llamadas. El plan gratuito de Workers/Pages permite 50 subpeticiones por petición, así que el panel soporta hasta **~45 fichas** (hoy 31). Al acercarse, cambiar la lectura a la Git Trees/Data API (un árbol + blobs) o cachear el catálogo; está anotado en el roadmap.
- Un JSON corrupto en el repo hace fallar la carga completa del catálogo (502 con el fichero señalado): se corrige por git.
- Cuerpos limitados a 256 KB (14 MB en `/uploads`), slugs a 80 caracteres, motivo del commit a 300 caracteres, cuerpo de un artículo a 60 000 caracteres.

## 2. Git como CMS (vía alternativa, siempre disponible)

### Dónde vive cada cosa

| Contenido | Ruta | Colección Astro | Repositorio (`src/data/`) |
|---|---|---|---|
| Productos | `src/content/products/<slug>.json` | `products` | `JsonProductRepository` |
| Repuestos | `src/content/repuestos/<slug>.json` | `repuestos` | `JsonPartRepository` |
| Categorías | `src/content/categories/<slug>.json` | `categories` | `JsonCategoryRepository` |
| Marcas | `src/config/site.ts` (RAIDEN; sin colección) | — | — |
| Blog | `src/content/blog/<slug>.md` | `blog` | `JsonBlogRepository` |
| FAQ | `src/content/faqs/<slug>.json` | `faqs` | `JsonFaqRepository` |
| Imágenes | `src/assets/products/`, `repuestos/`… | — | Referenciadas por ruta relativa |

### Cómo editar

1. Rama `content/<tema>` desde `main` ([14-devops](./14-devops.md)).
2. Copiar un JSON existente como plantilla; respetar los campos obligatorios de [15-content-strategy](./15-content-strategy.md).
3. `npm run dev` para ver el resultado; `npm run validate:content && npm run build` valida.
4. PR con la plantilla; revisión de Content y SEO; squash merge.

### Validación en build

- Cada colección se define en `src/content.config.ts` (productos y repuestos en `src/content/schemas.ts`): tipos, rangos, enumeraciones y referencias cruzadas.
- Un JSON inválido detiene `astro build` con ruta y campo afectado. No se despliega nada roto.
- `tests/unit/content.test.ts` recorre las colecciones y comprueba unicidad de `slug`, precios, compatibilidades y que ningún oculto llega a los repositorios.
- `hidden: true` excluye el elemento de `getStaticPaths`, sitemap, listados, JSON-LD y buscador sin borrarlo.

## 3. Diseño futuro: Supabase

Se activa solo si se cumple el criterio de §4 (más de 40 productos o más de 20 cambios por semana, o una persona de ventas que necesite historial de solicitudes). Hasta entonces, el panel de §1 cubre la operación con coste cero y sin migrar datos.

### Base: Supabase Auth + RLS

- Autenticación con Supabase Auth (correo + enlace mágico). Solo cuentas invitadas desde la tabla `admin_users`.
- Autorización en base de datos con Row Level Security: cada tabla tiene políticas por rol leídas del JWT (`auth.jwt() ->> 'role'`), de modo que el panel no puede hacer más de lo que la base de datos permite, sea cual sea el cliente que lo consuma.
- El frontend público sigue siendo estático y lee mediante `SupabaseProductRepository` con la clave `anon` y políticas de solo lectura sobre filas `status = 'published'`.
- Los ficheros se almacenan en Supabase Storage (bucket `products`, público en lectura); el build descarga y optimiza con sharp igual que hoy con `src/assets/`.

### Dónde correría el panel

| Criterio | A. `/admin` en el mismo proyecto con adapter SSR | B. Aplicación separada (`admin.raiden.pe`) |
|---|---|---|
| Cambios en `astro.config` | `prerender = false` solo en `/admin/*` + adapter | Ninguno en el sitio público |
| Riesgo para el sitio público | Medio: comparte dependencias, CSP y presupuesto de bundle | Nulo |
| Reutilización de `src/domain` y `src/services` | Directa | Mediante workspace npm (`packages/domain`) |
| Esfuerzo inicial | Menor | Mayor (monorepo, segundo deploy) |

Decisión original: opción B (`apps/admin`, SPA Preact + Supabase). ADR-018 la sustituye para la fase actual por el panel ligero de §1, que ya reutiliza `src/domain` sin adapter ni segundo despliegue; si se migra a Supabase, el panel de §1 puede conservar su interfaz cambiando el almacén (GitHub → tablas) detrás de las Functions.

### Módulos previstos

| Módulo | Tabla(s) | Operaciones | Roles con escritura |
|---|---|---|---|
| Productos, variantes, colores | `products`, `product_variants`, `product_colors` | CRUD, duplicar, estado, orden | admin, editor |
| Repuestos | `parts`, `product_parts` | CRUD, unidad, código, compatibilidad | admin, editor |
| Categorías y marcas | `categories`, `brands` | CRUD | admin |
| Solicitudes de pedido y clientes | `order_requests`, `whatsapp_requests`, `customers` | Listado, estado, notas internas | admin, ventas |
| Blog, FAQ, reseñas | `blog_posts`, `faqs`, `reviews` | CRUD / moderación | admin, editor / ventas |
| Configuración | `site_settings` | WhatsApp, horario, avisos | admin |

Roles `admin`, `editor` y `ventas` en `admin_users.role`, copiados al JWT con `custom_access_token_hook`; las políticas RLS son la única autoridad. Auditoría en `audit_log` por triggers (retención 2 años). Seguridad: `service_role` solo en Edge Functions, MFA obligatorio para `admin`, sesiones de 8 h, CSP con `connect-src` limitado al proyecto, subida de imágenes validada (JPEG/PNG/WebP, 5 MB), rate limiting en Edge Functions y copia semanal a `content/backup/` para no perder la vía git ([20-migration](./20-migration.md)).

## 4. Fases

| Fase | Alcance | Estado |
|---|---|---|
| 0 | Git como CMS | Hecho (MVP) |
| 1 | Panel ligero sobre git (`/admin`, Access, Functions, GitHub, `hidden`) — ADR-018 | Hecho en código; operativo al desplegar en Pages (fase 16 del roadmap) |
| 1b | Blog en el panel, PDF de manual/ficha, campos manual/ficha/video, fotos por ruta, guía `/admin/ayuda` — ADR-023 | Hecho en código (2026-11-04); mismo requisito de despliegue |
| 1c | Login por email y contraseña con sesión propia (KV + cookie), contraseña temporal obligatoria de cambiar, Access opcional — ADR-024 | Hecho en código (2026-11-08); funciona ya en local |
| 2 | Estado real del build desde la API de Pages | Opcional |
| 3 | Supabase (esquema, RLS, `SupabaseProductRepository`, módulos de §3) | Solo si > 40 productos o > 20 cambios/semana, o entra ventas |
| 4 | Solicitudes de pedido, clientes, WhatsApp Business API | Tras la fase 3 |
