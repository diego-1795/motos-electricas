# 05 — Backend

Define la capa de servicios y datos de Voltia. En MVP no existe backend propio; este documento fija las interfaces para que el frontend no dependa de ningún proveedor y describe el backend futuro sobre Supabase. Relacionado: [06-database](./06-database.md), [07-api](./07-api.md), [10-security](./10-security.md), [20-migration](./20-migration.md).

## 1. Enfoque "sin backend" en MVP

| Necesidad | Solución MVP | Coste |
|---|---|---|
| Catálogo (productos, categorías, accesorios, marcas) | JSON en `src/content/*` leídos en build por content collections | 0 |
| Blog y FAQs | Markdown/JSON en `src/content/` | 0 |
| Edición de contenido | Git como CMS: PR → revisión → merge → despliegue automático en Cloudflare Pages | 0 |
| Carrito | localStorage (`voltia:cart:v1`) | 0 |
| Solicitud de pedido | Mensaje de WhatsApp generado en cliente (`wa.me`) | 0 |
| Analítica | Cloudflare Web Analytics (beacon sin cookies), opcional | 0 |
| Formularios de contacto | `mailto:` o enlace WhatsApp; sin servidor | 0 |

Consecuencias: no hay base de datos, no hay secretos, no hay superficie de ataque servidor. El build es la única "ejecución" y ocurre en CI. Todo dato mutable del usuario vive en su navegador.

## 2. Interfaces de servicios

Todas en `src/services/*.ts` (contratos) y `src/data/*.ts` (repositorios). Las implementaciones concretas viven en `src/data/json/`, `src/data/supabase/` y `src/services/adapters/`. El frontend importa solo la interfaz y recibe la implementación desde `src/services/container.ts`.

```ts
// src/data/product.repository.ts
export interface ProductRepository {
  listPublished(filter?: ProductFilter): Promise<Product[]>;
  getBySlug(slug: string): Promise<Product | null>;
  listByCategory(categoryId: string): Promise<Product[]>;
  listByIds(ids: readonly string[]): Promise<Product[]>;
}
export interface ProductFilter {
  categoryId?: string;
  licence?: Licence;
  priceMaxCents?: number;
  useCase?: UseCase;
}

// src/services/cart.service.ts
export interface CartService {
  get(): Cart;
  add(item: Omit<CartItem, 'quantity'>, quantity?: number): Cart;
  remove(key: string): Cart;
  setQuantity(key: string, quantity: number): Cart;
  clear(): Cart;
  total(): Money;
  subscribe(listener: (cart: Cart) => void): () => void;
}

// src/services/whatsapp-message-builder.ts
export interface WhatsAppMessageBuilder {
  build(req: OrderRequest): string;            // texto plano, sin codificar
  buildUrl(req: OrderRequest): string;          // https://wa.me/<num>?text=<encodeURIComponent(texto)>
}

// src/services/recommendation.service.ts
export interface RecommendationService {
  recommend(answers: FinderAnswers, candidates: readonly Product[]): FinderResult[];
  related(product: Product, candidates: readonly Product[], limit?: number): Product[];
}

// src/services/analytics.service.ts
export type AnalyticsEvent =
  | { name: 'page_view'; path: string }
  | { name: 'product_view'; productId: string }
  | { name: 'add_to_cart'; productId: string; variantId?: string; quantity: number }
  | { name: 'cart_open' }
  | { name: 'purchase_request'; itemCount: number; totalCents: number }
  | { name: 'whatsapp_click'; source: 'cart' | 'product' | 'contact' }
  | { name: 'compare_add'; productId: string }
  | { name: 'finder_complete'; topProductId: string };
export interface AnalyticsService {
  track(event: AnalyticsEvent): void;           // nunca lanza, nunca bloquea
}

// src/services/storage.service.ts
export interface StorageService {
  get<T>(key: string, validate: (v: unknown) => v is T): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

// src/services/cache.service.ts
export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  invalidate(prefix: string): Promise<void>;
}

// src/services/email.service.ts
export interface EmailService {
  send(msg: { to: string; subject: string; text: string; html?: string }): Promise<Result<void>>;
}
```

`Money` es `{ amountCents: number; currency: 'EUR' }`. `Result<T>` es `{ ok: true; value: T } | { ok: false; error: AppError }`.

