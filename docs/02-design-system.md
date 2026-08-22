# 02 — Design System

Sistema propio, sin Tailwind ni librerías UI. Tres ficheros: `src/styles/tokens.css` (custom properties), `base.css` (reset, tipografía, focus) y `components.css` (clases `.v-*`). Los componentes Astro/Preact solo usan tokens; ningún valor hex fuera de `tokens.css`.

## 1. Tokens (`src/styles/tokens.css`)

```css
:root {
  /* Neutros (base fría, ligeramente azulada) */
  --n-50:  #F7F7F5;  --n-100: #ECEDEB;  --n-200: #D9DBD8;  --n-300: #BDC0BC;
  --n-400: #989C99;  --n-500: #72767A;  --n-600: #53575C;  --n-700: #3A3E43;
  --n-800: #24272B;  --n-900: #161819;  --n-950: #0B0C0F;

  /* Marca */
  --volt:      #D6FF3F;  --volt-600: #B9E41A;  --volt-200: #EEFFB0;
  --blue:      #0B5FFF;  --blue-600: #0848C2;  --blue-200: #C7D8FF;

  /* Semánticos (mismo valor en ambos temas) */
  --success: #22C55E;  --warning: #F59E0B;  --danger: #EF4444;  --info: #38BDF8;

  /* Superficies y texto — tema claro por defecto */
  --bg:        var(--n-50);    /* paper #F7F7F5 */
  --bg-raised: #FFFFFF;
  --bg-sunken: var(--n-100);
  --ink:       #111315;
  --ink-2:     var(--n-600);
  --ink-3:     var(--n-500);
  --line:      var(--n-200);
  --line-strong: var(--n-300);
  --accent:    var(--blue);            /* en claro, volt no contrasta sobre paper */
  --accent-ink: #FFFFFF;
  --focus:     var(--blue);

  /* Tipografía fluida (viewport 360–1536 px) */
  --font-sans: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --fs-2xs: clamp(0.75rem,  0.72rem + 0.10vw, 0.8125rem); /* 12–13 */
  --fs-xs:  clamp(0.8125rem,0.78rem + 0.15vw, 0.875rem);  /* 13–14 */
  --fs-sm:  clamp(0.875rem, 0.84rem + 0.20vw, 1rem);      /* 14–16 */
  --fs-md:  clamp(1rem,     0.95rem + 0.25vw, 1.125rem);  /* 16–18 */
  --fs-lg:  clamp(1.125rem, 1.05rem + 0.40vw, 1.375rem);  /* 18–22 */
  --fs-xl:  clamp(1.375rem, 1.20rem + 0.80vw, 1.875rem);  /* 22–30 */
  --fs-2xl: clamp(1.75rem,  1.40rem + 1.50vw, 2.5rem);    /* 28–40 */
  --fs-3xl: clamp(2.25rem,  1.70rem + 2.40vw, 3.5rem);    /* 36–56 */
  --fs-4xl: clamp(2.75rem,  1.90rem + 3.80vw, 4.5rem);    /* 44–72 */
  --lh-tight: 1.1;  --lh-snug: 1.25;  --lh-base: 1.5;  --lh-loose: 1.65;
  --fw-regular: 400;  --fw-medium: 500;  --fw-semibold: 600;  --fw-bold: 700;
  --tracking-tight: -0.02em;  --tracking-wide: 0.04em;

  /* Espaciado (base 4 px) */
  --sp-1: 0.25rem; --sp-2: 0.5rem;  --sp-3: 0.75rem; --sp-4: 1rem;
  --sp-5: 1.25rem; --sp-6: 1.5rem;  --sp-8: 2rem;    --sp-10: 2.5rem;
  --sp-12: 3rem;   --sp-16: 4rem;   --sp-20: 5rem;   --sp-24: 6rem;
  --container: 80rem;  --gutter: clamp(1rem, 4vw, 2rem);

  /* Radios */
  --r-sm: 4px; --r-md: 8px; --r-lg: 12px; --r-xl: 20px; --r-full: 9999px;

  /* Sombras */
  --sh-1: 0 1px 2px rgb(11 12 15 / .06), 0 1px 1px rgb(11 12 15 / .04);
  --sh-2: 0 4px 12px rgb(11 12 15 / .10), 0 2px 4px rgb(11 12 15 / .06);
  --sh-3: 0 16px 40px rgb(11 12 15 / .18), 0 4px 12px rgb(11 12 15 / .08);

  /* Z-index */
  --z-base: 0; --z-sticky: 10; --z-dropdown: 20; --z-drawer: 30;
  --z-modal: 40; --z-toast: 50;

  /* Motion */
  --ease-out: cubic-bezier(.2,.8,.2,1);  --ease-in-out: cubic-bezier(.4,0,.2,1);
  --dur-fast: 120ms; --dur-base: 200ms; --dur-slow: 320ms;
}

:root[data-theme="dark"] {
  --bg: var(--n-950);  --bg-raised: var(--n-900);  --bg-sunken: #070809;
  --ink: var(--n-50);  --ink-2: var(--n-300);  --ink-3: var(--n-400);
  --line: var(--n-800);  --line-strong: var(--n-700);
  --accent: var(--volt);  --accent-ink: var(--n-950);  --focus: var(--volt);
  --sh-1: 0 1px 2px rgb(0 0 0 / .4);
  --sh-2: 0 4px 12px rgb(0 0 0 / .5);
  --sh-3: 0 16px 40px rgb(0 0 0 / .6);
}

@media (prefers-reduced-motion: reduce) {
  :root { --dur-fast: 0ms; --dur-base: 0ms; --dur-slow: 0ms; }
}
```

