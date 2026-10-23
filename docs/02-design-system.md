# 02 — Design System

Sistema propio, sin Tailwind ni librerías UI. Cuatro ficheros en `src/styles/`: `tokens.css` (custom properties; importa `fonts.css`), `fonts.css` (`@font-face` self-hosted), `base.css` (reset, tipografía, focus, `.surface-dark`) y `components.css` (clases globales `.btn`, `.badge`, `.card`…). `islands.css` contiene los estilos de las islas Preact (extraídos para CSP). Los componentes Astro/Preact solo usan tokens; ningún valor hex fuera de `tokens.css`.

## 0. Marca Raiden (Perú)

Identidad del cliente (manual de marca):

| Color | Hex | Token | Uso |
|---|---|---|---|
| Raiden Black | `#111111` | `--raiden-black` / `--n-950` | Fondo oscuro (showroom, footer, hero), botón `.btn--dark` |
| Raiden Blue | `#0142A6` | `--raiden-blue` / `--accent` | Acento de marca: botón primario, enlaces y texto acentuado sobre claro, badge "Nuevo", anillo de foco en claro |
| Raiden Blue 700 | `#013585` | `--raiden-blue-700` / `--accent-hover` | Hover/pressed del azul |
| Raiden Blue tint | `#7AA7FF` | `--raiden-blue-tint` | **Solo texto/enlaces/badges/foco sobre fondos oscuros** (el azul sólido da 2,1:1 sobre `#111111`) |
| Raiden Blue 100 | `#DDE7F8` | `--raiden-blue-100` | Fondos sutiles sobre claro |
| Raiden White | `#FFFFFF` | `--raiden-white` / `--n-0` | Texto sobre negro o azul; superficies elevadas en claro |

Reglas de combinación: **blanco sobre negro o azul; negro o azul sobre blanco/papel.** Nunca azul sólido como texto sobre negro (usar el tint) ni azul sobre azul.

Tipografía: **Montserrat** (principal) y **Integral CF** (secundaria, solo títulos display). Ver §1.3.

## 1. Tokens (`src/styles/tokens.css`)

### 1.1 Color

```css
:root {
  /* Neutros (papel → tinta). --n-950 = Raiden Black */
  --n-0: #ffffff;  --n-50: #f7f7f5;  --n-100: #efefec; --n-200: #e2e2de;
  --n-300: #c9c9c4; --n-400: #9b9b96; --n-500: #6b6f76; --n-600: #4a4e55;
  --n-700: #2c2f35; --n-800: #1f2124; --n-900: #181a1d; --n-950: #111111;

  /* Marca */
  --raiden-black: #111111;  --raiden-blue: #0142a6;  --raiden-blue-700: #013585;
  --raiden-blue-tint: #7aa7ff;  --raiden-blue-100: #dde7f8;  --raiden-white: #ffffff;

  /* Estado */
  --success: #15704a;  --warning: #8a5a10;  --danger: #c42b2b;

  /* Semánticos (claro por defecto) */
  --bg: var(--n-50);  --bg-elev: var(--n-0);  --bg-sunken: var(--n-100);
  --fg: var(--n-900);  --fg-muted: var(--n-500);  --fg-subtle: var(--n-400);
  --border: var(--n-200);  --border-strong: var(--n-300);
  --accent: var(--raiden-blue);        /* RELLENOS: botón primario, contador del carrito */
  --accent-fg: var(--raiden-white);
  --accent-text: var(--raiden-blue);   /* TEXTO: enlaces, badges, eyebrows acentuados */
  --accent-hover: var(--raiden-blue-700);
  --focus: var(--raiden-blue);
  --electric: var(--raiden-blue);      /* alias histórico de --accent-text */
  --electric-700: var(--raiden-blue-700);

  /* DEPRECATED (se retira en la próxima release) */
  --volt: var(--accent-text);  --volt-ink: var(--accent-fg);

  /* Superficie oscura */
  --dark-bg: var(--raiden-black);  --dark-bg-elev: var(--n-900);
  --dark-fg: var(--n-50);  --dark-fg-muted: var(--n-400);  --dark-border: var(--n-800);
}
```

`.surface-dark` (en `base.css`) redefine: `--bg`, `--bg-elev`, `--fg`, `--fg-muted`, `--border`… y, sobre el acento:

```css
.surface-dark {
  --accent: var(--raiden-blue);          /* los rellenos siguen azul sólido + blanco */
  --accent-fg: var(--raiden-white);
  --accent-text: var(--raiden-blue-tint); /* texto, enlaces y badges pasan al tint */
  --focus: var(--raiden-blue-tint);
  --electric: var(--raiden-blue-tint);
  --success: #4ade80;  --warning: #fbbf24;
}
```

**Separación relleno/texto.** `--accent` siempre es azul sólido con `--accent-fg` blanco (vale en ambas superficies, 9,0:1). `--accent-text` es el azul *para texto* y cambia al tint en oscuro. Un componente que pinta texto azul usa `--accent-text`; uno que pinta un fondo azul usa `--accent` + `--accent-fg`. El `.toast` (siempre oscuro) fija `--accent-text` al tint aunque viva en superficie clara.

**Migración desde "volt".** El acento lima `#D6FF3F` se ha retirado. `--volt` y `--volt-ink` quedan como alias deprecados (`--accent-text` / `--accent-fg`) durante una release para que ningún fichero rompa; cualquier `var(--volt)` restante debe sustituirse por `var(--accent-text)` (texto) o `var(--accent)` (fondo). Pendientes conocidos fuera de `src/styles`: `src/islands/Toaster.tsx` (`color:var(--volt)`), `src/pages/index.astro` (`.hero__eyebrow`, `.how__n` y el glow radial `rgb(214 255 63 / 0.08)`).

### 1.2 Contraste verificado (WCAG, luminancia relativa)

| Par | fg | bg | Ratio | AA |
|---|---|---|---|---|
| Cuerpo sobre papel | `#111315` (`--fg`) | `#F7F7F5` | 17,4:1 | sí |
| Muted sobre papel | `#6B6F76` | `#F7F7F5` | 4,7:1 | sí |
| Enlace azul sobre papel | `#0142A6` | `#F7F7F5` | 8,4:1 | sí |
| Azul sobre blanco | `#0142A6` | `#FFFFFF` | 9,0:1 | sí |
| Botón primario: blanco sobre azul | `#FFFFFF` | `#0142A6` | 9,0:1 | sí |
| Botón oscuro: blanco sobre negro | `#FFFFFF` | `#111111` | 18,9:1 | sí |
| Texto azul tint sobre negro | `#7AA7FF` | `#111111` | 7,9:1 | sí |
| Texto azul tint sobre `--n-900` | `#7AA7FF` | `#181A1D` | 7,3:1 | sí |
| Azul sólido sobre negro (prohibido como texto) | `#0142A6` | `#111111` | 2,1:1 | no |
| Texto claro sobre negro | `#F7F7F5` | `#111111` | 17,6:1 | sí |
| Muted oscuro sobre negro | `#9B9B96` | `#111111` | 6,8:1 | sí |
| `.badge--stock` claro | `#15704A` | `#F7F7F5` | 5,7:1 | sí |
| `.badge--order` claro | `#8A5A10` | `#F7F7F5` | 5,5:1 | sí |
| `.badge--stock` oscuro | `#4ADE80` | `#111111` | 10,8:1 | sí |
| `.badge--order` oscuro | `#FBBF24` | `#111111` | 11,3:1 | sí |
| `.btn--whatsapp` | `#06281A` | `#25D366` | 8,0:1 | sí |

Script de comprobación (sin dependencias): `node -e` con la fórmula de luminancia relativa de WCAG 2.x; reproducir cuando se toque un color de `tokens.css`.

### 1.3 Tipografía

Fuentes self-hosted en `public/fonts/` y declaradas en `src/styles/fonts.css` (`font-display: swap`, `unicode-range` latino):

| Familia | Fichero | Peso | Tamaño |
|---|---|---|---|
| Montserrat (variable, normal) | `montserrat/montserrat-wght.woff2` | `100 900` | 70 KB (subconjunto latino: Basic Latin, Latin-1, Latin Ext-A, puntuación, moneda) |
| Montserrat (variable, italic) | `montserrat/montserrat-italic-wght.woff2` | `100 900` | 74 KB |
| Integral CF | `integral-cf/IntegralCF-Bold.woff2` (único fichero; cubre `400 800`) | `400 800` | 19 KB |

Licencia Montserrat: OFL (`public/fonts/montserrat/OFL.txt`). Integral CF: licencia comercial del cliente.

**Preload (pendiente en `BaseLayout.astro`):** añadir en `<head>` los dos ficheros críticos del primer pintado:

```html
<link rel="preload" href="/fonts/montserrat/montserrat-wght.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/integral-cf/IntegralCF-Bold.woff2" as="font" type="font/woff2" crossorigin />
```

