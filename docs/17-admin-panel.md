# 17 — Panel de administración

El catálogo (productos y repuestos) vive como ficheros JSON en el repositorio y se publica con cada commit (git como CMS). Desde ADR-018 existe un **panel `/admin` ligero sobre git** para que la tienda edite precios, oculte fichas y, en el caso del administrador, cree, edite o borre productos sin tocar git: el panel escribe los mismos JSON mediante la API de GitHub y Cloudflare Pages reconstruye el sitio. No hay base de datos. El diseño sobre Supabase (§3) queda como evolución futura si el volumen lo justifica.

Documentos relacionados: [21-decisions](./21-decisions.md) ADR-018, [19-deployment](./19-deployment.md) §12 (alta en Cloudflare), [23-catalog-editing](./23-catalog-editing.md) (guía de uso para Diego y Wiliam), [10-security](./10-security.md).

## 1. Panel `/admin` (fase actual, ADR-018)

### Alcance

| | admin (Diego) | editor (Wiliam) |
|---|---|---|
| Ver catálogo completo (incluidos ocultos) | ✓ | ✓ |
| Cambiar precios (`variants[].price.amount`, `price.amount`) | ✓ | ✓ |
| Ocultar / mostrar (`hidden`) | ✓ | ✓ |
| Editar cualquier otro campo (categoría, variantes, colores, specs…) | ✓ | ✗ (403) |
| Crear (duplicando una ficha) | ✓ | ✗ (403) |
| Borrar | ✓ | ✗ (403) |
| Gestionar quién es admin/editor | En Cloudflare (Access + variables); el panel lo muestra | Solo lectura |

Fuera del panel (siguen por git): blog, FAQ, testimonios, categorías, imágenes y textos de `src/config/site.ts`.

### Arquitectura

