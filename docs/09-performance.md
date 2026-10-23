# 09 — Rendimiento

El rendimiento es un requisito de producto, no una optimización posterior: un showroom premium mobile-first que carga lento pierde la venta antes de llegar al WhatsApp. La arquitectura SSG de Astro con islas mínimas ([01-architecture](./01-architecture.md)) está elegida precisamente para cumplir estos presupuestos en redes móviles 4G. Relación directa con [08-seo](./08-seo.md) (Core Web Vitals), [04-frontend](./04-frontend.md) y [11-testing](./11-testing.md) (Lighthouse CI).

## 1. Presupuestos

Medidos con Lighthouse en modo móvil (Moto G Power simulado, 4G lento) sobre el build de producción. Bloquean el merge si se incumplen.

| Métrica | Presupuesto | Ámbito | Verificación |
|---|---|---|---|
| LCP | < 2,5 s (umbral "bueno" CWV; ajustado 2026-10-23 con fotografía real) | Todas las páginas | Lighthouse CI |
| INP | < 200 ms | Producto, carrito, finder | Lighthouse CI + campo |
| CLS | < 0,1 | Todas las páginas | Lighthouse CI |
| TTFB | < 400 ms | Todas (Cloudflare edge) | Campo |
| JS total (gzip) | < 60 KB | Página de producto | `resource-summary` en LHCI |
| JS total (gzip) | < 25 KB | Home, categorías, blog | `resource-summary` |
| JS total (gzip) | < 80 KB | Carrito, comparador, finder | `resource-summary` |
| CSS (gzip) | < 30 KB | Todas | `resource-summary` |
| Imagen LCP | < 120 KB | Hero / imagen principal producto | Revisión + LHCI |
| Imágenes por página | < 600 KB | Categoría (grid de 12) | `resource-summary` |
| Peso total | < 1 MB | Cualquier página | `resource-summary` |
| Peticiones | < 40 | Cualquier página | `resource-summary` |
| Fuentes descargadas | 0 | MVP | Revisión |

## 2. Estrategia zero-JS

Por defecto una página no envía JavaScript. Astro renderiza HTML en build y solo las islas declaradas reciben un bundle. El runtime de Preact (~4 KB gz) se comparte entre islas.

Lo que NO es isla: cabecera, menú, grid de productos, ficha (galería, specs, FAQ), breadcrumbs, footer, blog, páginas legales. Menú móvil, acordeones y tabs se resuelven con `<details>`, `:target` o un script inline de < 1 KB sin framework.

## 3. Criterios de hidratación por isla

| Isla | Directiva | Justificación |
|---|---|---|
| `CartDrawer` | `client:idle` | Debe estar listo poco después de la carga, pero no compite con el LCP |
| `CartBadge` (contador cabecera) | `client:idle` | Lee localStorage; muestra 0 en SSR sin salto de layout (ancho reservado) |
| `AddToCart` / configurador de variante | `client:visible` | Solo cuando el usuario llega al bloque de compra |
| `CompareTable` | `client:load` | Es el contenido principal de `/comparar` |
| `Finder` | `client:load` | Contenido principal de `/encuentra-tu-moto` |
| `CartPage` | `client:load` | Contenido principal de `/carrito` |
| `Toast` | Montado dentro de `CartDrawer` | No es isla independiente |

Reglas: una isla no importa otra isla; comunican mediante stores de nanostores. Ninguna isla importa el repositorio de productos completo: recibe por props solo los datos que necesita (serializados en build). Prohibido `client:only` salvo justificación escrita.

## 4. Imágenes

- `<Image>`/`<Picture>` de Astro con `formats={['avif','webp']}` y fallback JPEG. Optimización en build con sharp; `image.responsiveStyles: true` ya activo.
- `width`/`height` siempre explícitos → sin CLS.
- `sizes` realistas: grid de categoría `(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 400px`; imagen principal de producto `(max-width: 768px) 100vw, 640px`.
- `loading="eager"` + `fetchpriority="high"` solo en la imagen LCP (hero en home, principal en producto). Resto `loading="lazy"` y `decoding="async"`.
- Galería de producto: miniaturas a 160 px; la imagen grande cambia con `<a href="#img-2">` + `:target` o un script inline, sin isla.
- Originales en `src/assets/` a máximo 2000 px de ancho; nada en `public/` salvo favicon, OG por defecto y assets legales.

## 5. Fuentes

Montserrat (variable, 70 KB) e Integral CF (un único `woff2` de 19 KB, solo títulos) self-hosted en `public/fonts/`, subconjunto latino, `font-display: swap`, `<link rel="preload">` de ambas y fallbacks métricos (`size-adjust`) para minimizar CLS; el nombre de fichero no lleva corchetes para evitar doble descarga. Detalle en [02-design-system](./02-design-system.md). Cualquier fuente adicional exige revisión de Performance.

