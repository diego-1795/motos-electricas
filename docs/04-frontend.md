# 04 — Frontend

Guía de implementación del frontend de Raiden. Complementa [01-architecture](./01-architecture.md) (capas), [02-design-system](./02-design-system.md) (tokens y componentes) y [09-performance](./09-performance.md) (presupuestos).

## 1. Stack y convenciones base

| Aspecto | Decisión |
|---|---|
| Framework | Astro ^7.2 con `output: 'static'`, `trailingSlash: 'never'` |
| Lenguaje | TypeScript `strict: true` (`astro/tsconfigs/strict`), `noUncheckedIndexedAccess: true` |
| Islas | Preact ^10 vía `@astrojs/preact` con `compat: false` (sin alias de React) |
| Estado | `nanostores` + `@nanostores/persistent` + `@nanostores/preact` |
| Estilos | CSS custom properties + `<style>` scoped de Astro. Sin Tailwind, sin librerías UI |
| Node | >= 22.12 |

Reglas de TypeScript:

- Prohibido `any`; usar `unknown` y estrechar con validadores de `src/domain`.
- Tipos de dominio solo en `src/domain/*.ts`; los componentes importan tipos, nunca los redefinen.
- Importaciones con alias `@/` (`@/domain`, `@/services`, `@/data`, `@/config/site`).
- Archivos `.astro` declaran `interface Props` y la exportan en el frontmatter.

## 2. Componentes Astro vs islas Preact

| Criterio | Componente `.astro` (`src/components/`) | Isla Preact (`src/islands/`) |
|---|---|---|
| Ejecuta JS en cliente | No (HTML + CSS) | Sí, hidratado según `client:*` |
| Acceso a datos | En build (content collections, repositorios) | Recibe datos serializables por props o lee stores |
| Casos | Layout, cabecera, ficha de producto, grid de catálogo, SEO, footer | Carrito, configurador, comparador, finder |
| Test | Playwright (render) | Vitest (lógica) + Playwright (interacción) |

Regla: si una pieza puede resolverse con HTML, `<details>`, `<form method="get">` o CSS (`:has`, `scroll-snap`), no es isla. Las únicas islas autorizadas en MVP son las cuatro siguientes; añadir otra requiere revisión Frontend + Performance.

### 2.1 Islas autorizadas

```astro
---
// src/pages/[categoria]/[slug].astro (fragmento; p. ej. /bicimotos/golden-eagle)
import CartDrawer from '@/islands/CartDrawer';
import AddToCart from '@/islands/AddToCart';
---
<CartDrawer client:idle />
<AddToCart client:load product={productDTO} />
```

| Isla | Directiva | Justificación |
|---|---|---|
| `CartDrawer` | `client:idle` | Está en todas las páginas; no es crítica para el primer render, pero debe estar lista antes de la primera interacción. Pinta el contador leyendo `cartStore`. |
| `AddToCart` (configurador de variante/color/cantidad) | `client:load` | Es la acción principal de la ficha de producto; su interactividad forma parte del INP de la página. |
| `Comparator` | `client:visible` | Solo en `/comparar`; la tabla inicial se renderiza en HTML y la isla añade quitar/añadir columnas y sincronizar con `compareStore`. |
| `Finder` | `client:visible` | Solo en `/encuentra-tu-moto`; el formulario funciona sin JS (`method="get"`) y la isla mejora el paso a paso y el scoring instantáneo. |

Las islas reciben DTOs planos (`ProductDTO`), nunca instancias ni funciones. El tamaño del JSON serializado por isla se mantiene por debajo de 8 KB.

## 3. Store del carrito

Ubicación: `src/stores/cart.ts`. Clave de persistencia `raiden:cart:v1`. El esquema se versiona con `schemaVersion`; cualquier cambio incompatible incrementa la clave (`v2`) y se migra en la lectura.