### Breakpoints

Las custom properties no funcionan en `@media`; los valores se fijan por convención y se documentan aquí.

| Nombre | Min-width | Uso |
|---|---|---|
| `xs` | 480px | Grid de productos pasa de 1 a 2 columnas |
| `sm` | 768px | Nav horizontal; drawer lateral en vez de hoja inferior |
| `md` | 1024px | Ficha de producto en dos columnas (galería / configurador sticky) |
| `lg` | 1280px | Grid de 4 columnas; comparador con 3 columnas completas |
| `xl` | 1536px | Contenedor a `--container`, márgenes amplios |

### Escala tipográfica

| Token | Rango | Uso |
|---|---|---|
| `--fs-2xs` | 12–13 px | Etiquetas legales, metadatos |
| `--fs-xs` | 13–14 px | Badges, captions, breadcrumbs |
| `--fs-sm` | 14–16 px | Texto secundario, tablas |
| `--fs-md` | 16–18 px | Cuerpo |
| `--fs-lg` | 18–22 px | Lead, precio en card |
| `--fs-xl` | 22–30 px | H3, precio en ficha |
| `--fs-2xl` | 28–40 px | H2 |
| `--fs-3xl` | 36–56 px | H1 interior |
| `--fs-4xl` | 44–72 px | H1 del hero |

## 2. Modo oscuro y claro

- El tema se controla con `data-theme="light|dark"` en `<html>`. **Por defecto: oscuro** (identidad showroom: `#0B0C0F` + volt). Un script inline de 200 bytes en `BaseLayout` lee `localStorage['voltia:theme']` o `prefers-color-scheme` antes del primer pintado para evitar parpadeo.
- El acento cambia de semántica: **volt** solo sobre fondos oscuros (contraste 15,8:1 sobre `#0B0C0F`); en claro el acento es **blue** (`#0B5FFF` sobre paper: 6,1:1). Volt sobre paper no cumple AA y está prohibido.
- Los enlaces usan `--blue` en claro y `--volt-200`/`--volt` en oscuro; el anillo de foco usa `--focus` con `outline: 2px solid; outline-offset: 2px`.
- Las imágenes de producto se sirven sobre `--bg-raised` con un borde `--line` para no depender de fondos de fotografía.

## 3. Componentes

Clases con prefijo `.v-`. Los componentes estáticos son Astro; los marcados con (isla) son Preact. Todos aceptan `class` adicional y atributos `aria-*`.

