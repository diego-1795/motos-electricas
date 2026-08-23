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
// src/pages/motos-electricas/[slug].astro (fragmento)
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

Colecciones: `products`, `categories`, `brands`, `accessories`, `blog` (Markdown), `faqs`. Esquema de campos en [07-api](./07-api.md).

```json
{
  "id": "odin-1-0",
  "slug": "odin-1-0",
  "name": "ODIN 1.0",
  "brandId": "raiden",
  "categoryId": "motos-electricas-urbanas",
  "status": "published",
  "summary": "Moto eléctrica urbana equivalente a 125 cc con batería extraíble.",
  "description": "Texto largo en Markdown.",
  "license": "B-IIa",
  "priceFromCents": 449900,
  "currency": "PEN",
  "heroImage": "odin-1-0/hero.jpg",
  "gallery": ["odin-1-0/lateral.jpg", "odin-1-0/detalle-bateria.jpg"],
  "variants": [
    { "id": "72v-32ah", "name": "72V 32Ah", "priceCents": 449900, "batteryId": "bat-72v-32ah", "rangeKm": 90, "topSpeedKmh": 95, "chargeHours": 5, "stock": "in_stock" },
    { "id": "72v-50ah", "name": "72V 50Ah", "priceCents": 549900, "batteryId": "bat-72v-50ah", "rangeKm": 140, "topSpeedKmh": 95, "chargeHours": 7, "stock": "preorder" }
  ],
  "colors": [
    { "id": "negro", "name": "Negro", "hex": "#111315", "image": "odin-1-0/negro.jpg" },
    { "id": "gris", "name": "Gris volt", "hex": "#9AA0A6", "image": "odin-1-0/gris.jpg" }
  ],
  "specs": {
    "motorPowerW": 5000,
    "motorPeakW": 8000,
    "weightKg": 118,
    "maxLoadKg": 180,
    "brakes": "Disco CBS delantero y trasero",
    "wheels": "17\" / 17\"",
    "removableBattery": true,
    "warrantyMonths": 24
  },
  "useCases": ["ciudad", "interurbano"],
  "compatibleAccessoryIds": ["casco-raiden", "bateria-72v-50ah"],
  "seo": { "title": "ODIN 1.0 — moto eléctrica 125 equivalente", "description": "..." },
  "publishedAt": "2026-03-01"
}
```

Acceso desde páginas: siempre a través de `JsonProductRepository` (`src/data/json/product.repository.ts`), nunca `getCollection()` directamente en componentes. Esto mantiene el cambio a Supabase confinado a `src/data/`.

## 5. Imágenes

- Origen en `src/assets/products/<slug>/`. Las rutas del JSON son relativas a ese directorio y se resuelven con `import.meta.glob` en el repositorio.
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
| Rutas y slugs | kebab-case en español | `/motos-electricas-urbanas` |
| Eventos de analítica | snake_case | `add_to_cart` |
| Variables de entorno públicas | `PUBLIC_` + SCREAMING_SNAKE | `PUBLIC_WHATSAPP_NUMBER` |

## 8. Rendimiento por componente

| Componente | Regla |
|---|---|
| `Base.astro` | Sin scripts de terceros; analítica vía `AnalyticsService` cargada con `client:idle` como máximo |
| `Header.astro` | Menú móvil con `<details>` + CSS; el contador del carrito es un `<span>` que actualiza `CartDrawer` |
| `ProductCard.astro` | Una sola imagen lazy; precio formateado en build con `formatMoney` de `money.ts` (`S/ 4,999`) |
| `AddToCart` | < 12 KB gz incluyendo Preact compartido; sin dependencias adicionales |
| `Comparator` | Máximo 4 productos; la tabla HTML se renderiza en servidor |
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