```ts
// src/stores/cart.ts
import { persistentAtom } from '@nanostores/persistent';
import { computed } from 'nanostores';
import type { Cart, CartItem } from '@/domain/cart';
import { computeCartTotal } from '@/domain/pricing';

export const CART_STORAGE_KEY = 'raiden:cart:v1';
export const CART_SCHEMA_VERSION = 1;

const EMPTY_CART: Cart = { schemaVersion: CART_SCHEMA_VERSION, items: [], updatedAt: 0 };

export const cartStore = persistentAtom<Cart>(CART_STORAGE_KEY, EMPTY_CART, {
  encode: JSON.stringify,
  decode: (raw) => migrateCart(safeParse(raw)),
});

export const cartCount = computed(cartStore, (c) => c.items.reduce((n, i) => n + i.quantity, 0));
export const cartTotal = computed(cartStore, (c) => computeCartTotal(c.items));

function itemKey(i: Pick<CartItem, 'productId' | 'variantId' | 'colorId'>): string {
  return `${i.productId}:${i.variantId ?? '-'}:${i.colorId ?? '-'}`;
}

export function addItem(item: Omit<CartItem, 'quantity'>, quantity = 1): void {
  const cart = cartStore.get();
  const key = itemKey(item);
  const existing = cart.items.find((i) => itemKey(i) === key);
  const items = existing
    ? cart.items.map((i) => (itemKey(i) === key ? { ...i, quantity: clamp(i.quantity + quantity) } : i))
    : [...cart.items, { ...item, quantity: clamp(quantity) }];
  cartStore.set({ ...cart, items, updatedAt: Date.now() });
}

export function removeItem(key: string): void {
  const cart = cartStore.get();
  cartStore.set({ ...cart, items: cart.items.filter((i) => itemKey(i) !== key), updatedAt: Date.now() });
}

export function setQuantity(key: string, quantity: number): void {
  if (quantity <= 0) return removeItem(key);
  const cart = cartStore.get();
  cartStore.set({
    ...cart,
    items: cart.items.map((i) => (itemKey(i) === key ? { ...i, quantity: clamp(quantity) } : i)),
    updatedAt: Date.now(),
  });
}

export function clearCart(): void {
  cartStore.set({ ...EMPTY_CART, updatedAt: Date.now() });
}

const clamp = (n: number) => Math.min(Math.max(Math.trunc(n), 1), 10);

function safeParse(raw: string | undefined): unknown {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function migrateCart(data: unknown): Cart {
  if (!data || typeof data !== 'object') return EMPTY_CART;
  const d = data as Partial<Cart>;
  if (d.schemaVersion === CART_SCHEMA_VERSION && Array.isArray(d.items)) return d as Cart;
  // Versiones anteriores o desconocidas: se descarta. Añadir casos `case 0:` cuando exista v2.
  return EMPTY_CART;
}
```

Reglas del store:

- Nunca guarda nombre, teléfono, dirección ni notas del cliente; esos datos viven solo en el formulario de `/carrito` y se vuelcan al mensaje de WhatsApp.
- Los precios se guardan como `unitPriceCents` (entero) en el momento de añadir; el total se recalcula siempre con `computeCartTotal` de `src/domain/pricing.ts`.
- El store solo se lee en islas; los componentes `.astro` no tienen acceso (build-time).
- Cantidad máxima por línea: 10. Máximo de líneas: 20.

## 4. Content collections

Definidas en `src/content.config.ts` con `glob()` sobre `src/content/<colección>/*.json`. El esquema se escribe con `z` de `astro:content` (es dependencia interna de Astro, no añade paquete); el resto de validación en runtime usa validadores manuales (ver [05-backend](./05-backend.md)).

Colecciones: `products` (4 modelos), `repuestos` (26 piezas, `src/content/repuestos/`), `categories` (bicimotos, trimotos, repuestos), `blog` (Markdown) y `faqs`. Esquema de campos en [07-api](./07-api.md). Cada `ProductVariant` lleva `tier` (`estandar` | `premium`); cada repuesto, `unit` (`UND` | `PAR`) y `code`. El campo `accessories` de un producto lista los slugs de repuestos compatibles (nombre histórico, ver [ADR-015](./21-decisions.md)).