## 3. Adaptadores por entorno

| Interfaz | MVP (SSG, Cloudflare Pages) | Desarrollo local | Futuro (Supabase) |
|---|---|---|---|
| `ProductRepository` | `JsonProductRepository` (content collections) | igual | `SupabaseProductRepository` (PostgREST) |
| `CartService` | `NanostoresCartService` sobre `cartStore` | igual | igual (carrito sigue en cliente) |
| `WhatsAppMessageBuilder` | `DefaultWhatsAppMessageBuilder` | igual | igual + registro en `whatsapp_requests` vía Edge Function |
| `RecommendationService` | `ScoringRecommendationService` (puro, en cliente) | igual | igual; opcional endpoint `/api/finder/recommend` |
| `AnalyticsService` | `NoopAnalytics` o `CloudflareBeaconAnalytics` | `ConsoleAnalytics` | `DataLayerAnalytics` |
| `StorageService` | `LocalStorageService` | igual | igual |
| `CacheService` | `NoopCache` (no hay runtime) | `MemoryCache` | `CloudflareKvCache` o `MemoryCache` en Edge Function |
| `EmailService` | `NoopEmail` | `ConsoleEmail` | `ResendEmail` desde Edge Function |

Selección en `src/services/container.ts` según `import.meta.env.MODE` y `PUBLIC_DATA_SOURCE` (`json` | `supabase`). Ningún componente instancia adaptadores.

## 4. Validadores manuales

Sin zod ni dependencias. Patrón: guardas de tipo (`is`) y funciones `parseX(input: unknown): Result<X>` en `src/domain/validation.ts`.

```ts
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
export function isIntIn(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}
export function isSlug(v: unknown): v is string {
  return typeof v === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 80;
}

export function parseFinderAnswers(input: unknown): Result<FinderAnswers> {
  if (!isRecord(input)) return fail('VALIDATION', 'Entrada no válida');
  const useCase = input.useCase;
  if (!isOneOf(useCase, USE_CASES)) return fail('VALIDATION', 'Uso no válido', 'useCase');
  if (!isIntIn(input.rangeKm, 20, 300)) return fail('VALIDATION', 'Autonomía fuera de rango', 'rangeKm');
  if (!isIntIn(input.budgetCents, 50_000, 2_000_000)) return fail('VALIDATION', 'Presupuesto fuera de rango', 'budgetCents');
  if (!isOneOf(input.licence, LICENCES)) return fail('VALIDATION', 'Carnet no válido', 'licence');
  if (!isIntIn(input.topSpeedKmh, 25, 150)) return fail('VALIDATION', 'Velocidad fuera de rango', 'topSpeedKmh');
  if (typeof input.needsCargo !== 'boolean') return fail('VALIDATION', 'Carga no válida', 'needsCargo');
  return ok({ useCase, rangeKm: input.rangeKm, budgetCents: input.budgetCents, licence: input.licence, topSpeedKmh: input.topSpeedKmh, needsCargo: input.needsCargo });
}
```

El mismo patrón se aplica a `parseCart` (al leer localStorage) y a `parseOrderRequestForm`. Los validadores se reutilizan sin cambios en las Edge Functions futuras.

## 5. Algoritmo de scoring del finder

`src/domain/finder.ts`, función pura `scoreProduct(answers, product): number` en [0, 100]. Se evalúa la mejor variante de cada producto y se ordena de mayor a menor; empates por `priceFromCents` ascendente.

| Criterio | Peso | Cálculo de la puntuación parcial (0–1) |
|---|---|---|
| Uso (`useCase`) | 25 | 1 si `product.useCases` incluye la respuesta; 0,4 si incluye un uso adyacente (ciudad ↔ interurbano); 0 en otro caso |
| Autonomía (`rangeKm`) | 20 | `min(variant.rangeKm / answers.rangeKm, 1)`; penalización 0,5 adicional si queda por debajo del 70 % |
| Presupuesto (`budgetCents`) | 20 | 1 si `priceCents <= budget`; decae linealmente hasta 0 en `budget * 1,25`; si supera, 0 |
| Velocidad (`topSpeedKmh`) | 15 | `min(variant.topSpeedKmh / answers.topSpeedKmh, 1)` |
| Carnet (`licence`) | 15 | 1 si el producto es conducible con el carnet indicado (AM ⊂ A1 ⊂ A2 ⊂ A ⊂ B+3 años para 125); 0 si no: criterio eliminatorio, el producto se excluye |
| Carga (`needsCargo`) | 5 | 1 si `needsCargo` y la categoría es `vehiculos-carga` o `specs.maxLoadKg >= 150`; 1 si no necesita carga; 0,3 si la necesita y no cumple |

