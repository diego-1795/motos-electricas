# 17 — Panel de administración

En el MVP no existe panel: el catálogo, el blog y las FAQ se editan como ficheros JSON en el repositorio y se publican con una PR (git como CMS). Este documento fija ese procedimiento y el diseño del panel futuro sobre Supabase, de modo que la capa de datos ([05-backend](./05-backend.md), [06-database](./06-database.md)) no necesite rehacerse al llegar ese momento.

## 1. MVP: git como CMS

### Dónde vive cada cosa

| Contenido | Ruta | Colección Astro | Repositorio (`src/data/`) |
|---|---|---|---|
| Productos | `src/content/products/<slug>.json` | `products` | `JsonProductRepository` |
| Repuestos | `src/content/repuestos/<slug>.json` | `repuestos` | `JsonPartRepository` |
| Categorías | `src/content/categories/<slug>.json` | `categories` | `JsonCategoryRepository` |
| Marcas | `src/config/site.ts` (RAIDEN; sin colección en MVP) | — | — |
| Blog | `src/content/blog/<slug>.md` | `blog` | `JsonBlogRepository` |
| FAQ | `src/content/faqs/<slug>.json` | `faqs` | `JsonFaqRepository` |
| Imágenes | `src/assets/products/<slug>/` | — | Referenciadas por ruta relativa |

### Cómo editar

1. Rama `content/<tema>` desde `main` ([14-devops](./14-devops.md)).
2. Copiar un JSON existente como plantilla; respetar los campos obligatorios de [15-content-strategy](./15-content-strategy.md).
3. `npm run dev` para ver el resultado; `npm run build` valida.
4. PR con la plantilla; revisión de Content y SEO; squash merge.

### Validación en build

- Cada colección se define en `src/content.config.ts` con un esquema escrito a mano (validadores de `src/domain/validation.ts`, sin zod): tipos, rangos (`priceFrom > 0`, `capacityAh` entre 5 y 200), enumeraciones (`licence`, `status`) y referencias cruzadas (`brand` y `category` deben existir; `availableFor` de un color debe apuntar a variantes declaradas).
- Un JSON inválido detiene `astro build` con ruta y campo afectado. No se despliega nada roto.
- Test de Vitest `content.spec.ts` recorre todas las colecciones y comprueba unicidad de `slug`, existencia de imágenes y longitud de `summary`.
- Los productos con `status: "draft"` se excluyen de `getStaticPaths`, del sitemap y de los listados, pero se construyen en preview bajo `/borrador/<slug>` para revisión.

### Límites conocidos

- Requiere saber usar git o el editor web de GitHub. Ventas no edita: envía datos a Content.
- No hay historial de solicitudes de pedido ni clientes: los mensajes viven en WhatsApp.
- Cada cambio supone un build (2–3 min). Aceptable para < 20 altas por semana.

## 2. Diseño futuro

### Base: Supabase Auth + RLS

- Autenticación con Supabase Auth (correo + enlace mágico; sin contraseñas en MVP del panel). Solo cuentas invitadas desde la tabla `admin_users`.
- Autorización en base de datos con Row Level Security: cada tabla tiene políticas por rol leídas del JWT (`auth.jwt() ->> 'role'`), de modo que el panel no puede hacer más de lo que la base de datos permite, sea cual sea el cliente que lo consuma.
- El frontend público sigue siendo estático y lee mediante `SupabaseProductRepository` con la clave `anon` y políticas de solo lectura sobre filas `status = 'published'`.
- Los ficheros se almacenan en Supabase Storage (bucket `products`, público en lectura); el build descarga y optimiza con sharp igual que hoy con `src/assets/`.

### Dónde corre el panel

| Criterio | A. `/admin` en el mismo proyecto con adapter SSR | B. Aplicación separada (`admin.raiden.pe`) |
|---|---|---|
| Cambios en `astro.config` | `output: 'static'` + `prerender = false` solo en `/admin/*`, adapter `@astrojs/cloudflare`, `@astrojs/node` o `@astrojs/vercel` | Ninguno en el sitio público |
| Riesgo para el sitio público | Medio: comparte dependencias, CSP y presupuesto de bundle | Nulo |
| Coste | S/ 0 en Pages Functions / Workers Free | S/ 0 en Pages (SPA estática con Preact) o Vercel Hobby |
| Reutilización de `src/domain` y `src/services` | Directa | Mediante workspace npm (`packages/domain`) |
| Seguridad | CSP más permisiva en `/admin`; misma superficie de dominio | Dominio y CSP propios; cookies de sesión aisladas |
| Portabilidad | Depende del adapter elegido | SPA + Supabase: sin dependencia de hosting |
| Esfuerzo inicial | Menor | Mayor (monorepo, segundo deploy) |

**Decisión**: opción B, aplicación separada como SPA Preact + Supabase JS, en un workspace del mismo repositorio (`apps/admin`), con `packages/domain` compartido. Mantiene el sitio público 100 % estático y agnóstico, y evita introducir un adapter por una única ruta. La opción A queda documentada como alternativa si el equipo prefiere un solo despliegue.

### Módulos

