# 07 — API y contratos de datos

Dos contratos: el actual (datos estáticos en build, content collections) y el futuro (API REST sobre Supabase). Ambos producen los mismos tipos de `src/domain/`; el frontend depende únicamente de las interfaces de repositorio de [05-backend](./05-backend.md). Esquema relacional en [06-database](./06-database.md).

## 1. Principio de desacoplamiento

- Las páginas y las islas importan `ProductRepository`, `PartRepository`, `CategoryRepository`, `BlogRepository`, `FaqRepository`; nunca `astro:content` ni `@supabase/supabase-js`.
- Cambiar de fuente de datos es cambiar `PUBLIC_DATA_SOURCE` y la implementación en `src/data/`; ningún componente se modifica.
- Los DTOs que llegan a las islas son subconjuntos serializables de las entidades de dominio (`ProductDTO`, `CartItemDTO`).

## 2. Contrato actual: content collections

### 2.1 Rutas de ficheros

| Colección | Ruta | Formato | Nombre de fichero |
|---|---|---|---|
| `products` | `src/content/products/*.json` | JSON | `<slug>.json` (4 modelos) |
| `repuestos` | `src/content/repuestos/*.json` | JSON | `<slug>.json` (26 repuestos) |
| `categories` | `src/content/categories/*.json` | JSON | `<slug>.json` (`bicimotos`, `trimotos`, `repuestos`, `promociones`) |
| `blog` | `src/content/blog/*.md` | Markdown + frontmatter | `<slug>.md` |
| `faqs` | `src/content/faqs/*.json` | JSON | `<grupo>.json` (`group`, `order`, `items[]`) |

Los esquemas zod viven en `src/content.config.ts` y reflejan `src/domain/types.ts`; un JSON inválido rompe el build indicando el campo.

### 2.2 `products`

| Campo | Tipo | Oblig. | Notas |
|---|---|---|---|
| `id` | string | Sí | Identificador estable (p. ej. `rd-golden-eagle`) |
| `slug` | string kebab-case | Sí | Único; forma la URL `/<category>/<slug>` |
| `name`, `subtitle`, `claim`, `description` | string | Sí | Textos comerciales |
| `category` | `bicimotos` \| `trimotos` \| `promociones` | Sí | `promociones` = edición EG Motors, fuera del catálogo RAIDEN (ADR-017); `repuestos` es la categoría de la colección `repuestos` |
| `brand` | string | Sí | `Raiden` |
| `images` / `heroImage` | `ImageRef` (`src` `~/assets/...`, `alt`, `width`, `height`) | `images` ≥ 1 | Galería y hero apaisado de portada |
| `specs` | objeto | Sí | `rangeKm`, `topSpeedKmh`, `powerW`, `battery`, `maxLoadKg`, `seats`, `license` (`sin-licencia` \| `B-I` \| `B-IIa` \| `B-IIb` \| `B-IIc`), `brakes`, `suspension`, `warrantyMonths`, `features[]`…; peso y dimensiones opcionales |
| `variants` | Variant[] | Sí (≥ 1) | Ver abajo |
| `colors` | Color[] | Sí | `id`, `name`, `hex`, `image?`, `priceDelta?` |
| `accessories` | string[] | Sí | Slugs de **repuestos** compatibles (nombre de campo histórico) |
| `related` | string[] | Sí | Slugs de modelos similares |
| `useCases` | enum[] | Sí | `ciudad`, `trabajo`, `reparto`, `ocio`, `trayectos-largos`, `dos-personas`, `carga` |
| `highlights`, `technology`, `faqs`, `reviews?` | arrays | Sí / No | Contenido de ficha. `reviews` solo con reseñas reales del modelo (hoy vacío; los testimonios de portada salen de la colección `testimonials`) |
| `featured`, `isHero?`, `isNew?`, `publishedAt` | number / boolean / fecha | `featured` y `publishedAt` sí | Orden en "Recomendados" y portada |
| `seo` | `{ title?, description? }` | No | |

Variant: `id`, `name`, `tier` (`estandar` \| `premium`), `description?`, `price` (`{ amount: céntimos, currency: "PEN" }`), `specsOverride?` (potencia, batería, autonomía de la versión), `availability` (`en-stock` \| `bajo-pedido` \| `proximamente` \| `agotado`), `sku?`, `isDefault?`.

