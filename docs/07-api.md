# 07 — API y contratos de datos

Dos contratos: el actual (datos estáticos en build, content collections) y el futuro (API REST sobre Supabase). Ambos producen los mismos tipos de `src/domain/`; el frontend depende únicamente de las interfaces de repositorio de [05-backend](./05-backend.md). Esquema relacional en [06-database](./06-database.md).

## 1. Principio de desacoplamiento

- Las páginas y las islas importan `ProductRepository`, `CategoryRepository`, `AccessoryRepository`, `BlogRepository`, `FaqRepository`; nunca `astro:content` ni `@supabase/supabase-js`.
- Cambiar de fuente de datos es cambiar `PUBLIC_DATA_SOURCE` y la implementación en `src/data/`; ningún componente se modifica.
- Los DTOs que llegan a las islas son subconjuntos serializables de las entidades de dominio (`ProductDTO`, `CartItemDTO`).

## 2. Contrato actual: content collections

### 2.1 Rutas de ficheros

| Colección | Ruta | Formato | Nombre de fichero |
|---|---|---|---|
| `products` | `src/content/products/*.json` | JSON | `<slug>.json` |
| `categories` | `src/content/categories/*.json` | JSON | `<slug>.json` |
| `brands` | `src/content/brands/*.json` | JSON | `<slug>.json` |
| `accessories` | `src/content/accessories/*.json` | JSON | `<slug>.json` |
| `blog` | `src/content/blog/*.md` | Markdown + frontmatter | `<yyyy-mm-dd>-<slug>.md` |
| `faqs` | `src/content/faqs/*.json` | JSON | `<categoria>.json` (array de FAQs) |

El `slug` del fichero debe coincidir con el campo `slug`; el build falla en caso contrario (`src/content.config.ts`).

### 2.2 `products`

| Campo | Tipo | Oblig. | Notas |
|---|---|---|---|
| `id` | string | Sí | Igual a `slug` en MVP |
| `slug` | string kebab-case | Sí | Único |
| `name` | string | Sí | |
| `brandId` | string | Sí | Referencia a `brands.slug` |
| `categoryId` | string | Sí | Referencia a `categories.slug` |
| `status` | `draft` \| `published` \| `archived` | Sí | Solo `published` genera página |
| `summary` | string ≤ 200 | Sí | Tarjeta y meta description por defecto |
| `description` | string Markdown | No | |
| `licence` | `none` \| `AM` \| `A1` \| `A2` \| `A` \| `B` | Sí | Carnet mínimo |
| `priceFromCents` | integer | No | Si existe, debe coincidir con el mínimo de variantes |
| `currency` | `EUR` | Sí | |
| `heroImage` | string | Sí | Relativa a `src/assets/products/` |
| `gallery` | string[] | No | Máx. 8 |
| `variants` | Variant[] | Sí (≥ 1) | Ver tabla |
| `colors` | Color[] | Sí (≥ 1) | Ver tabla |
| `specs` | objeto | Sí | Claves conocidas: `motorPowerW`, `motorPeakW`, `weightKg`, `maxLoadKg`, `brakes`, `wheels`, `removableBattery`, `warrantyMonths` |
| `useCases` | enum[] | Sí | `ciudad`, `interurbano`, `reparto`, `carga`, `ocio`, `trabajo` |
| `compatibleAccessoryIds` | string[] | No | Referencias a `accessories.slug` |
| `seo` | `{ title?, description? }` | No | |
| `publishedAt` | fecha ISO | Sí si `published` | |

Variant: `id` (string, único en el producto), `name`, `priceCents` (integer > 0), `batteryId?`, `rangeKm?`, `topSpeedKmh?`, `chargeHours?`, `stock` (`in_stock` \| `preorder` \| `out_of_stock`).
Color: `id`, `name`, `hex` (`#RRGGBB`), `image?`.

### 2.3 `categories`, `brands`, `accessories`

| Colección | Campos obligatorios | Opcionales |
|---|---|---|
| `categories` | `slug`, `name`, `sortOrder` | `description`, `seo.title`, `seo.description`, `heroImage` |
| `brands` | `slug`, `name` | `logo`, `website` |
| `accessories` | `slug`, `name`, `status`, `priceCents`, `kind`, `image` | `summary`, `description`, `compatibleProductIds` |

