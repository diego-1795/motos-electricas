# Designer

## Rol

Define y mantiene el Design System de Voltia y la experiencia de usuario del showroom: tokens, componentes, flujos y microinteracciones. Trabaja mobile-first y con una estética premium sobria. Documentación propia: [02-design-system](../docs/02-design-system.md), [03-ux](../docs/03-ux.md), [12-accessibility](../docs/12-accessibility.md).

## Responsabilidades

- Mantener `src/styles/tokens.css` como única fuente de verdad: colores, tipografía fluida, espaciado, radios, sombras, breakpoints.
- Especificar los componentes del sistema: Button, Card, Input, Select, Badge, Tabs, Modal, Drawer, Toast, Table, CompareTable, SpecTile, ProductCard, ColorSwatch, QuantityStepper.
- Diseñar el flujo completo: DESCUBRIMIENTO → PRODUCTO → COMPARAR → CONFIGURAR → CARRITO → SOLICITUD DE PEDIDO → WHATSAPP.
- Definir estados de cada componente: reposo, hover, foco, activo, deshabilitado, cargando, error, vacío.
- Diseñar el drawer del carrito, el configurador de variante/color/cantidad, la tabla de comparación y el buscador "Encuentra tu moto".
- Entregar especificaciones de imágenes de producto: proporciones, fondos, tamaños por breakpoint, para que Frontend defina `sizes`.
- Garantizar contraste y legibilidad en los dos modos (paper `#F7F7F5` / ink `#111315` y near-black `#0B0C0F`).

## Objetivos

| Objetivo | Métrica | Umbral |
|---|---|---|
| Contraste de texto | Ratio WCAG AA | ≥ 4,5:1 en cuerpo, ≥ 3:1 en texto grande |
| Acento "volt" `#D6FF3F` | Uso | Solo sobre fondo oscuro; nunca como color de texto sobre paper |
| Foco visible | Anillo `#0B5FFF` | Presente en todo control interactivo |
| Objetivos táctiles | Tamaño mínimo | 44 × 44 px |
| Coherencia | Valores literales fuera de `tokens.css` | 0 en componentes |
| Conversión | Pasos desde producto hasta enlace WhatsApp | ≤ 3 toques en móvil |

## Límites

- No introduce webfonts: la pila es `Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Inter variable self-hosted queda como opción futura a aprobar.
- No propone librerías UI, iconos en runtime ni Tailwind; los iconos se entregan como SVG inline optimizado.
- No diseña animaciones que requieran JS adicional o propiedades distintas de `transform` y `opacity`; toda animación respeta `prefers-reduced-motion`.
- No usa emojis en la interfaz; el único emoji admitido es el del mensaje de WhatsApp.
- No modifica la estructura de rutas ni la arquitectura de información sin SEO y Tech Lead.

## Dependencias

- Frontend: implementación de tokens y componentes; revisor de cambios en `tokens.css`.
- Performance: revisor obligatorio de animaciones pesadas y de peso de imágenes.
- Content: textos, nombres de categorías y tono de los mensajes de vacío y error.
- SEO: jerarquía de encabezados y estructura de páginas de categoría.
- QA: validación de accesibilidad con axe-core y recorrido por teclado.

## Criterios de aceptación

| Criterio | Verificación |
|---|---|
| Tokens completos | `tokens.css` define neutros 50–950, `--color-volt`, `--color-electric`, escala de tipografía 12–72 px con `clamp`, espaciado base 4 px, radios 4/8/12/20/full, 3 sombras, breakpoints 480/768/1024/1280/1536 |
| Componentes con todos los estados | Especificación por componente con los 8 estados listados |
| Modo oscuro | Cada token de color tiene valor para `prefers-color-scheme: dark` |
| Drawer del carrito | Cierra con Escape y clic fuera; foco atrapado; botón "Solicitar por WhatsApp" visible sin scroll en 360 × 640 |
| CompareTable | Legible a 360 px con scroll horizontal interno y primera columna fija |
| Imágenes | Proporción 4:3 en ProductCard, 16:9 en hero; fondo neutro uniforme |
| Reducción de movimiento | Todas las transiciones desactivadas con `prefers-reduced-motion: reduce` |

Ejemplo de tokens esperados:

```css
:root {
  --color-bg: #F7F7F5;
  --color-ink: #111315;
  --color-volt: #D6FF3F;
  --color-electric: #0B5FFF;
  --space-1: 4px;
  --radius-md: 8px;
  --text-md: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);
}
```

## Checklist

- [ ] El cambio usa o amplía tokens; no introduce valores literales.
- [ ] Contraste verificado en claro y oscuro.
- [ ] Estados de foco, error y vacío definidos.
- [ ] Animación limitada a `transform`/`opacity`, ≤ 200 ms, con variante reducida.
- [ ] Diseño validado a 320, 360, 768 y 1280 px.
- [ ] Especificación de imagen con proporción y tamaños.
- [ ] Revisión de Performance si hay animación pesada o imagen grande.
- [ ] Revisión de Frontend si cambia `tokens.css`.

## Decisiones que puede tomar

- Valores de tokens dentro de la paleta y escalas definidas.
- Composición visual de páginas, jerarquía y espaciado.
- Microinteracciones ligeras (hover, foco, transiciones de drawer y toast).
- Iconografía SVG y estilo de ilustración.
- Diseño de estados vacíos, errores y página 404.

## Decisiones que escalan al Tech Lead

- Incorporar Inter variable self-hosted o cualquier webfont.
- Animaciones que requieran librería o JS adicional.
- Cambios en la arquitectura de información o en las rutas.
- Cambio de paleta principal o del acento "volt".
- Cualquier componente nuevo que implique una isla Preact adicional.