### 2.3 `repuestos` y `categories`

| Colección | Campos obligatorios | Opcionales |
|---|---|---|
| `repuestos` | `id`, `slug`, `name`, `description`, `price`, `availability`, `kind` (`bateria`, `motor`, `controlador`, `cargador`, `iluminacion`, `frenos`, `cables`, `mandos`, `seguridad`, `llantas`, `otro`), `compatibleWith` (slugs de modelos; vacío = universal) | `image`, `unit` (`UND` \| `PAR`, por defecto `UND`), `code` (p. ej. `RP-002`) |
| `categories` | `slug`, `name`, `title`, `description`, `tagline`, `order` | `image` |

### 2.4 `blog` (frontmatter) y `faqs`

| Colección | Campo | Tipo | Oblig. |
|---|---|---|---|
| `blog` | `title` | string | Sí |
| `blog` | `description` | string | Sí |
| `blog` | `category` | `guias` \| `comparativas` \| `autonomia` \| `baterias` \| `mantenimiento` \| `legislacion` \| `movilidad` \| `compra` | Sí |
| `blog` | `publishedAt` / `updatedAt` | fecha ISO | Sí / No |
| `blog` | `author` | string | Sí |
| `blog` | `image` | `ImageRef` | No |
| `blog` | `relatedProducts` | string[] (slugs) | No |
| `faqs` | `group`, `order` | string, number | Sí |
| `faqs` | `items[]` (`question`, `answer`) | array | Sí |

`readingMinutes` **no** va en el frontmatter: el repositorio lo calcula del cuerpo con `src/domain/reading.ts` (palabras legibles / 200 ppm, mínimo 1), así nunca queda desactualizado (ADR-016).

### 2.5 `testimonials`

Reseñas públicas reales del negocio para "Comunidad RAIDEN" (portada). Un archivo JSON por origen en `src/content/testimonials/` (hoy `google-maps.json`): `source` (p. ej. `google`), `label`, `note?` e `items[]` con `author`, `rating` (1–5), `text`, `date`. Se copian tal cual de la fuente, sin inventar ninguna; la portada destaca las 3 mejor valoradas con más texto (`pickTestimonials`, ADR-016).

## 3. API REST futura

Base: `https://<proyecto>.supabase.co/functions/v1` para Edge Functions y PostgREST para lecturas. El frontend la consume desde `SupabaseProductRepository` (build) y desde islas (escrituras). Versionado por prefijo de ruta `/api/v1/...` cuando exista gateway propio; hasta entonces, versionado por cabecera `Accept-Version: 1`.

### 3.1 Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/products` | anon | Lista paginada de productos publicados. Filtros: `category`, `license`, `useCase`, `priceMax`, `sort` |
| GET | `/api/products/:slug` | anon | Producto con variantes (`tier`), colores y repuestos compatibles |
| GET | `/api/categories` | anon | Categorías ordenadas por `order` con `productCount` |
| GET | `/api/parts` | anon | Repuestos publicados; filtro `compatibleWith=<slug>` |
| POST | `/api/order-requests` | anon + rate limit | Crea solicitud de pedido con cliente e ítems |
| POST | `/api/whatsapp-requests` | anon + rate limit | Registra clic en enlace WhatsApp |
| POST | `/api/finder/recommend` | anon | Devuelve recomendaciones del finder (mismo scoring que el cliente) |
| GET/POST | `/api/admin/products` | admin | Listado completo (incluye `draft`) / creación |
| PUT/DELETE | `/api/admin/products/:id` | admin | Edición / archivado (nunca borrado físico) |
| GET/PATCH | `/api/admin/order-requests` ; `/:id` | admin | Bandeja y cambio de estado |
| GET | `/api/admin/whatsapp-requests` | admin | Listado de clics |

### 3.2 Formatos

Respuesta de lista:

```json
{
  "data": [
    { "slug": "golden-eagle", "name": "Golden Eagle", "categorySlug": "bicimotos",
      "priceFromCents": 120000, "currency": "PEN", "license": "sin-licencia",
      "heroImage": "https://.../products/golden-eagle/hero.jpg", "useCases": ["ciudad", "trabajo", "ocio"] }
  ],
  "page": { "cursor": "eyJpZCI6Ii4uLiJ9", "nextCursor": null, "limit": 24, "total": 4 }
}
```