## 6. CSS

- `build.inlineStylesheets: 'auto'` ya activo: hojas pequeñas se inlinan en `<head>` (CSS crítico sin herramienta extra); `cssCodeSplit` separa el CSS por página.
- `tokens.css` + `base.css` son globales y deben quedar < 8 KB gz. `components.css` solo incluye componentes usados (Astro elimina CSS de componentes no renderizados cuando está en el componente; los estilos globales no).
- Sin `@import` encadenados en runtime; sin CSS-in-JS.
- Animaciones solo con `transform` y `opacity`; `will-change` únicamente en el drawer durante la transición.

## 7. Prefetch y navegación

`prefetch: { prefetchAll: false, defaultStrategy: 'hover' }` ya configurado: al pasar el ratón o tocar (`touchstart`) un enlace interno se precarga el HTML. Sin View Transitions en MVP (revisión posterior de coste). Las páginas de producto enlazadas desde el grid se precargan de forma natural al hacer hover.

## 8. Caché y cabeceras

Cloudflare Pages sirve assets con hash en `/_astro/`. En `public/_headers` (detalle en [10-security](./10-security.md) y [13-cloudflare](./13-cloudflare.md)):

```
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
/*.html
  Cache-Control: public, max-age=0, must-revalidate
/
  Cache-Control: public, max-age=0, must-revalidate
/sitemap-index.xml
  Cache-Control: public, max-age=3600
```

Brotli y HTTP/3 los aplica Cloudflare. Equivalente Vercel en `vercel.json` ([20-migration](./20-migration.md)).

## 9. Lighthouse CI

`lighthouserc.cjs` en la raíz; se ejecuta en GitHub Actions sobre `dist/` tras el build.

```js
module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      url: ['/', '/productos', '/bicimotos/golden-eagle', '/carrito', '/encuentra-tu-moto'],
      numberOfRuns: 3,
      settings: { preset: 'mobile' }
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.95 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:seo': ['error', { minScore: 1 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2000 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'interaction-to-next-paint': ['warn', { maxNumericValue: 200 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        'resource-summary:script:size': ['error', { maxNumericValue: 61440 }],
        'resource-summary:stylesheet:size': ['error', { maxNumericValue: 30720 }],
        'resource-summary:total:size': ['error', { maxNumericValue: 1048576 }],
        'unused-javascript': 'warn'
      }
    },
    upload: { target: 'temporary-public-storage' }
  }
};
```

`resource-summary:*:size` mide bytes transferidos (comprimidos cuando el servidor estático de LHCI comprime; si no, se aplica factor 3 en la revisión manual). Script npm propuesto: `"lhci": "lhci autorun"` ([11-testing](./11-testing.md)).

## 10. Medición en campo

- Opcional y gratuito: Cloudflare Web Analytics (beacon sin cookies) reporta CWV reales por página. Se carga con `defer` tras el `load` y está contemplado en la CSP ([10-security](./10-security.md)). Activación vía `PUBLIC_CF_ANALYTICS_TOKEN`; si no existe, no se inyecta.
- Chrome UX Report (CrUX) en Search Console una vez haya tráfico.
- Revisión mensual: p75 de LCP/INP/CLS por plantilla (home, categoría, producto, carrito).

## 11. Anti-patrones prohibidos

- Librerías UI, Tailwind, iconos como fuente, lodash/moment/dayjs.
- `client:load` en componentes que no son el contenido principal de la página.
- Pasar el catálogo completo como prop a una isla.
- Imágenes en `public/` sin optimizar; `<img>` sin dimensiones; GIF animados.
- Carruseles con autoplay y vídeos de fondo en el hero.
- Scripts de terceros (chat widgets, mapas embebidos, tag managers) sin aprobación; el enlace wa.me sustituye al widget de chat.
- `@import` de Google Fonts; webfonts sin presupuesto aprobado.
- Animaciones sobre `width/height/top/left`; `box-shadow` animada.
- Bloquear render con `<script>` síncrono en `<head>`.

## 12. Proceso de revisión de rendimiento

1. Todo PR ejecuta build + Lighthouse CI; el fallo de una aserción `error` bloquea el merge.
2. Cambios marcados como transversales por gobernanza ([01-architecture](./01-architecture.md)): nueva dependencia frontend, nueva isla, animación, webfont o script de terceros requieren revisión del agente Performance con informe de bundle (`npx astro build` + tamaño de `dist/_astro/*.js`).
3. Cada nueva plantilla de página se añade a `collect.url` en `lighthouserc.cjs`.
4. Revisión mensual de campo (apartado 10) y ajuste de presupuestos solo a la baja.
5. Toda excepción a un presupuesto se documenta en [21-decisions](./21-decisions.md) con fecha, motivo y plan de retirada.