La CSP ya permite `font-src 'self'`. El `@import './fonts.css'` está en la cabecera de `tokens.css`, por lo que BaseLayout no necesita importar nada nuevo.

```css
--font-sans: 'Montserrat', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
--font-display: 'Integral CF', 'Montserrat', system-ui, sans-serif;
--fw-regular: 400; --fw-medium: 500; --fw-semibold: 600; --fw-bold: 700; --fw-extrabold: 800;
--fs-xs: 0.75rem;  --fs-sm: 0.875rem;  --fs-md: 1rem;  --fs-lg: 1.125rem;
--fs-xl:  clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem);   /* 20→24 */
--fs-2xl: clamp(1.5rem, 1.2rem + 1.4vw, 2.25rem);   /* 24→36 */
--fs-3xl: clamp(1.75rem, 1.3rem + 2.2vw, 3rem);     /* 28→48  H1 interior */
--fs-4xl: clamp(2.25rem, 1.5rem + 3.4vw, 4rem);     /* 36→64  H1 hero */
--tracking-tight: -0.02em; --tracking-display: 0.01em; --tracking-caps: 0.08em;
```

Jerarquía (manual de marca → `base.css`):

| Nivel | Familia | Peso | Caja | Token |
|---|---|---|---|---|
| H1 (hero y páginas) | Integral CF | Bold 700 | MAYÚSCULAS, `--tracking-display` | `--fs-3xl` (hero: `--fs-4xl`) |
| H2 | Montserrat | ExtraBold 800 | Normal, `--tracking-tight` | `--fs-2xl` |
| H3 / H4 | Montserrat | SemiBold 600 | Normal | `--fs-xl` / `--fs-lg` |
| Cuerpo | Montserrat | Regular 400 | — | `--fs-md` |
| Botones, labels, badges, tabs | Montserrat | SemiBold 600 | — | `--fs-sm` / `--fs-xs` |
| `.eyebrow`, `.spec-tile__label`, `th` | Montserrat | SemiBold 600 | MAYÚSCULAS, `--tracking-caps` | `--fs-xs` |

Integral CF es una fuente display muy ancha: `--fs-3xl` y `--fs-4xl` se han reducido ~10 % (máximos 48 / 64 px) y no debe usarse por debajo de `--fs-2xl` ni en párrafos. Donde una isla Preact pinte un título con `font-size: var(--fs-4xl)` (p. ej. `.cfg__amount`), sigue en Montserrat salvo que declare `font-family: var(--font-display)`.

### 1.4 Espaciado, radios, sombras, motion

```css
--s-1: 0.25rem … --s-24: 6rem;  --section: clamp(3rem, 2rem + 4vw, 6rem);  --gutter: clamp(1rem, 0.5rem + 2.5vw, 2.5rem);
--container: 80rem; --container-narrow: 48rem; --container-wide: 96rem;
--r-sm: 4px; --r-md: 8px; --r-lg: 12px; --r-xl: 20px; --r-full: 999px;
--sh-1 / --sh-2 / --sh-3: sombras suaves en rgb(17 17 17 / .06–.14);
--ease: cubic-bezier(.2,.7,.2,1); --t-fast: 120ms; --t-base: 200ms; --t-slow: 360ms (0 con prefers-reduced-motion);
--z-header: 50; --z-drawer: 100; --z-toast: 200;
```

### Breakpoints

Las custom properties no funcionan en `@media`; los valores se fijan por convención.

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
| `--fs-xs` | 12 px | Badges, captions, eyebrows, `th` |
| `--fs-sm` | 14 px | Texto secundario, botones, tablas |
| `--fs-md` | 16 px | Cuerpo |
| `--fs-lg` | 18 px | Lead, precio en card |
| `--fs-xl` | 20–24 px | H3, precio en ficha |
| `--fs-2xl` | 24–36 px | H2 |
| `--fs-3xl` | 28–48 px | H1 interior (Integral CF) |
| `--fs-4xl` | 36–64 px | H1 del hero (Integral CF) |

## 2. Superficies clara y oscura

- Tema claro por defecto (papel `#F7F7F5`, tinta `#111315`). La superficie oscura no es un tema global: se aplica por bloque con `.surface-dark` (hero, footer, bandas del showroom) y redefine los tokens semánticos dentro de ese bloque (`color-scheme: dark` incluido).
- **Acento:** azul sólido `#0142A6` como relleno (`--accent`) en ambas superficies; como texto solo sobre claro. Sobre oscuro el texto azul es el tint `#7AA7FF` (`--accent-text`, `--focus`, `--electric`).
- El anillo de foco usa `--focus` con `outline: 3px solid; outline-offset: 2px` (azul en claro, tint en oscuro).
- Las imágenes de producto se sirven sobre `--bg-elev` con un borde `--border` para no depender de fondos de fotografía.