```json
{
  "id": "rd-golden-eagle",
  "slug": "golden-eagle",
  "name": "Golden Eagle",
  "subtitle": "Bicimoto eléctrica urbana",
  "claim": "Escoge la libertad que te impulsa",
  "description": "Texto comercial del modelo.",
  "category": "bicimotos",
  "brand": "Raiden",
  "images": [{ "src": "~/assets/products/golden-eagle-negro.jpg", "alt": "Golden Eagle en color negro", "width": 2020, "height": 2486 }],
  "heroImage": { "src": "~/assets/hero/golden-eagle.jpg", "alt": "Bicimoto eléctrica RAIDEN Golden Eagle", "width": 1577, "height": 672 },
  "specs": {
    "rangeKm": 35, "topSpeedKmh": 25, "powerW": 350,
    "battery": { "voltage": 48, "capacityAh": 12, "capacityKwh": 0.58, "chemistry": "plomo-acido", "removable": true, "chargeHours": [6, 8], "brand": "Chilwee" },
    "maxLoadKg": 150, "seats": 2, "license": "sin-licencia",
    "brakes": "Tambor delantero y trasero", "suspension": "Hidráulica delantera y suspensión trasera",
    "lighting": "...", "display": "Pantalla LCD", "drivingModes": ["Velocidad 1", "Velocidad 2", "Velocidad 3"],
    "motorType": "Motor sin escobillas (brushless) en rueda",
    "warrantyMonths": 12, "batteryWarrantyMonths": 12, "features": ["..."]
  },
  "variants": [
    { "id": "estandar", "name": "Estándar", "tier": "estandar", "description": "350 W · 48V 12Ah (extraíble)", "price": { "amount": 120000, "currency": "PEN" }, "availability": "en-stock", "sku": "RD-GOLDENEAGLE-350", "isDefault": true },
    { "id": "premium", "name": "Premium", "tier": "premium", "description": "500 W · 48V 20Ah (no extraíble)", "price": { "amount": 150000, "currency": "PEN" }, "availability": "en-stock", "sku": "RD-GOLDENEAGLE-500" }
  ],
  "colors": [{ "id": "negro", "name": "Negro", "hex": "#111315", "image": { "src": "~/assets/products/golden-eagle-negro.jpg", "alt": "...", "width": 2020, "height": 2486 } }],
  "accessories": ["bateria-chilwee-48v-12ah", "cargador-48v-12ah"],
  "related": ["royal-tiger", "vortex-kobra"],
  "useCases": ["ciudad", "trabajo", "ocio"],
  "highlights": ["25 km/h · sin licencia (en general)"],
  "technology": [{ "title": "Motor", "text": "..." }],
  "faqs": [{ "question": "...", "answer": "..." }],
  "featured": 100,
  "publishedAt": "2026-10-01",
  "seo": { "title": "Golden Eagle: bicimoto eléctrica RAIDEN | Desde S/ 1,200", "description": "..." }
}
```

Acceso desde páginas: siempre a través de `JsonProductRepository` (`src/data/json/product.repository.ts`), nunca `getCollection()` directamente en componentes. Esto mantiene el cambio a Supabase confinado a `src/data/`.

## 5. Imágenes

- Origen en `src/assets/` (`products/`, `hero/`, `repuestos/`, …). Las rutas del JSON usan el alias `~/assets/...` y se resuelven con `import.meta.glob` en el repositorio.
- Hero de producto: `<Picture formats={['avif','webp']} widths={[480,768,1024,1440]} sizes="(max-width: 768px) 100vw, 50vw" loading="eager" fetchpriority="high" />`.
- Tarjetas de catálogo y galería: `<Image loading="lazy" decoding="async" />` con `width`/`height` explícitos (CLS 0).
- `image.responsiveStyles: true` ya está activo en `astro.config.mjs`; no añadir CSS de `max-width` redundante.
- Prohibido `<img>` crudo salvo para SVG inline o iconos en `public/`.
- Peso objetivo: hero < 120 KB AVIF a 1024 px; tarjeta < 40 KB.

