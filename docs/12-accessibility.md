# 12 — Accesibilidad

Objetivo: conformidad WCAG 2.2 nivel AA en todas las páginas públicas, verificada de forma automática (axe-core en E2E, Lighthouse) y manual (teclado, lector de pantalla). La accesibilidad es además además un requisito de buenas prácticas para comercio electrónico en el Perú (Ley 29973 y su reglamento sobre accesibilidad en servicios públicos y privados). Ver [02-design-system](./02-design-system.md), [03-ux](./03-ux.md), [04-frontend](./04-frontend.md) y [11-testing](./11-testing.md).

## 1. Principios

- HTML semántico primero; ARIA solo cuando el elemento nativo no basta.
- Todo funciona sin JavaScript salvo las islas, y dentro de ellas todo funciona con teclado.
- Mobile-first: objetivos táctiles amplios, texto legible sin zoom, sin dependencia de hover.
- El estado nunca se comunica solo con color: icono, texto o patrón adicional.

## 2. Semántica HTML

- Una `<main>` por página, `<header>` con `<nav aria-label="Principal">`, `<footer>` con `<nav aria-label="Pie">`.
- Un único `<h1>`; secciones con `<section aria-labelledby>` y `<h2>`.
- Grid de productos: `<ul>` con `<li>` por tarjeta; el nombre del producto es el único enlace de la tarjeta (área clicable ampliada con pseudo-elemento), sin enlaces duplicados.
- Specs: `<dl>`/`<dt>`/`<dd>` (SpecTile) o `<table>` (CompareTable).
- Breadcrumbs: `<nav aria-label="Ruta"><ol>` con `aria-current="page"` en el último.
- Precio: `<p>` con texto completo "S/ 21,996" sin separar símbolo en `<span>` sin sentido para lectores.
- Enlace "Saltar al contenido" como primer elemento enfocable, visible al recibir foco.
- `<html lang="es">` en `BaseLayout`; `lang` distinto solo en fragmentos en otro idioma.

## 3. Navegación por teclado

- Orden de tabulación = orden visual. Sin `tabindex` > 0.
- Todo control interactivo es `<a href>`, `<button>`, `<input>`, `<select>` o `<textarea>`; nunca `<div onClick>`.
- Menú móvil: `<button aria-expanded aria-controls>`; `Escape` cierra.
- Selector de color/variante: grupo de `<button aria-pressed>` dentro de `<fieldset><legend>`; flechas opcionales, Tab obligatorio.
- QuantityStepper: `<input type="number" inputmode="numeric" min="1" max="10">` con botones "−"/"+" etiquetados (`aria-label="Reducir cantidad"`); flechas arriba/abajo nativas.
- Enlace wa.me: `<a>` real, no `<button>` con `window.open`.

## 4. Foco visible

Estilo global en `base.css`, nunca `outline: none` sin sustituto:

```css
:focus-visible {
  outline: 3px solid var(--color-focus); /* #0B5FFF */
  outline-offset: 2px;
  border-radius: var(--radius-4);
}
[data-theme="dark"] :focus-visible { outline-color: var(--color-volt); } /* #D6FF3F sobre fondo oscuro */
```

Cumple WCAG 2.2 2.4.11 (foco no oscurecido): los elementos sticky (cabecera, barra de "Añadir" en producto) reservan `scroll-padding` para que el foco nunca quede tapado.

## 5. Contraste

Ratios aproximados (WCAG AA: 4,5:1 texto normal, 3:1 texto grande ≥ 24 px o 19 px negrita y componentes UI).