## 3. Componentes

Clases globales en `components.css`. Los componentes estáticos son Astro; los marcados con (isla) son Preact. Todos aceptan `class` adicional y atributos `aria-*`.

| Componente | Props | Variantes | Estados | Accesibilidad |
|---|---|---|---|---|
| **Button** `.btn` | `variant`, `size` (sm/md/lg), `href?`, `type`, `iconStart?`, `iconEnd?`, `loading?` | `primary` (Raiden Blue + blanco), `dark` (Raiden Black + blanco; invertido en `.surface-dark`), `secondary` (borde), `ghost`, `whatsapp` (verde `#25D366` con texto ink; reservado al CTA de pedido/contacto) | hover, active, focus-visible, disabled, loading (spinner + `aria-busy`) | `<a>` si hay `href`, si no `<button>`; área táctil ≥ 44 px; `aria-disabled` en enlaces |
| **Card** `.card` | `as?`, `padding` (none/sm/md), `interactive?` | `flat`, `raised` (sh-1), `outlined` | hover eleva a sh-2 solo si `interactive` | Un único enlace principal; el resto del contenido no anidado en `<a>` |
| **Input** `.input/.select/.textarea` | `label`, `name`, `type`, `hint?`, `error?`, `required?`, `inputmode?` | text, number, tel, email, textarea | focus, invalid, disabled, readonly | `<label for>`, `aria-describedby` para hint/error, `aria-invalid` |
| **Badge** `.badge` | `tone`, `size` | neutral, `stock` (success), `order` (warning), `soon` (`--accent-text`), `new` (Raiden Blue sólido + blanco) | — | Texto visible; nunca color como único significado |
| **Tabs** `.tabs/.tab` | `items[{id,label}]`, `active`, `panelIds` | subrayado | active, hover, focus | Patrón WAI-ARIA tabs; `aria-selected`, `aria-controls` |
| **Drawer** (isla) `.overlay/.drawer` | `side`, `title`, `open`, `onClose` | lateral (≥ 768), hoja inferior (< 768) | open/closed | `role="dialog"` + `aria-modal`, foco inicial en título, `inert` en el resto |
| **Toast** (isla) `.toast` | `message`, `tone`, `action?`, `duration` (4 s) | siempre oscuro (`--n-900`); enlaces en `--accent-text` (tint) | entrada/salida | `role="status"` (`aria-live="polite"`); danger usa `role="alert"` |
| **Table** `.table` | `columns[]`, `rows[]`, `caption`, `stickyHeader?` | compacta, normal, `--sticky` | — | `<caption>`, `<th scope>`; scroll horizontal con `tabindex="0"` |
| **CompareTable** (isla) | `products[]` (máx. 3), `specs[]`, `onRemove` | resaltado de diferencias | vacío, 1–3 productos | Primera columna `<th scope="row">`; cabecera sticky |
| **SpecTile** `.spec-tile` | `icon`, `label`, `value`, `unit?`, `hint?` | inline, tile | — | Icono `aria-hidden`; valor y unidad en el mismo nodo |
| **ProductCard** | `product`, `showCompare?`, `priority?` | estándar, destacada | hover, sin stock (badge "Bajo pedido") | Enlace en el título cubre la card vía pseudo-elemento |
| **ColorSwatch** `.swatch` | `colors[]`, `selected`, `name`, `onChange?` | lista de radios | selected (anillo `--fg`), focus | `<input type="radio">` oculto + nombre de color |
| **QuantityStepper** `.stepper` | `value`, `min` (1), `max` (10), `onChange`, `label` | compacto, normal | min/max alcanzado | botones con `aria-label="Reducir/Aumentar cantidad"` |
| **Choice** `.choice` | chip radio/checkbox | — | checked (fondo `--fg`, texto `--bg`: negro/blanco según superficie), focus | input real superpuesto |

### Notas de implementación por componente