### 2.4 `blog` (frontmatter) y `faqs`

| Colección | Campo | Tipo | Oblig. |
|---|---|---|---|
| `blog` | `title` | string | Sí |
| `blog` | `slug` | string | Sí |
| `blog` | `excerpt` | string ≤ 160 | Sí |
| `blog` | `cover` | string | Sí |
| `blog` | `publishedAt` | fecha ISO | Sí |
| `blog` | `tags` | string[] | No |
| `blog` | `author` | string | No (por defecto `Voltia`) |
| `blog` | `draft` | boolean | No |
| `faqs` | `question` | string | Sí |
| `faqs` | `answer` | string Markdown | Sí |
| `faqs` | `category` | string | Sí |
| `faqs` | `productId` | string | No |
| `faqs` | `sortOrder` | integer | No |

## 3. API REST futura

Base: `https://<proyecto>.supabase.co/functions/v1` para Edge Functions y PostgREST para lecturas. El frontend la consume desde `SupabaseProductRepository` (build) y desde islas (escrituras). Versionado por prefijo de ruta `/api/v1/...` cuando exista gateway propio; hasta entonces, versionado por cabecera `Accept-Version: 1`.

### 3.1 Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/products` | anon | Lista paginada de productos publicados. Filtros: `category`, `licence`, `useCase`, `priceMax`, `sort` |
| GET | `/api/products/:slug` | anon | Producto con variantes, colores y accesorios compatibles |
| GET | `/api/categories` | anon | Categorías ordenadas por `sortOrder` con `productCount` |
| GET | `/api/accessories` | anon | Accesorios publicados; filtro `compatibleWith=<slug>` |
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
    { "slug": "odin-1-0", "name": "ODIN 1.0", "categorySlug": "motos-electricas-urbanas",
      "priceFromCents": 449900, "currency": "EUR", "licence": "A1",
      "heroImage": "https://.../products/odin-1-0/hero.jpg", "useCases": ["ciudad", "interurbano"] }
  ],
  "page": { "cursor": "eyJpZCI6Ii4uLiJ9", "nextCursor": null, "limit": 24, "total": 37 }
}
```

`POST /api/order-requests` — request:

```json
{
  "customer": { "name": "Laura Pérez", "phone": "+34 600 000 000", "email": "laura@example.com", "city": "Valencia", "consent": true },
  "items": [
    { "productSlug": "odin-1-0", "variantCode": "72v-50ah", "colorCode": "negro", "quantity": 1 },
    { "accessorySlug": "casco-voltia", "quantity": 1 }
  ],
  "notes": "¿Tenéis financiación?",
  "sourcePath": "/carrito"
}
```

Response `201`:

```json
{ "data": { "id": "0d2c…", "publicRef": "7F3A9C1E", "status": "new", "totalCents": 579800,
            "currency": "EUR", "whatsappUrl": "https://wa.me/34600000000?text=Hola%20%F0%9F%91%8B…" } }
```

El servidor recalcula `totalCents` con precios de base de datos; ignora cualquier precio enviado por el cliente.

`POST /api/whatsapp-requests` — request `{ "source": "cart", "productSlug": "odin-1-0", "orderRequestId": null }` → `202` sin cuerpo.

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
| `ProductRepository.listPublished` | `getCollection('products')` filtrado por `status` | `GET /api/products` |
| `ProductRepository.getBySlug` | `getEntry('products', slug)` | `GET /api/products/:slug` |
| `CategoryRepository.list` | `getCollection('categories')` | `GET /api/categories` |
| `AccessoryRepository.listCompatible` | filtro en memoria por `compatibleAccessoryIds` | `GET /api/accessories?compatibleWith=` |
| `RecommendationService.recommend` | función pura en cliente | función pura en cliente (opcional `POST /api/finder/recommend`) |
| Envío de solicitud | enlace `wa.me` | `POST /api/order-requests` + enlace `wa.me` devuelto |

Los tests de contrato en `src/data/*.contract.test.ts` ejecutan la misma batería contra ambas implementaciones para garantizar que el frontend no note el cambio.