| Primer plano | Fondo | Ratio aprox. | Uso permitido |
|---|---|---|---|
| Ink `#111315` | Paper `#F7F7F5` | 17,4:1 | Texto principal (claro) |
| Paper `#F7F7F5` | Near-black `#0B0C0F` | 18,3:1 | Texto principal (oscuro) |
| Volt `#D6FF3F` | Near-black `#0B0C0F` | 17,0:1 | Acento, CTA, foco en oscuro |
| Ink `#111315` | Volt `#D6FF3F` | 16,2:1 | Texto sobre botón volt |
| Azul `#0B5FFF` | Paper `#F7F7F5` | 4,8:1 | Enlaces y foco en claro (AA texto normal) |
| Blanco `#FFFFFF` | Azul `#0B5FFF` | 5,1:1 | Botón primario azul |
| Azul `#0B5FFF` | Near-black `#0B0C0F` | 3,8:1 | Solo componentes UI/texto grande en oscuro; texto normal usa volt |
| Neutro 600 `~#5F6368` | Paper `#F7F7F5` | 5,6:1 | Texto secundario |
| Neutro 400 | Paper | < 4,5:1 | Prohibido para texto; solo bordes/decoración |
| Volt `#D6FF3F` | Paper `#F7F7F5` | ~1,1:1 | Prohibido: nunca volt sobre claro |

Reglas: el Designer valida cada par nuevo con un comprobador antes de añadirlo a `tokens.css`; los Badge de estado (stock, oferta) llevan texto, no solo color; placeholder de inputs ≥ 4,5:1.

## 6. Formularios

- Cada campo con `<label for>` visible; sin placeholder como única etiqueta.
- Errores: texto junto al campo, `aria-describedby`, `aria-invalid="true"`, resumen con foco al primer error al enviar. No solo borde rojo.
- Textarea de notas: `maxlength="300"` + contador `aria-live="polite"`.
- Finder: cada pregunta es `<fieldset><legend>` con `<input type="radio">`; progreso "Pregunta 2 de 4" en texto; se puede volver atrás.
- `autocomplete` adecuado en contacto (`name`, `email`, `tel`).
- Botón de envío nunca deshabilitado por defecto; se valida al pulsar (WCAG 3.3.7 entrada redundante: no se repiten datos ya dados).

## 7. Drawer y Modal

- `<dialog>` nativo con `showModal()` cuando esté disponible; fallback `role="dialog" aria-modal="true"`.
- `aria-labelledby` apuntando al título ("Tu solicitud de pedido").
- Focus trap: al abrir, foco al primer elemento interactivo (botón cerrar); Tab/Shift+Tab circulan dentro; `Escape` y clic en el fondo cierran.
- Al cerrar, el foco vuelve al elemento que lo abrió (referencia guardada en la isla).
- Fondo con `inert` (o `aria-hidden`) mientras está abierto; scroll del body bloqueado.
- Animación de entrada desactivable (apartado 12).

## 8. Toast

- Contenedor permanente `<div role="status" aria-live="polite" aria-atomic="true">` montado en el DOM desde el inicio (las regiones live creadas dinámicamente no siempre se anuncian).
- Mensaje breve: "ODIN 1.0 añadida a tu solicitud" con enlace "Ver carrito".
- Visible ≥ 5 s, pausa al hover/foco, cierre manual disponible. No roba el foco.
- Errores críticos usan `role="alert"` (`assertive`).

## 9. Tabs

Ficha de producto (Descripción / Especificaciones / FAQ): en MVP sin JS se renderizan como secciones apiladas con `<h2>` y enlaces ancla. Si se convierte en Tabs interactivas: `role="tablist"`, `role="tab"` con `aria-selected` y `aria-controls`, `role="tabpanel"` con `aria-labelledby`, navegación con flechas izquierda/derecha, `Home`/`End`, foco en el tab activo (roving tabindex). El contenido de cada panel existe en el HTML para SEO.

## 10. CompareTable

- `<table>` con `<caption>` ("Comparativa de 3 motos eléctricas").
- Primera fila `<th scope="col">` con nombre e imagen del producto; primera columna `<th scope="row">` con el nombre del atributo.
- Columna de atributos fija en móvil (`position: sticky`) y desplazamiento horizontal con indicación visual; la tabla está dentro de un contenedor `tabindex="0"` con `aria-label` para poder desplazarla con teclado.
- Diferencias resaltadas con negrita + icono, no solo color. Botón "Quitar" por producto con `aria-label="Quitar ODIN 1.0 de la comparativa"`.
- Unidades en la cabecera de fila ("Autonomía (km)"), no repetidas en cada celda.