| Componente | Props | Variantes | Estados | Accesibilidad |
|---|---|---|---|---|
| **Button** | `variant`, `size` (sm/md/lg), `href?`, `type`, `iconStart?`, `iconEnd?`, `loading?` | `primary` (accent), `secondary` (borde), `ghost`, `danger`, `whatsapp` (verde `#25D366` con texto ink) | hover, active, focus-visible, disabled, loading (spinner + `aria-busy`) | `<a>` si hay `href`, si no `<button>`; área táctil ≥ 44 px; `aria-disabled` en enlaces |
| **Card** | `as?`, `padding` (none/sm/md), `interactive?` | `flat`, `raised` (sh-1), `outlined` | hover eleva a sh-2 solo si `interactive` | Un único enlace principal; el resto del contenido no anidado en `<a>` |
| **Input** | `label`, `name`, `type`, `hint?`, `error?`, `required?`, `inputmode?` | text, number, tel, email, textarea | focus, invalid, disabled, readonly | `<label for>`, `aria-describedby` para hint/error, `aria-invalid` |
| **Select** | `label`, `name`, `options[]`, `value?`, `hint?`, `error?` | nativo estilizado | focus, invalid, disabled | `<select>` nativo; flecha decorativa `aria-hidden` |
| **Badge** | `tone` (neutral/volt/blue/success/warning/danger), `size` | sólido, sutil (fondo al 15 %) | — | Texto visible; nunca color como único significado |
| **Tabs** | `items[{id,label}]`, `active`, `panelIds` | subrayado, pastilla | active, hover, focus | Patrón WAI-ARIA tabs; flechas izquierda/derecha; `aria-selected`, `aria-controls` |
| **Modal** | `id`, `title`, `size` (sm/md/lg), `open` | centrado; hoja inferior en móvil (< 768) | open/closed, entrada `--dur-base` | `<dialog>` nativo, `aria-labelledby`, foco atrapado, cierre con Escape y clic fuera; devuelve foco al disparador |
| **Drawer** (isla) | `side` (right/bottom), `title`, `open`, `onClose` | lateral (≥ 768), hoja inferior (< 768) | open/closed; arrastre para cerrar en móvil | `role="dialog"` + `aria-modal`, foco inicial en título, `inert` en el resto |
| **Toast** (isla) | `message`, `tone`, `action?`, `duration` (4 s) | success, info, danger | entrada/salida, pausa en hover | `role="status"` (`aria-live="polite"`); danger usa `role="alert"` |
| **Table** | `columns[]`, `rows[]`, `caption`, `stickyHeader?` | compacta, normal, zebra | — | `<caption>`, `<th scope>`; scroll horizontal en contenedor con `tabindex="0"` y `aria-label` |
| **CompareTable** (isla) | `products[]` (máx. 3), `specs[]`, `onRemove` | resaltado de diferencias on/off | vacío, 1–3 productos | Primera columna `<th scope="row">`; cabecera sticky; botón eliminar con `aria-label="Quitar {modelo}"` |
| **SpecTile** | `icon`, `label`, `value`, `unit?`, `hint?` | inline (fila), tile (cuadrado) | — | Icono `aria-hidden`; valor y unidad en el mismo nodo de texto |
| **ProductCard** | `product`, `showCompare?`, `priority?` | estándar, destacada (imagen grande) | hover, sin stock (badge "Bajo pedido") | Imagen con `alt` descriptivo; enlace en el título cubre la card vía pseudo-elemento; precio con `<data value>` |
| **ColorSwatch** | `colors[]`, `selected`, `name`, `onChange?` | lista de radios | selected, focus, disabled | `<input type="radio">` visualmente oculto + `<label>` con nombre de color; anillo de 2 px en selected |
| **QuantityStepper** | `value`, `min` (1), `max` (10), `onChange`, `label` | compacto (carrito), normal (ficha) | min/max alcanzado (botón disabled) | `<input type="number" inputmode="numeric">` entre dos botones con `aria-label="Reducir/Aumentar cantidad"`; anuncia valor con `aria-live` |

### Notas de implementación por componente

- **Button** `primary`: fondo `--accent`, texto `--accent-ink`, radio `--r-md`, padding `--sp-3 --sp-5`, `font-weight: 600`. Hover: `filter: brightness(.95)`; active: `transform: translateY(1px)`.
- **Button** `whatsapp`: reservado al CTA de envío de pedido y al botón de contacto; no se usa para nada más.
- **Card** de producto: `aspect-ratio: 4/3` en imagen, `object-fit: contain`, fondo `--bg-raised`.
- **Drawer** y **Modal** bloquean el scroll del body con `overflow: hidden` en `<html>` y compensan el ancho de la barra de scroll.
- **QuantityStepper** valida en `domain/validation.ts` (`1 ≤ qty ≤ 10` por línea); el máximo se muestra como hint.

## 4. Reglas de uso

1. **Un acento por pantalla.** `primary` aparece una vez por vista (añadir al carrito / enviar pedido). El resto son `secondary` o `ghost`.
2. **Contraste mínimo AA** (4,5:1 texto, 3:1 UI). Volt nunca sobre fondos claros; blue nunca como texto sobre `--n-950` (usar `--blue-200`).
3. **Espaciado solo con tokens** (`--sp-*`). Gaps de grid: `--sp-4` móvil, `--sp-6` desde `sm`.
4. **Tipografía**: máximo tres tamaños por componente; títulos con `--tracking-tight` a partir de `--fs-2xl`.
5. **Motion**: solo `opacity` y `transform`; nada de animar `height`, `box-shadow` o `filter` de forma continua. Respetar `prefers-reduced-motion`.
6. **Iconos**: SVG inline de 20/24 px, `stroke: currentColor`, siempre `aria-hidden="true"` salvo icono-solo con `aria-label`.
7. **Estados vacíos y errores** usan el mismo patrón: icono, título `--fs-lg`, texto `--ink-2`, una acción `secondary` ([03-ux](./03-ux.md)).
8. **Nuevos componentes** requieren: entrada en esta tabla, clase `.v-*`, estados documentados, revisión del Designer y, si llevan JS, revisión de bundle por Performance ([09-performance](./09-performance.md), [12-accessibility](./12-accessibility.md)).