- **Button** `primary`: fondo `--accent`, texto `--accent-fg`, radio `--r-md`, `font-weight: 600`. Hover: fondo `--accent-hover` (`#013585`); active: `translateY(1px)`.
- **Button** `dark`: fondo `--raiden-black`, texto blanco; hover `--n-800`. Dentro de `.surface-dark` se invierte (blanco sobre negro) para seguir siendo "un color de marca sobre el opuesto".
- **Button** `whatsapp`: reservado al CTA de envío de pedido y al botón de contacto; no se usa para nada más. No cambia con la marca.
- **Card** de producto: `aspect-ratio: 4/3` en imagen, `object-fit: contain`, fondo `--bg-elev`.
- **Choice / Swatch / Tabs / Stepper**: estados activos en negro/blanco (`--fg`), no en azul, para reservar el azul al CTA y a los enlaces (regla "un acento por pantalla").
- **Drawer** y **Modal** bloquean el scroll del body con `overflow: hidden` en `<html>`.
- **QuantityStepper** valida en `domain/validation.ts` (`1 ≤ qty ≤ 10` por línea).

## 4. Reglas de uso

1. **Un acento por pantalla.** `primary` (azul) aparece una vez por vista (añadir al carrito / enviar pedido). El resto son `dark`, `secondary` o `ghost`.
2. **Contraste mínimo AA** (4,5:1 texto, 3:1 UI). Azul sólido nunca como texto sobre `--n-950`/`--n-900` (usar `--accent-text`, que ya resuelve al tint en `.surface-dark`).
3. **Espaciado solo con tokens** (`--s-*`). Gaps de grid: `--s-4` móvil, `--s-6` desde `sm`.
4. **Tipografía**: H1 en Integral CF mayúsculas; todo lo demás en Montserrat. Máximo tres tamaños por componente; títulos con `--tracking-tight` a partir de `--fs-2xl` (los H1 usan `--tracking-display`).
5. **Motion**: solo `opacity` y `transform`; respetar `prefers-reduced-motion`.
6. **Iconos**: SVG inline de 20/24 px, `stroke: currentColor`, `aria-hidden="true"` salvo icono-solo con `aria-label`.
7. **Estados vacíos y errores** usan el mismo patrón: icono, título `--fs-lg`, texto `--fg-muted`, una acción `secondary` ([03-ux](./03-ux.md)).
8. **Nuevos componentes** requieren: entrada en esta tabla, estados documentados, revisión del Designer y, si llevan JS, revisión de bundle por Performance.

## 5. Logo y activos de marca

Fuente: `src/assets/brand/` (entregados por el cliente). Derivados generados con sharp (no editar a mano; regenerar desde `logo.png` / `icono.jpg`):

| Fichero | Origen | Uso |
|---|---|---|
| `src/assets/brand/logo-trim.png` (1455×277, transparente) | `logo.png` recortado al contenido | `<Logo variant="full">` — marca + RAIDEN + tagline |
| `src/assets/brand/logo-wordmark.png` (1455×277) | `logo.png` sin la línea del tagline | `<Logo variant="wordmark">` — cabeceras pequeñas |
| `src/assets/brand/logo-mark.png` (316×277) | rayo de `logo.png` | `<Logo variant="mark">` |
| `public/favicon.svg` (4 KB) | `icono.jpg` → alfa por umbral de blanco → PNG 64 px embebido; en `prefers-color-scheme: dark` el `<image>` se invierte a blanco | `<link rel="icon">` |
| `public/favicon-32.png` (1,7 KB) | ídem a 32 px | fallback / `<link rel="alternate icon">` |
| `public/apple-touch-icon.png` (180×180, 8,6 KB) | marca azul sobre blanco al 68 % | iOS |
| `public/og-default.png` (1200×630, 33 KB) | fondo `#111111`, logo en blanco, rayo azul decorativo, texto "Bicimotos eléctricas · Lima, Perú" | Open Graph por defecto |

`src/components/ui/Logo.astro`:

```astro
<Logo />                                  <!-- full, 32 px, azul (header claro) -->
<Logo variant="wordmark" height={28} />   <!-- sin tagline -->
<Logo variant="mark" height={32} />
<Logo invert height={40} />               <!-- blanco: footer / .surface-dark -->
```

Renderiza el PNG con `astro:assets` `<Image>` (`densities 1/2/3`, `loading="eager"`), nombre accesible `alt="Raiden"` (`site.name`), clase `.logo` mantenida; `invert` aplica `filter: brightness(0) invert(1)`. Dejar el espacio de respeto del manual: al menos la altura del rayo alrededor del logo.

Pendientes para Frontend (fuera de `src/styles`): `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` y `<link rel="alternate icon" href="/favicon-32.png">` en `BaseLayout`; en el footer usar `<Logo invert height={40} />`.