| Módulo | Tabla(s) | Operaciones | Roles con escritura |
|---|---|---|---|
| Productos | `products` | CRUD, duplicar, cambiar estado, ordenar | admin, editor |
| Variantes | `product_variants` | CRUD anidado en producto, `tier` (Estándar/Premium), precio, stock orientativo | admin, editor |
| Colores | `product_colors` | CRUD, hex, imágenes por color, restricción por variante | admin, editor |
| Repuestos | `parts`, `product_parts` | CRUD, unidad (`UND`/`PAR`), código, compatibilidad con modelos | admin, editor |
| Categorías | `categories` | CRUD, orden, texto SEO de cabecera | admin |
| Marcas | `brands` | CRUD, logotipo | admin |
| Solicitudes de pedido | `order_requests`, `whatsapp_requests` | Listado, estado (`nueva`, `contactada`, `presupuestada`, `ganada`, `perdida`), notas internas | admin, ventas |
| Clientes | `customers` | Ficha mínima (nombre, teléfono, provincia), historial de solicitudes | admin, ventas |
| Blog | `blog_posts` | CRUD con editor Markdown, programación de publicación | admin, editor |
| FAQ | `faqs` | CRUD, orden, categoría | admin, editor |
| Reseñas | `reviews` | Moderación (aprobar/rechazar), respuesta | admin, ventas |
| Configuración | `site_settings` | Número de WhatsApp, horario, textos de aviso | admin |

Al publicar desde el panel, un webhook de Supabase (Database Webhooks) dispara el deploy hook del hosting para regenerar el sitio estático. El sitio público no consulta Supabase en tiempo de ejecución.

### Roles

| Rol | Alcance |
|---|---|
| `admin` | Todo; gestiona usuarios y configuración |
| `editor` | Catálogo, blog, FAQ; no ve clientes ni solicitudes |
| `ventas` | Solicitudes, clientes, reseñas; solo lectura del catálogo |

Los roles se guardan en `admin_users.role` y se copian al JWT mediante un hook de Supabase Auth (`custom_access_token_hook`). Las políticas RLS son la única autoridad; la interfaz solo oculta lo que el usuario no puede hacer.

### Flujos clave

**Publicar un producto**
1. Editor crea el producto en estado `draft`, rellena specs, variantes, colores y sube imágenes al bucket.
2. El formulario ejecuta los mismos validadores de `packages/domain` que usa el build.
3. Editor pulsa "Solicitar publicación"; admin (o el propio editor si tiene permiso) cambia a `published`.
4. Trigger de base de datos registra en `audit_log` y lanza el webhook de deploy.
5. A los 2–3 min el producto está en producción; el panel muestra el estado del último build.

**Gestionar una solicitud de pedido**
1. La solicitud entra por Edge Function (formulario del carrito) o se crea manualmente por ventas a partir de un mensaje de WhatsApp.
2. Ventas la abre, ve ítems y total estimado, asocia o crea el cliente y cambia el estado a `contactada`.
3. Cada cambio de estado guarda fecha y usuario; las notas internas no se muestran nunca al cliente.
4. Al cerrar como `ganada` se registra el importe final para medir conversión ([16-whatsapp-commerce](./16-whatsapp-commerce.md)).

### Auditoría

- Tabla `audit_log` (`id`, `table_name`, `row_id`, `action`, `old_data`, `new_data`, `user_id`, `created_at`) alimentada por triggers en todas las tablas de escritura.
- Solo lectura desde el panel para `admin`; retención de 2 años.
- Los cambios de `site_settings` (número de WhatsApp) notifican por correo al Tech Lead mediante Edge Function.

### Seguridad

- Claves: el panel usa únicamente la clave `anon` con sesión de usuario; `service_role` solo en Edge Functions ([10-security](./10-security.md)).
- MFA (TOTP) obligatorio para `admin`; recomendado para el resto.
- Sesiones de 8 horas con renovación; cierre automático por inactividad de 30 min en el cliente.
- CSP propia del panel con `connect-src` limitado al proyecto de Supabase.
- Subida de imágenes: tipos permitidos `image/jpeg`, `image/png`, `image/webp`; tamaño máximo 5 MB; validación de dimensiones en cliente y política de Storage por rol.
- Rate limiting en Edge Functions (solicitudes de pedido) por IP y por cliente.
- Copia de seguridad: exportación semanal de la base de datos a JSON en el repositorio (`content/backup/`), que además mantiene viva la vía git como CMS en caso de abandono de Supabase ([20-migration](./20-migration.md)).

## 3. Fases de implementación

| Fase | Alcance | Requisito previo | Estimación |
|---|---|---|---|
| 0 | Git como CMS (este MVP) | — | Incluida en el MVP |
| 1 | Esquema Postgres, RLS y `SupabaseProductRepository` leyendo en build; JSON sigue siendo fuente de verdad vía script de importación | [06-database](./06-database.md) aprobado | 1 semana |
| 2 | `apps/admin` con Auth, catálogo (productos, variantes, colores, repuestos, categorías, marcas) y deploy hook | Fase 1 | 2–3 semanas |
| 3 | Solicitudes de pedido y clientes; Edge Function desde el carrito | Fase 2 | 1–2 semanas |
| 4 | Blog, FAQ, reseñas, configuración y auditoría completa | Fase 2 | 1–2 semanas |
| 5 | Integración WhatsApp Business API y vista de conversaciones | Volumen que lo justifique | A definir |

Criterio de arranque de la fase 1: más de 40 productos publicados o más de 20 altas/modificaciones por semana, o incorporación de una persona de ventas que necesite historial de solicitudes. Hasta entonces, git como CMS cumple con coste cero.