`POST /api/order-requests` — request:

```json
{
  "customer": { "name": "Laura Pérez", "phone": "+51 987 654 321", "email": "laura@example.com", "city": "Callao", "consent": true },
  "items": [
    { "productSlug": "golden-eagle", "variantCode": "premium", "colorCode": "negro", "quantity": 1 },
    { "partSlug": "bateria-chilwee-48v-20ah", "quantity": 1 }
  ],
  "notes": "¿Tienen financiación?",
  "sourcePath": "/carrito"
}
```

Response `201`:

```json
{ "data": { "id": "0d2c…", "publicRef": "7F3A9C1E", "status": "new", "totalCents": 165000,
            "currency": "PEN", "whatsappUrl": "https://wa.me/51989853431?text=Hola%20%F0%9F%91%8B…" } }
```

El servidor recalcula `totalCents` con precios de base de datos; ignora cualquier precio enviado por el cliente.

`POST /api/whatsapp-requests` — request `{ "source": "cart", "productSlug": "golden-eagle", "orderRequestId": null }` → `202` sin cuerpo.

`POST /api/finder/recommend` — request: el objeto `FinderAnswers` ([05-backend](./05-backend.md) §4). Response: `{ "data": [{ "productSlug", "variantCode", "score": 87, "reasons": ["…"] }] }` (máx. 3).

### 3.3 Errores

```json
{ "error": { "code": "VALIDATION", "message": "El teléfono no es válido", "field": "customer.phone", "retryable": false } }
```

| HTTP | `code` |
|---|---|
| 400 | `VALIDATION` |
| 401 / 403 | `UNAUTHORIZED` / `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 429 | `RATE_LIMITED` (cabecera `Retry-After`) |
| 503 | `UNAVAILABLE` |
| 500 | `INTERNAL` |

### 3.4 Paginación, caché y versionado

- Cursor opaco (`cursor`, `limit` ≤ 50, por defecto 24); orden estable por `(sort_key, id)`.
- Lecturas públicas con `Cache-Control: public, max-age=300, stale-while-revalidate=3600` y `ETag`.
- Cambios incompatibles → nueva versión (`Accept-Version: 2` o `/api/v2`); la anterior se mantiene 6 meses. Añadir campos nunca rompe versión.

### 3.5 Autenticación, rate limiting y CORS

| Aspecto | Regla |
|---|---|
| Público | Clave `anon` de Supabase en cabecera `apikey`; RLS limita el alcance |
| Admin | `Authorization: Bearer <JWT>` de Supabase Auth con `app_metadata.app_role = 'admin'`; sesión 1 h, refresco automático |
| Rate limiting | `order-requests`: 10/h/IP; `whatsapp-requests`: 60/h/IP; `finder/recommend`: 120/h/IP. IP hasheada con sal diaria; nunca se guarda en claro |
| CORS | `Access-Control-Allow-Origin` restringido a `PUBLIC_SITE_URL` y previews `*.pages.dev`; métodos `GET, POST, PATCH`; sin credenciales |
| Cuerpo | Máx. 16 KB en POST; JSON estricto; rechazo de campos desconocidos |

## 4. Mapa contrato → repositorio

| Interfaz | Fuente actual | Fuente futura |
|---|---|---|
| `ProductRepository.all` / `byCategory` | `getCollection('products')` | `GET /api/products` |
| `ProductRepository.bySlug` | `getEntry('products', slug)` | `GET /api/products/:slug` |
| `CategoryRepository.all` | `getCollection('categories')` | `GET /api/categories` |
| `PartRepository.compatibleWith` | filtro en memoria por `compatibleWith` de cada repuesto (y `accessories` del producto) | `GET /api/parts?compatibleWith=` |
| `RecommendationService.recommend` | función pura en cliente | función pura en cliente (opcional `POST /api/finder/recommend`) |
| Envío de solicitud | enlace `wa.me` | `POST /api/order-requests` + enlace `wa.me` devuelto |

Los tests de contrato en `src/data/*.contract.test.ts` ejecutan la misma batería contra ambas implementaciones para garantizar que el frontend no note el cambio.
