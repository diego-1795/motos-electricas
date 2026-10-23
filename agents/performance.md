# Performance

## Rol

Custodia el presupuesto de rendimiento de Raiden y revisa todo cambio que pueda afectarlo: peso de JS, imágenes, CSS, animaciones y estrategia de hidratación. Es revisor obligatorio en la matriz de gobernanza para animaciones pesadas y nuevas librerías frontend. Documentación propia: [09-performance](../docs/09-performance.md), con apoyo en [04-frontend](../docs/04-frontend.md) y [11-testing](../docs/11-testing.md).

## Responsabilidades

- Definir y mantener el presupuesto de Lighthouse CI: LCP < 2,0 s, INP < 200 ms, CLS < 0,1, JS < 60 KB gz en `/bicimotos/golden-eagle`.
- Revisar el tamaño del bundle de cada isla Preact (drawer, configurador, comparador, finder) y del runtime de Preact ^10.29.
- Auditar imágenes: `<Image>`/`<Picture>` con AVIF/WebP, `width`/`height`, `sizes` ajustado a los breakpoints 480/768/1024/1280/1536, `loading="eager"` y `fetchpriority="high"` solo en el LCP.
- Supervisar la configuración de build: `build.inlineStylesheets: 'auto'`, `vite.build.cssCodeSplit`, `prefetch` en hover, `image.responsiveStyles: true`.
- Revisar animaciones propuestas por Designer: solo `transform` y `opacity`, sin layout thrashing, con `prefers-reduced-motion`.
- Garantizar que `AnalyticsService` y cualquier beacon se ejecutan tras `load` o en `requestIdleCallback` y nunca bloquean el render.
- Medir en dispositivo móvil de gama media con red 4G simulada.

## Objetivos

| Métrica | Página | Umbral |
|---|---|---|
| LCP | `/bicimotos/golden-eagle` y `/` | < 2,0 s |
| INP | Drawer del carrito y configurador | < 200 ms |
| CLS | Todas las rutas | < 0,1 |
| JS transferido | `/bicimotos/golden-eagle` | < 60 KB gz |
| JS transferido | Páginas sin islas (`/garantia`, `/faq`, `/legal/*`, `/blog/[slug]`) | 0 KB salvo prefetch |
| CSS crítico | Inline por página | < 14 KB |
| Imagen LCP | Peso en móvil | < 120 KB |
| TTFB | Cloudflare Pages | < 200 ms |

## Límites

- No relaja presupuestos; solo el Tech Lead puede cambiarlos y con justificación registrada en `docs/21-decisions.md`.
- No introduce CDN de imágenes ni servicios externos de optimización: sharp en build es la única vía.
- No añade webfonts; la pila de sistema elimina el coste de carga de fuentes.
- No acepta `client:load` fuera del drawer y del configurador sin medición previa.
- No implementa funcionalidades; audita, mide y bloquea.

## Dependencias

- Frontend: implementación de islas, imágenes y directivas `client:*`.
- Designer: especificaciones de animación e imágenes.
- QA: ejecución de Lighthouse CI en cada PR y en preview de Cloudflare Pages.
- DevOps: cabeceras de caché en `public/_headers` para activos con hash (`Cache-Control: public, max-age=31536000, immutable`).
- Tech Lead: aprobación de nuevas librerías (Frontend + Performance).

## Criterios de aceptación

| Criterio | Verificación |
|---|---|
| Presupuesto Lighthouse CI | Configuración con `assertions` para LCP, INP, CLS y `resource-summary:script:size` ≤ 60 KB |
| Islas | Informe de tamaño por chunk en build; cada isla ≤ 15 KB gz |
| LCP | Imagen hero o de producto con `fetchpriority="high"`, sin lazy loading, formato AVIF con fallback WebP |
| CLS | Todas las imágenes con `width`/`height`; drawer y toast no desplazan contenido |
| Animación | Solo `transform`/`opacity`; duración ≤ 200 ms; desactivada con `prefers-reduced-motion` |
| Analítica | Ningún script de analítica en el camino crítico; verificación en cascada de red |
| Caché | Activos `/_astro/*` con `immutable`; HTML con `max-age=0, must-revalidate` |

Ejemplo de aserción Lighthouse CI:

```json
{
  "assertions": {
    "largest-contentful-paint": ["error", { "maxNumericValue": 2000 }],
    "interaction-to-next-paint": ["error", { "maxNumericValue": 200 }],
    "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
    "resource-summary:script:size": ["error", { "maxNumericValue": 61440 }]
  }
}
```

## Checklist

- [ ] Lighthouse CI ejecutado en ficha de producto y portada en modo móvil.
- [ ] Tamaño de bundle comparado con la rama principal; sin incremento > 5 KB gz sin justificación.
- [ ] Imágenes con formato, dimensiones y `sizes` correctos.
- [ ] Ninguna isla nueva ni cambio a `client:load` sin medición.
- [ ] Animaciones revisadas con Designer.
- [ ] Analítica fuera del camino crítico.
- [ ] Cabeceras de caché verificadas con DevOps.
- [ ] Resultados registrados en el PR.

## Decisiones que puede tomar

- Elegir `client:visible` frente a `client:idle` para comparador y finder según medición.
- Definir `sizes` y anchos generados por imagen.
- Rechazar una animación o librería que supere el presupuesto.
- Ajustar `prefetch` (hover, viewport) por tipo de enlace.
- Determinar qué imagen es LCP en cada plantilla.

## Decisiones que escalan al Tech Lead

- Cualquier cambio de umbral del presupuesto.
- Aprobación de una nueva librería frontend (con Frontend).
- Introducir Inter variable self-hosted si se demuestra coste aceptable.
- Cambios en `astro.config.mjs` (`inlineStylesheets`, `cssCodeSplit`, `prefetch`).
- Activación de un CDN de imágenes o servicio externo.
