# 18 — Analítica

Documento de referencia para la medición de Raiden. Define qué se mide, cómo se abstrae el proveedor y qué garantías de rendimiento y privacidad se respetan. Relacionado con [09-performance](./09-performance.md), [10-security](./10-security.md), [16-whatsapp-commerce](./16-whatsapp-commerce.md) y [11-testing](./11-testing.md).

## 1. Objetivos de medición

1. Conocer el embudo real desde el descubrimiento hasta el clic en WhatsApp, que es la conversión del MVP (no hay pago online).
2. Detectar en qué paso se pierde al usuario (catálogo, ficha, configurador, carrito).
3. Medir qué herramientas de ayuda a la decisión (comparador, finder) influyen en la conversión.
4. Hacerlo sin cookies, sin PII y sin penalizar Core Web Vitals.
5. Mantener el proveedor intercambiable: el código de negocio solo conoce `AnalyticsService`.

## 2. Interfaz `AnalyticsService`

Ubicación: `src/services/analytics/AnalyticsService.ts`. Los nombres de evento son un tipo cerrado para que TypeScript impida disparar eventos no catalogados.

```ts
export type AnalyticsEventName =
  | 'page_view'
  | 'product_view'
  | 'add_to_cart'
  | 'cart_open'
  | 'purchase_request'
  | 'whatsapp_click'
  | 'compare_add'
  | 'finder_complete';

export type AnalyticsValue = string | number | boolean;

export interface AnalyticsEventMap {
  page_view: { path: string; title: string; category?: string };
  product_view: { productId: string; slug: string; category: string; price: number };
  add_to_cart: { productId: string; variantId: string; colorId?: string; qty: number; price: number };
  cart_open: { items: number; total: number };
  purchase_request: { items: number; value: number; models: string[] };
  whatsapp_click: { source: 'cart' | 'product' | 'header' | 'contact'; total?: number };
  compare_add: { productId: string; compareCount: number };
  finder_complete: { use: string; budget: string; range: string; resultCount: number };
}

export interface AnalyticsService {
  /** Nunca lanza; nunca bloquea. Se encola y se envía en tiempo ocioso. */
  track<E extends AnalyticsEventName>(name: E, props: AnalyticsEventMap[E]): void;
  /** Se llama una vez por navegación completa. */
  pageView(props: AnalyticsEventMap['page_view']): void;
}
```

Reglas:

- Ningún componente instancia un adaptador; todos importan `analytics` desde `src/services/analytics/index.ts`.
- Los `props` solo admiten primitivas. Ni objetos anidados ni datos del cliente.
- `track` devuelve `void` y atrapa cualquier excepción del adaptador.

## 3. Catálogo de eventos

| Evento | Propiedades | Dónde se dispara | Isla / componente |
|---|---|---|---|
| `page_view` | `path`, `title`, `category?` | Cada carga de página, tras `DOMContentLoaded` | Script inline de `BaseLayout.astro` |
| `product_view` | `productId`, `slug`, `category`, `price` | Al renderizar `/bicimotos/[slug]`, `/trimotos/[slug]` y `/repuestos/[slug]` | `ProductPage.astro` (script inline) |
| `add_to_cart` | `productId`, `variantId`, `colorId?`, `qty`, `price` | Al confirmar en el configurador | `islands/AddToCart.tsx` |
| `cart_open` | `items`, `total` | Al abrir el drawer o entrar en `/carrito` | `islands/CartDrawer.tsx`, `carrito.astro` |
| `purchase_request` | `items`, `value`, `models` (slugs de los modelos del pedido) | Al pulsar "Solicitar pedido" (antes de construir el mensaje) | `islands/CartDrawer.tsx` |
| `whatsapp_click` | `source`, `total?` | En cada enlace `wa.me` (`click` con `navigator.sendBeacon` garantizado) | `WhatsAppLink.astro`, `CartDrawer.tsx` |
| `compare_add` | `productId`, `compareCount` | Al añadir un producto al comparador | `islands/CompareBar.tsx` |
| `finder_complete` | `use`, `budget`, `range`, `resultCount` | Al mostrar resultados del finder | `islands/Finder.tsx` |

`purchase_request` y `whatsapp_click` se distinguen a propósito: el primero mide la intención dentro del carrito; el segundo, la salida efectiva hacia ventas desde cualquier origen.

## 4. Adaptadores

Todos en `src/services/analytics/adapters/`. Cada uno implementa `AnalyticsService`.

| Adaptador | Entorno | Coste | Cookies | Notas |
|---|---|---|---|---|
| `NoopAnalytics` | Por defecto (build sin variable) | 0 | No | Garantiza que el código nunca dependa de un proveedor |
| `ConsoleAnalytics` | `npm run dev` | 0 | No | `console.debug('[analytics]', name, props)` |
| `CloudflareBeaconAnalytics` | Producción (opcional) | 0 (plan free) | No | Script `beacon.min.js` cargado con `defer`; eventos custom vía `sendBeacon` a `/cdn-cgi/rum` no es estable: se limita a `page_view` y CWV |
| `DataLayerAnalytics` | Producción con GTM/GA4 (futuro) | 0 | Depende del tag | `window.dataLayer.push({ event, ...props })` |

Ejemplo de `DataLayerAnalytics` y de la cola común:

```ts
// src/services/analytics/queue.ts
type Job = () => void;
const jobs: Job[] = [];
let scheduled = false;

export function enqueue(job: Job): void {
  jobs.push(job);
  if (scheduled) return;
  scheduled = true;
  const run = () => { scheduled = false; while (jobs.length) { try { jobs.shift()!(); } catch { /* nunca propaga */ } } };
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 0);
}

// src/services/analytics/adapters/DataLayerAnalytics.ts
import { enqueue } from '../queue';
export class DataLayerAnalytics implements AnalyticsService {
  track(name, props) {
    enqueue(() => { (window.dataLayer ??= []).push({ event: name, ...props }); });
  }
  pageView(props) { this.track('page_view', props); }
}
```

Selección por entorno en `src/services/analytics/index.ts`:

```ts
const provider = import.meta.env.PUBLIC_ANALYTICS_PROVIDER ?? 'noop';
export const analytics: AnalyticsService =
  provider === 'console' ? new ConsoleAnalytics()
  : provider === 'cloudflare' ? new CloudflareBeaconAnalytics(import.meta.env.PUBLIC_CF_BEACON_TOKEN)
  : provider === 'datalayer' ? new DataLayerAnalytics()
  : new NoopAnalytics();
```

Variables: `PUBLIC_ANALYTICS_PROVIDER` (`noop|console|cloudflare|datalayer`) y `PUBLIC_CF_BEACON_TOKEN`. Ambas son públicas por diseño; ver [19-deployment](./19-deployment.md).

## 5. Regla: nunca bloquear el render

- Todo envío pasa por `enqueue` (requestIdleCallback con `timeout` de 2 s; fallback `setTimeout`).
- Scripts de terceros siempre `defer` y cargados desde el layout, nunca desde islas.
- Para `whatsapp_click` (la página se abandona) se usa `navigator.sendBeacon` si el adaptador lo soporta; en ningún caso se retrasa la navegación con `preventDefault` + `setTimeout`.
- Presupuesto: el módulo de analítica (cola + adaptador activo) no puede superar 2 KB gz; cuenta dentro del límite de 60 KB de [09-performance](./09-performance.md).
- La CSP de `public/_headers` debe incluir `static.cloudflareinsights.com` en `script-src` y `connect-src` solo si el proveedor es `cloudflare`.

## 6. Embudo de conversión y KPIs

```
page_view (catálogo) → product_view → add_to_cart → cart_open → purchase_request → whatsapp_click
```

| KPI | Fórmula | Objetivo MVP |
|---|---|---|
| Tasa ficha → carrito | `add_to_cart / product_view` | ≥ 6 % |
| Tasa carrito → solicitud | `purchase_request / cart_open` | ≥ 35 % |
| Tasa global a WhatsApp | `whatsapp_click(source=cart) / sesiones` | ≥ 2 % |
| Influencia del comparador | `% de whatsapp_click con compare_add previo` | Seguimiento |
| Influencia del finder | `% de add_to_cart con finder_complete previo` | Seguimiento |
| Valor medio solicitado | media de `purchase_request.total` | Seguimiento |

Las secuencias "previo" se calculan por sesión en el panel del proveedor; el frontend no correlaciona eventos ni guarda identificadores.

## 7. Privacidad

- Sin cookies ni `localStorage` de analítica. El único `localStorage` del sitio es `raiden:cart:v1`, ajeno a la medición.
- Sin PII: nunca se envían nombre, teléfono, email, notas del pedido ni el texto del mensaje de WhatsApp.
- Sin identificador de usuario ni fingerprinting. La sesión la infiere el proveedor (Cloudflare Web Analytics no rastrea entre sitios).
- Con `noop`, `console` o `cloudflare` no se necesita banner de consentimiento (Ley N.º 29733: no hay tratamiento con cookies ni identificadores). Si se activa `datalayer` con GA4, el DevOps y el Tech Lead deben añadir gestión de consentimiento antes del despliegue.
- La política de privacidad en `/legal/privacidad` documenta el proveedor activo.

## 8. Dashboards

| Panel | Herramienta | Contenido |
|---|---|---|
| Tráfico y CWV | Cloudflare Web Analytics | Visitas, páginas, países, LCP/INP/CLS reales |
| Embudo | Panel del proveedor de eventos (GA4 vía dataLayer, futuro) | Los 6 pasos del embudo y KPIs de la sección 6 |
| Pedidos | Hoja de cálculo manual de ventas (MVP) | Solicitudes recibidas por WhatsApp, cierre. Se cruza a mano con `whatsapp_click` |
| Rendimiento de build | Lighthouse CI | Histórico de puntuaciones por PR |

Cuando exista Supabase (`order_requests`, `whatsapp_requests`), el panel de pedidos pasa al admin ([17-admin-panel](./17-admin-panel.md)).

## 9. Plan de pruebas

| Nivel | Qué se prueba | Herramienta |
|---|---|---|
| Unit | `enqueue` ejecuta todos los trabajos y absorbe excepciones; selección de adaptador por variable; `DataLayerAnalytics` hace `push` con la forma `{ event, ...props }` | Vitest |
| Unit | Tipado: `track('add_to_cart', {...})` rechaza props incorrectos (test de tipos con `expectTypeOf`) | Vitest |
| E2E | Con `PUBLIC_ANALYTICS_PROVIDER=datalayer`, el flujo catálogo → carrito → WhatsApp deja en `window.dataLayer` exactamente la secuencia esperada | Playwright |
| E2E | Ningún evento contiene claves `name`, `phone`, `email`, `notes` | Playwright (aserción sobre `dataLayer`) |
| Performance | Con el proveedor `cloudflare`, Lighthouse no reporta script bloqueante y el JS total sigue < 60 KB gz | Lighthouse CI |
| Manual | Los eventos aparecen en el panel del proveedor en preview antes de pasar a producción | Checklist de despliegue |