`score = Σ(peso × parcial)`. Se devuelven los 3 primeros con `reasons: string[]` generadas a partir de los criterios con parcial ≥ 0,8 ("Autonomía de 140 km, por encima de los 100 km que necesitas"). Cobertura de tests en `src/domain/finder.test.ts` con tablas de casos.

## 6. Pricing

- Todos los precios en céntimos enteros (`priceCents`), IVA incluido (21 %). Nunca se almacena ni muestra base imponible en el frontend.
- `priceFromCents` de un producto = mínimo `priceCents` de sus variantes publicadas; se calcula en `JsonProductRepository`, no se escribe a mano en el JSON (si existe en el JSON, se valida que coincida).
- Los colores no alteran el precio en MVP; las variantes sí. Los accesorios tienen precio propio.
- `computeCartTotal(items)` = Σ `unitPriceCents × quantity`. Sin gastos de envío ni descuentos en MVP (el mensaje dice "Total estimado").
- Formato con `Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })` → `5.499 €`.

## 7. Backend futuro con Supabase

Se activa cuando el cliente necesite panel de administración, registro de solicitudes o stock en tiempo real. Ver esquema en [06-database](./06-database.md) y panel en [17-admin-panel](./17-admin-panel.md).

| Componente | Uso |
|---|---|
| Postgres + PostgREST | Lectura de catálogo publicado (anon) y CRUD de admin (JWT con rol `admin`) |
| Edge Functions (Deno) | `order-requests` (inserción validada + correo), `whatsapp-requests` (registro de clic), `finder-recommend` (opcional) |
| Auth | Email + magic link para admin; sin registro público |
| Storage | Imágenes de producto; el build sigue optimizando con sharp desde URL |
| Rate limiting | En Edge Function: contador por IP en tabla `rate_limits` o KV; 10 solicitudes/hora/IP en `order-requests`; 60/hora en `whatsapp-requests` |
| Roles | `anon` (lectura catálogo publicado, inserción limitada), `authenticated` sin privilegios, `admin` por claim `app_role` en JWT |

El frontend sigue siendo SSG. Las escrituras ocurren desde islas hacia Edge Functions con `fetch`; la lectura de catálogo en build usa `SupabaseProductRepository` con la clave `anon` (pública por diseño, protegida por RLS).

## 8. Contratos de error

```ts
export type AppErrorCode =
  | 'VALIDATION' | 'NOT_FOUND' | 'RATE_LIMITED' | 'UNAUTHORIZED'
  | 'FORBIDDEN' | 'CONFLICT' | 'UNAVAILABLE' | 'INTERNAL';

export interface AppError {
  code: AppErrorCode;
  message: string;       // en español, apta para mostrar al usuario
  field?: string;        // para VALIDATION
  retryable: boolean;
}
```

| Código | HTTP futuro | Cuándo | Comportamiento en UI |
|---|---|---|---|
| `VALIDATION` | 400 | Entrada inválida | Marcar campo, no enviar |
| `NOT_FOUND` | 404 | Slug inexistente | Página 404 |
| `RATE_LIMITED` | 429 | Límite por IP | Mensaje "Inténtalo en unos minutos"; ofrecer WhatsApp directo |
| `UNAUTHORIZED` / `FORBIDDEN` | 401 / 403 | Admin sin sesión / sin rol | Redirigir a login |
| `CONFLICT` | 409 | Slug duplicado en admin | Mensaje en formulario |
| `UNAVAILABLE` | 503 | Supabase caído | Degradar a flujo WhatsApp puro |
| `INTERNAL` | 500 | Error no controlado | Mensaje genérico; registrar |

Los servicios nunca lanzan excepciones hacia las islas: devuelven `Result<T>`. El flujo de WhatsApp no depende de ningún servicio remoto, por lo que sigue funcionando ante cualquier error de backend.
