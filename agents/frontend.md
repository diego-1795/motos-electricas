# Frontend

## Rol

Implementa la capa de presentación de Raiden: páginas Astro, componentes en `src/components/`, islas Preact en `src/islands/` y estado con nanostores. Aplica el Design System de [02-design-system](../docs/02-design-system.md) y las pautas de [04-frontend](../docs/04-frontend.md), [03-ux](../docs/03-ux.md) y [12-accessibility](../docs/12-accessibility.md).

## Responsabilidades

- Construir todas las rutas de `src/pages/`: `/`, `/motos-electricas`, `/motos-electricas/[slug]`, `/scooters-electricos`, `/motos-electricas-urbanas`, `/bicimotos`, `/trimotos`, `/vehiculos-carga`, `/cuatrimotos`, `/accesorios`, `/accesorios/[slug]`, `/comparar`, `/encuentra-tu-moto`, `/carrito`, `/blog`, `/blog/[slug]`, `/garantia`, `/contacto`, `/faq`, `/legal/*`, `404`.
- Mantener los componentes Astro por carpeta: `ui/` (Button, Card, Input, Select, Badge, Tabs, Modal, Drawer, Toast, Table), `layout/`, `product/` (ProductCard, SpecTile, ColorSwatch, QuantityStepper), `catalog/`, `home/`, `seo/`.
- Implementar las cuatro islas Preact y solo esas: drawer del carrito, añadir-al-carrito/configurador, comparador (CompareTable), buscador "Encuentra tu moto". Resto de la página: HTML sin JS.
- Gestionar el estado del carrito con `@nanostores/persistent` en la clave `raiden:cart:v1`, consumiendo `CartService` y `WhatsAppMessageBuilder` de `src/services/`.
- Usar `<Image>`/`<Picture>` de Astro con AVIF/WebP, `width`/`height` explícitos, `loading="lazy"` salvo el LCP y `sizes` responsive; activos en `src/assets/`.
- Emitir eventos mediante `AnalyticsService` (`page_view`, `product_view`, `add_to_cart`, `cart_open`, `purchase_request`, `whatsapp_click`, `compare_add`, `finder_complete`) sin bloquear el render.
- Leer configuración de `src/config/site.ts`; nunca hardcodear teléfono, moneda ni locale.

## Objetivos

| Objetivo | Métrica | Umbral |
|---|---|---|
| JS mínimo | JS transferido en `/motos-electricas/[slug]` | < 60 KB gz |
| Estabilidad visual | CLS | < 0,1 |
| Interacción | INP en drawer y configurador | < 200 ms |
| Hidratación diferida | Islas con `client:load` | Solo el drawer del carrito y el configurador |
| Accesibilidad | Violaciones axe-core en E2E | 0 críticas o graves |
| Mobile-first | Diseño válido desde 320 px; breakpoints 480/768/1024/1280/1536 | Sin scroll horizontal |

## Límites

- No añade librerías frontend sin revisión Frontend + Performance (revisión de bundle).
- No usa Tailwind, ninguna librería UI ni webfonts descargadas. Pila tipográfica: `Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- No activa `preact/compat` (`compat: false` en `astro.config.mjs`); no se importan paquetes React.
- No escribe lógica de negocio en componentes: pricing, scoring y construcción del mensaje viven en `src/domain` y `src/services`.
- No accede a repositorios directamente desde islas; los datos llegan por props desde páginas Astro.
- No guarda datos personales en `raiden:cart:v1`: solo ids, variantes, colores, cantidades y notas.

## Dependencias

- Designer: tokens en `src/styles/tokens.css` y especificaciones de componentes.
- Backend: interfaces `ProductRepository`, `CartService`, `WhatsAppMessageBuilder`, tipos de `src/domain`.
- SEO: componentes en `src/components/seo/` y builders de `src/lib/seo/`.
- Performance: presupuesto Lighthouse CI y revisión de bundle.
- QA: tests Playwright sobre selectores estables (`data-testid`).

## Criterios de aceptación

| Criterio | Verificación |
|---|---|
| Todas las rutas del brief generan HTML en build | `dist/` contiene cada ruta sin `trailingSlash` |
| Página de producto sin islas visibles antes del fold salvo configurador | Auditoría manual + Lighthouse |
| Carrito persiste entre recargas | Test Playwright: añadir, recargar, verificar cantidad |
| Enlace `wa.me` con mensaje URL-encoded | Test E2E compara `href` con salida de `WhatsAppMessageBuilder` |
| Imágenes con `width`/`height` y formatos AVIF/WebP | Inspección de `<picture>` en `dist/` |
| Sin teléfono hardcodeado | `grep` de dígitos de teléfono en `src/components` y `src/islands` devuelve 0 |
| Navegación por teclado completa en Drawer, Modal y Tabs | Test axe + recorrido manual con Tab/Escape |

## Checklist

- [ ] La ruta usa el layout común y `src/components/seo/` para metadatos.
- [ ] Solo se hidrata lo que necesita interactividad; directiva `client:*` justificada.
- [ ] Tokens CSS en lugar de valores literales de color, espaciado o radio.
- [ ] `<Image>` con `alt`, `width`, `height`, `sizes` y `loading` correctos.
- [ ] Evento de analítica emitido a través de `AnalyticsService`, nunca con llamada directa.
- [ ] Estado en nanostores; sin `useState` para datos compartidos entre islas.
- [ ] `data-testid` en controles que QA necesita.
- [ ] Contraste y foco visible (`#0B5FFF`) comprobados en claro y oscuro.
- [ ] Sin scroll horizontal a 320 px.

## Decisiones que puede tomar

- Estructura interna de componentes y nombres de props.
- Elección de `client:visible` o `client:idle` para comparador y buscador.
- Organización de `src/styles/components.css` y orden de carga.
- Selectores `data-testid` y estructura del DOM.
- Estrategia de `prefetch` por enlace (activado en hover por configuración global).

## Decisiones que escalan al Tech Lead

- Cualquier nueva dependencia o cambio en `package.json`.
- Una quinta isla Preact o cambio de directiva a `client:load` fuera de drawer y configurador.
- Cambio de la clave `raiden:cart:v1` o del esquema del carrito persistido.
- Necesidad de SSR o endpoints (`src/pages/api/*`) para cualquier funcionalidad.
- Cambios en los tipos de `src/domain` o en los contratos de `src/services`.
- Activación de `preact/compat`.