## 11. Imágenes

- `alt` específico: "ODIN 1.0 en color negro, vista lateral". Sin "imagen de", sin repetir el título adyacente.
- Decorativas (patrones, iconos junto a texto): `alt=""` o SVG con `aria-hidden="true"`.
- Iconos funcionales solos (carrito, cerrar): `<button aria-label>` y SVG `aria-hidden`.
- ColorSwatch: `<button aria-pressed aria-label="Color negro">`; el nombre del color siempre visible o en tooltip accesible.
- Texto nunca incrustado en imágenes (precios, claims).

## 12. Movimiento reducido

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

Sin autoplay, sin parallax, sin animaciones > 5 s sin control de pausa. Galería de producto con control manual.

## 13. Tamaño táctil y tipografía

- Objetivos interactivos ≥ 44×44 px (Button, ColorSwatch, QuantityStepper, iconos de cabecera) y separación ≥ 8 px (WCAG 2.2 2.5.8 exige 24 px; adoptamos 44 px por ergonomía móvil).
- Tamaño base 16 px, escala fluida con `clamp`; el sitio funciona a 200 % de zoom y a 320 px de ancho sin scroll horizontal.
- Interlineado ≥ 1,5 en párrafos; longitud de línea ≤ 75 caracteres.
- Arrastrar nunca es la única forma de actuar (2.5.7): la galería tiene flechas.

## 14. Pruebas

| Tipo | Herramienta | Frecuencia |
|---|---|---|
| Automática | axe-core en Playwright (`wcag2a`, `wcag2aa`, `wcag22aa`) sobre todas las plantillas, drawer abierto y cerrado | Cada PR |
| Automática | Lighthouse accesibilidad = 100 | Cada PR |
| Manual teclado | Flujo crítico completo solo con teclado (Tab, Enter, Espacio, Escape, flechas) | Cada release |
| Lector de pantalla | VoiceOver (iOS Safari) y NVDA (Windows Firefox) en home, producto, carrito, finder | Cada release y en cada nueva isla |
| Zoom y reflow | 200 % y 400 % en Chrome; 320 px de ancho | Cada release |
| Contraste | Comprobador en cada par nuevo de tokens | Al cambiar el DS |
| Movimiento | `prefers-reduced-motion` activado en macOS/iOS | Al añadir animación |

Los tests manuales se registran en la PR con una lista de comprobación y el navegador/lector usados.

## 15. Checklist por componente

| Componente | Comprobaciones |
|---|---|
| Button | Elemento `<button>`/`<a>`; texto o `aria-label`; 44 px; foco visible; estado `aria-disabled` con explicación |
| Card / ProductCard | Un solo enlace; `alt` de imagen; precio en texto; orden de lectura lógico |
| Input / Select | `<label for>`; error con `aria-describedby`; `autocomplete`; contraste de placeholder |
| Badge | Texto legible (no solo color); no interactivo; contraste ≥ 4,5:1 |
| Tabs | Roles ARIA, flechas, roving tabindex, contenido en HTML |
| Modal / Drawer | `aria-modal`, título, focus trap, retorno de foco, `Escape`, fondo `inert` |
| Toast | `role="status"` permanente, sin robar foco, ≥ 5 s, cierre manual |
| Table / CompareTable | `caption`, `scope`, contenedor desplazable enfocable, diferencias no solo por color |
| SpecTile | `<dl>`; unidades en texto; icono `aria-hidden` |
| ColorSwatch | `aria-pressed`, nombre del color, 44 px, foco visible sobre cualquier color |
| QuantityStepper | Input numérico etiquetado, botones con `aria-label`, límites anunciados |
| Finder | `fieldset/legend`, progreso textual, volver atrás, resultados con `<h2>` y anuncio `aria-live` |
| Cabecera / menú | `nav aria-label`, `aria-expanded`, `Escape`, skip link |
| Enlace WhatsApp | `<a>` con texto "Enviar pedido por WhatsApp", `rel="noopener"`, aviso de que abre otra aplicación |