## 6. CSS

- `src/styles/tokens.css` (custom properties del [02-design-system](./02-design-system.md)), `base.css` (reset, tipografía fluida, foco visible), `components.css` (clases compartidas `.btn`, `.card`, `.badge`).
- Los tres se importan una vez en `src/layouts/Base.astro`. Con `inlineStylesheets: 'auto'` los ficheros pequeños se inlinean.
- Estilos específicos de un componente: `<style>` scoped en el propio `.astro`. Prohibido `is:global` fuera de `Base.astro`.
- Islas Preact: CSS Modules (`Island.module.css`) para evitar estilos en JS.
- Solo tokens: `color: var(--color-ink)`, `padding: var(--space-4)`. Un valor hexadecimal o `px` suelto en un componente es motivo de rechazo en PR.
- Tema oscuro por `[data-theme="dark"]` y `prefers-color-scheme`; los tokens cambian, los componentes no.
- Animaciones solo de `transform`/`opacity`, envueltas en `@media (prefers-reduced-motion: no-preference)`.

## 7. Naming

| Elemento | Convención | Ejemplo |
|---|---|---|
| Componentes Astro / islas | PascalCase | `ProductCard.astro`, `CartDrawer.tsx` |
| Stores, servicios, utilidades | camelCase | `cart.ts`, `whatsappMessageBuilder.ts` |
| Tipos e interfaces | PascalCase sin prefijo `I` | `ProductRepository` |
| Clases CSS | kebab-case, BEM ligero | `.product-card__price--from` |
| Rutas y slugs | kebab-case en español | `/bicimotos/golden-eagle` |
| Eventos de analítica | snake_case | `add_to_cart` |
| Variables de entorno públicas | `PUBLIC_` + SCREAMING_SNAKE | `PUBLIC_WHATSAPP_NUMBER` |

## 8. Rendimiento por componente

| Componente | Regla |
|---|---|
| `Base.astro` | Sin scripts de terceros; analítica vía `AnalyticsService` cargada con `client:idle` como máximo |
| `Header.astro` | Menú móvil con `<details>` + CSS; el contador del carrito es un `<span>` que actualiza `CartDrawer` |
| `ProductCard.astro` | Una sola imagen lazy; precio formateado en build con `formatMoney` de `money.ts` (`S/ 1,200`) |
| `AddToCart` | < 12 KB gz incluyendo Preact compartido; sin dependencias adicionales |
| `Comparator` | Máximo 3 productos; la tabla HTML se renderiza en servidor |
| `Finder` | Scoring en `src/domain/finder.ts` (función pura); sin fetch |
| Página de producto | JS total < 60 KB gz; LCP = imagen hero con `fetchpriority="high"` |

`prefetch` por hover está activo; no añadir `<link rel="prefetch">` manual.

## 9. Checklist de PR (frontend)

- [ ] Sin `any`; `astro check` y `tsc --noEmit` sin errores.
- [ ] Ninguna isla nueva sin aprobación; directiva `client:*` justificada en la descripción del PR.
- [ ] Props de islas serializables y < 8 KB.
- [ ] Imágenes con `<Image>`/`<Picture>`, `width`/`height` y `sizes`.
- [ ] Solo tokens CSS; sin valores mágicos; estados `:focus-visible` presentes.
- [ ] Textos visibles en español del Perú; nada hardcodeado que pertenezca a `src/config/site.ts`.
- [ ] Tests Vitest para lógica nueva en `domain`/`services`; E2E si cambia el flujo de carrito.
- [ ] Lighthouse CI dentro de presupuesto en la página afectada.
- [ ] Sin dependencias nuevas en `package.json` sin revisión Frontend + Performance.