```
Navegador ──(Cloudflare Access: login por email)──▶ /admin  (HTML estático + isla Preact, noindex)
   │                                                   │ fetch mismo origen
   └──────────────────────────────────────────────────▶ /api/admin/*  (Pages Functions, functions/api/admin)
                                                          │ 1. verifica JWT de Access (JWKS del equipo)
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
| Página y layout | `src/pages/admin/index.astro`, `src/layouts/AdminLayout.astro` | Sin cabecera, carrito ni analítica; `noindex`; fuera de sitemap, robots y Pagefind |
| Islas | `src/islands/admin/*` | Lista, precio inline, interruptor ocultar, editor de ficha (admin), confirmación de borrado, estado de publicación |
| Cliente HTTP | `src/services/admin/AdminApiClient.ts` | Único punto de `fetch`; sin lógica de negocio |
| Contrato del API | `src/domain/admin.ts` | Tipos compartidos por islas y Functions |
| Política de roles | `src/domain/adminPolicy.ts` | Pura; `applyProductPatch`/`applyPartPatch` solo tocan precio y `hidden` |
| Reglas de catálogo | `src/domain/catalogRules.ts` | Una variante por defecto, Premium ≥ Estándar, PEN, batería, referencias |
| Esquemas | `src/content/schemas.ts` | Los mismos zod del build (`content.config.ts`) |
| Functions | `functions/api/admin/*` | `_middleware.ts` (Access + rol), `me`, `catalog`, `products/[slug]`, `repuestos/[slug]`, `deploy`; `_lib/` (JWT, GitHub, handlers) |
| Visibilidad | `src/domain/catalog.ts` → `visibleOnly` | Aplicada en `all()` de `src/data/json.ts` (y del ejemplo Supabase) |
| Cabeceras | `public/_headers` (`/admin`, `/api/admin/*`) | CSP propia (`connect-src 'self'`), `no-store`, `X-Robots-Tag: noindex` |

### API

| Método y ruta | Quién | Cuerpo | Respuesta |
|---|---|---|---|
| `GET /api/admin/me` | ambos | — | `AdminUser` (email, rol, listas, rama, modo local) |
| `GET /api/admin/catalog` | ambos | — | productos y repuestos con `sha` y ruta (incluye ocultos) |
| `PATCH /api/admin/products/:slug` | ambos | `{ sha, prices?: {variantId: céntimos}, hidden?, reason? }` | ficha actualizada + commit |
| `PATCH /api/admin/repuestos/:slug` | ambos | `{ sha, price?, hidden?, reason? }` | ídem |
| `PUT /api/admin/products/:slug` · `/repuestos/:slug` | admin | `{ sha?, data, reason? }` (sin `sha` = crear) | ficha + commit |
| `DELETE …/:slug` | admin | `{ sha, reason? }` | commit; 409 si otra ficha lo referencia |
| `GET /api/admin/deploy` | ambos | — | estado del último build de Pages o `available: false` |

Errores en JSON `{ code, error, details? }`: 401 sin identidad, 403 fuera de rol, 404, 409 conflicto de `sha` o referencias, 422 validación (lista de errores legibles), 502 fallo de GitHub.

### Flujo de un cambio de precio

1. Wiliam entra en `https://<dominio>/admin`; Access le pide el email y un código de un solo uso.
2. El panel carga `me` y `catalog`. Cambia el precio Estándar a 1,250 y pulsa Guardar.
3. `PATCH /api/admin/products/royal-tiger` con `{ sha, prices: { estandar: 125000 } }`.
4. La Function comprueba el JWT, resuelve `editor`, lee el JSON actual de GitHub, compara el `sha`, aplica el patch (rechaza cualquier otra clave), valida (Premium ≥ Estándar) y hace el commit `chore(catalog): actualizar royal-tiger por wiliam@…`.
5. Pages detecta el push y reconstruye. El panel muestra "Publicando… ~3 min" (o el estado real si la API de Pages está configurada).

### Seguridad

- Access es la puerta: sin JWT válido no hay respuesta útil (401). El rol se decide en el servidor con `ADMIN_EMAILS`/`EDITOR_EMAILS`; la interfaz solo oculta lo que el rol no puede hacer.
- El token de GitHub es *fine-grained*, limitado al repositorio y al permiso *Contents*; vive en las variables de Pages (secreto), nunca en `src/` ni en `PUBLIC_*`.
- Todo lo que se escribe pasa por los esquemas del build: un JSON inválido no llega al repo (y si llegara, CI y el build lo detendrían).
- Auditoría = historial de git: cada commit lleva autor (email), acción, slug, cambios y motivo.
- El modo local (`ADMIN_LOCAL_USER`) solo actúa en `localhost`; no se define en Pages.

### Límites

- Cada guardado es un commit y un build (2–3 min). Adecuado para < 20 cambios por semana.
- No sube imágenes: las fotos siguen por git ([23-catalog-editing](./23-catalog-editing.md) §5).
- Si dos personas editan la misma ficha, la segunda recibe 409 y debe recargar.
- Requiere el despliegue en Cloudflare Pages (fase 16) con Access configurado; hasta entonces solo funciona en modo local.
- **Tamaño del catálogo:** `GET /api/admin/catalog` (y `DELETE`, que comprueba referencias) lee cada JSON con una subpetición a GitHub: 2 + N llamadas. El plan gratuito de Workers/Pages permite 50 subpeticiones por petición, así que el panel soporta hasta **~45 fichas** (hoy 31). Al acercarse, cambiar la lectura a la Git Trees/Data API (un árbol + blobs) o cachear el catálogo; está anotado en el roadmap.
- Un JSON corrupto en el repo hace fallar la carga completa del catálogo (502 con el fichero señalado): se corrige por git.
- Cuerpos limitados a 256 KB, slugs a 80 caracteres, motivo del commit a 300 caracteres.

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
| 2 | Estado real del build desde la API de Pages; subida de imágenes por el panel | Opcional |
| 3 | Supabase (esquema, RLS, `SupabaseProductRepository`, módulos de §3) | Solo si > 40 productos o > 20 cambios/semana, o entra ventas |
| 4 | Solicitudes de pedido, clientes, WhatsApp Business API | Tras la fase 3 |
