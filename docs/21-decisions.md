# 21 — Registro de decisiones de arquitectura (ADR)

Decisiones tomadas por el Tech Lead para el MVP de Raiden. Cada ADR sigue el formato Contexto, Decisión, Alternativas consideradas, Consecuencias, Estado. Las migraciones asociadas se describen en [20-migration](./20-migration.md). Un ADR solo cambia de estado mediante otro ADR que lo sustituya.

## Índice

| ADR | Título | Estado | Fecha |
|---|---|---|---|
| [001](#adr-001--astro-frente-a-nextjs) | Astro frente a Next.js | Aceptada | 2026-08 |
| [002](#adr-002--estático-ssg-frente-a-ssr) | Estático (SSG) frente a SSR | Aceptada | 2026-08 |
| [003](#adr-003--islas-preact) | Islas Preact | Aceptada | 2026-08 |
| [004](#adr-004--sin-tailwind) | Sin Tailwind | Aceptada | 2026-08 |
| [005](#adr-005--repositorio-json-frente-a-supabase-en-el-mvp) | Repositorio JSON frente a Supabase en el MVP | Aceptada | 2026-08 |
| [006](#adr-006--nanostores-para-el-estado) | nanostores para el estado | Aceptada | 2026-08 |
| [007](#adr-007--enlace-whatsapp-frente-a-business-api) | Enlace WhatsApp frente a Business API | Aceptada | 2026-08 |
| [008](#adr-008--sin-pagos-online) | Sin pagos online | Aceptada | 2026-08 |
| [009](#adr-009--cloudflare-pages) | Cloudflare Pages | Aceptada | 2026-08 |
| [010](#adr-010--fuentes-de-sistema) | Fuentes de sistema | Aceptada | 2026-08 |
| [011](#adr-011--sin-cdn-de-imágenes) | Sin CDN de imágenes | Aceptada | 2026-08 |
| [012](#adr-012--nombre-provisional-raiden) | Nombre provisional "Raiden" | Provisional | 2026-08 |

Estados posibles: Propuesta, Aceptada, Provisional, Sustituida por ADR-nnn, Revertida.

---

## ADR-001 — Astro frente a Next.js

**Contexto.** Showroom de catálogo mobile-first con presupuesto de JS < 60 KB gz en ficha de producto, SEO como canal principal y coste cero de hosting. La interactividad se limita a carrito, configurador, comparador y finder.

**Decisión.** Astro 7 con TypeScript strict. Ver [01-architecture](./01-architecture.md).

**Alternativas consideradas.**
- Next.js (App Router): hidratación completa por defecto, runtime de React ~85 KB gz antes de código propio; mejor encaje en Vercel que en Cloudflare Pages.
- SvelteKit: buen rendimiento, pero obliga a un único framework de componentes y a SSR-first.
- Eleventy + JS manual: sin islas tipadas ni optimización de imágenes integrada.

**Consecuencias.** HTML sin JS por defecto; islas solo donde hay interacción. Content collections para el catálogo JSON. Menor ecosistema de componentes listos; el Design System es propio (ADR-004).

**Estado.** Aceptada.

## ADR-002 — Estático (SSG) frente a SSR

**Contexto.** El catálogo cambia pocas veces al día; no hay sesión de usuario ni stock en tiempo real en el MVP. SSR exige un adapter y acopla al runtime del proveedor.

**Decisión.** `output: 'static'` sin adapter. Cualquier hosting de ficheros estáticos sirve `dist/`.

**Alternativas consideradas.**
- SSR con `@astrojs/cloudflare` desde el inicio: TTFB dependiente de Workers, más superficie de fallo, sin beneficio para páginas que no cambian.
- Híbrido inmediato: innecesario sin rutas dinámicas.

**Consecuencias.** Máxima portabilidad y caché. Cambios de datos requieren rebuild (1–2 min). Cuando existan `/admin` o stock vivo se añade adapter y se marcan páginas concretas con `prerender = false` ([20-migration](./20-migration.md) ruta b).

**Estado.** Aceptada.

## ADR-003 — Islas Preact

**Contexto.** Cuatro componentes interactivos (drawer de carrito, añadir-al-carrito/configurador, comparador, finder) necesitan estado compartido y reactividad. El presupuesto de JS es estricto.

**Decisión.** `@astrojs/preact` con `compat: false`. Directivas: `client:load` solo para el botón de carrito en cabecera; `client:visible` para configurador y comparador; `client:idle` para el drawer y el finder.

**Alternativas consideradas.**
- React: ~40 KB gz más que Preact sin aportar nada al caso de uso.
- Solid/Svelte: válidos, pero Preact comparte modelo mental con React, que es el que conoce el equipo.
- Vanilla JS con Web Components: sin reactividad declarativa; más código propio que mantener.

**Consecuencias.** Runtime de ~4 KB gz. Sin `preact/compat`, no se pueden usar librerías React; se asume. Los componentes Preact viven en `src/islands/` y no se mezclan con `.astro`.

**Estado.** Aceptada.

## ADR-004 — Sin Tailwind

**Contexto.** Design System propio con tokens (colores, tipografía fluida, espaciado de 4 px, radios, sombras) definido en [02-design-system](./02-design-system.md). Estilo premium con control fino de cada componente.

**Decisión.** CSS custom properties en `src/styles/tokens.css`, `base.css`, `components.css`; estilos scoped en componentes Astro. Sin Tailwind ni librerías UI.

**Alternativas consideradas.**
- Tailwind: productividad inicial alta, pero los tokens se duplican en la config, las clases largas dificultan la revisión de diseño y añade paso de build.
- Open Props / UnoCSS: dependencias adicionales para lo que cubre un fichero de tokens.

**Consecuencias.** CSS total estimado < 25 KB gz. El Designer y el Frontend comparten un único origen de verdad. Obliga a disciplina de nomenclatura (BEM ligero) documentada en [04-frontend](./04-frontend.md).

**Estado.** Aceptada.

## ADR-005 — Repositorio JSON frente a Supabase en el MVP

**Contexto.** Decenas de productos, editados por el equipo técnico; no hay admin ni pedidos persistidos en el MVP. Supabase Free existe como destino futuro.

**Decisión.** Interfaz `ProductRepository` con implementación `JsonProductRepository` sobre content collections (`src/content/products/*.json`). Git actúa como CMS. `SupabaseProductRepository` queda como adaptador planificado.

**Alternativas consideradas.**
- Supabase desde el día uno: añade dependencia externa al build, claves y latencia sin beneficio hasta que exista admin.
- CMS headless (Sanity, Contentful): coste o límites de plan, lock-in de esquema.

**Consecuencias.** Cambios de catálogo pasan por PR con validación de esquema. Los componentes dependen solo de la interfaz, lo que hace la migración ([20-migration](./20-migration.md) ruta c) un cambio de adaptador.

**Estado.** Aceptada.

## ADR-006 — nanostores para el estado

**Contexto.** El carrito y el comparador deben compartirse entre islas independientes y persistir entre visitas.

**Decisión.** `nanostores` + `@nanostores/persistent` (clave `raiden:cart:v1`) + `@nanostores/preact`. Reducer puro en `src/domain/cart.ts`, testado con Vitest.

**Alternativas consideradas.**
- Context de Preact: no cruza islas sin un padre común.
- Zustand/Redux: más peso; pensados para árboles React completos.
- `localStorage` manual con eventos: reimplementa lo que nanostores ya resuelve en < 1 KB.

**Consecuencias.** Estado tipado y framework-agnóstico. Versionado de la clave (`v1`) permite migraciones de forma. El carrito nunca contiene datos personales.

**Estado.** Aceptada.

## ADR-007 — Enlace WhatsApp frente a Business API

**Contexto.** Ventas cierra por WhatsApp; el cliente quiere recibir la solicitud completa en un mensaje. La Business API exige verificación de empresa, plantillas aprobadas, backend y tokens.

**Decisión.** Enlace `https://wa.me/<número>?text=<mensaje URL-encoded>` generado por `WhatsAppMessageBuilder` ([16-whatsapp-commerce](./16-whatsapp-commerce.md)). Número desde `PUBLIC_WHATSAPP_NUMBER`.

**Alternativas consideradas.**
- WhatsApp Business Cloud API: automatizable y persistente, pero requiere SSR/Edge Function y gestión de secretos; prematuro sin volumen.
- Formulario + email: pierde la inmediatez que pide el negocio.

**Consecuencias.** Cero backend; el usuario envía el mensaje desde su propio WhatsApp (consentimiento implícito y sin tratamiento de datos por nuestra parte). Sin registro automático de pedidos hasta la ruta d de migración.

**Estado.** Aceptada.

## ADR-008 — Sin pagos online

**Contexto.** Vehículos de ticket alto (miles de soles), con financiación, inscripción en SUNARP/placa y entrega que se negocian persona a persona. Integrar pasarela implica PCI, devoluciones y legal de venta a distancia.

**Decisión.** El sitio produce solicitudes de pedido, no ventas. No hay pasarela, ni checkout, ni almacenamiento de datos de pago.

**Alternativas consideradas.**
- Stripe Checkout para señal/reserva: se pospone a post-MVP ("reservas" en [22-roadmap](./22-roadmap.md)) cuando exista backend y CRM.

**Consecuencias.** Superficie de seguridad mínima; `Permissions-Policy: payment=()` en cabeceras. La conversión medible es `whatsapp_click`, no la venta.

**Estado.** Aceptada.

## ADR-009 — Cloudflare Pages

**Contexto.** Coste cero obligatorio, previews por PR, HTTPS automático, CDN global y analítica sin cookies en el mismo proveedor.

**Decisión.** Cloudflare Pages conectado a GitHub ([19-deployment](./19-deployment.md)). Todo lo específico del proveedor se limita a `public/_headers`, `public/_redirects` y la configuración del panel.

**Alternativas consideradas.**
- Vercel Hobby: excelente DX, pero uso comercial fuera del plan gratuito.
- Netlify Starter: equivalente; menor red edge y límites de build más estrictos.
- GitHub Pages: sin cabeceras personalizadas ni previews.

**Consecuencias.** Dependencia nula en código; migración a otro hosting en medio día ([20-migration](./20-migration.md) ruta a). Cambios específicos de Cloudflare requieren revisión DevOps + Tech Lead.

**Estado.** Aceptada.

## ADR-010 — Fuentes de sistema

**Contexto.** LCP < 2,0 s en móvil 4G. Una webfont variable añade ~100 KB y riesgo de CLS.

**Decisión.** `font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` sin descarga. Inter se usa si está instalada; si no, la fuente del sistema.

**Alternativas consideradas.**
- Google Fonts: petición a terceros, CSP más amplia, consentimiento discutido en la UE.
- Inter self-hosted desde el inicio: aceptable, pero se pospone hasta validar LCP con datos reales ([20-migration](./20-migration.md) ruta f).

**Consecuencias.** Render tipográfico ligeramente distinto por plataforma; el Design System define métricas con clamp para que la jerarquía se mantenga. Cero peticiones de fuente.

**Estado.** Aceptada.

## ADR-011 — Sin CDN de imágenes

**Contexto.** Las imágenes de producto son el mayor peso de la ficha. Servicios como Cloudinary o Cloudflare Images tienen límites o coste y acoplan URLs.

**Decisión.** Imágenes en `src/assets/`, optimizadas en build con sharp mediante `<Image>`/`<Picture>` de Astro (AVIF/WebP, `width`/`height`, `sizes`, lazy).

**Alternativas consideradas.**
- Cloudflare Images: 5 USD/mes mínimo y URLs propietarias.
- Cloudinary free: límites de transformaciones y dependencia externa en cada render.

**Consecuencias.** Build más largo a medida que crece el catálogo (mitigado con caché de build de Pages). Las imágenes originales se versionan en git; se fija un máximo de 2.500 px de lado y 1 MB por original.

**Estado.** Aceptada.

## ADR-012 — Nombre provisional "Raiden"

**Contexto.** El cliente no ha confirmado la marca. El código, los dominios de ejemplo y los textos necesitan un nombre para avanzar.

**Decisión.** Usar "Raiden" como nombre provisional, centralizado en `src/config/site.ts` (`siteName`), en la clave `raiden:cart:v1` y en `PUBLIC_SITE_URL`. Ningún componente escribe el nombre literal.

**Alternativas consideradas.**
- Esperar al nombre definitivo: bloquea SEO, contenido y diseño.
- Usar un placeholder genérico ("Marca"): se cuela en capturas y demos.

**Consecuencias.** El cambio de nombre es una edición de `site.ts`, del dominio y de los assets de logotipo; la clave de `localStorage` se conserva para no vaciar carritos. Pendiente: registro de dominio y marca, responsabilidad del cliente.

**Estado.** Provisional, pendiente de decisión del cliente.

## ADR-013 — CSP por cabecera con hashes explícitos (no `security.csp` de Astro)

**Contexto.** Astro 7 incluye `security.csp`, que emite una `<meta http-equiv>` con hashes de `script-src` **y** `style-src`. Las islas usan atributos `style` dinámicos (swatches de color, barra de compatibilidad del finder) que un `style-src` con hashes bloquea (los navegadores ignoran `'unsafe-inline'` cuando hay hashes).

**Decisión.** CSP en `public/_headers` (y `vercel.json`): `script-src 'self'` + hashes sha256 de los 6 scripts inline que genera Astro (runtime de islas + `<script>` de `Header.astro` y `CatalogView.astro`), `style-src 'self' 'unsafe-inline'`. La CI (`build` job) recalcula los hashes de `dist/` y falla mostrando los nuevos si cambian. El CSS de las islas vive en `src/styles/islands.css` (no en JSX) para reducir la superficie inline.

**Alternativas.** `security.csp` nativo (descartado por lo anterior); nonces (requiere SSR); `'unsafe-inline'` en scripts (inaceptable).

**Consecuencias.** Mantenimiento manual de hashes al actualizar Astro o esos dos scripts; detectado automáticamente en CI. Revisar cuando se eliminen los atributos `style` (p. ej. swatches vía clases generadas en build).

**Estado.** Aceptada (2026-08-22).

## ADR-014 — Mercado Perú: moneda PEN y licencias MTC

**Contexto.** El brief inicial asumía España (EUR, formato `es-ES`, carnets AM/A1, prefijo +34, envío peninsular). El cliente opera en el Perú: precios en soles, IGV, licencias de conducir MTC clase B y ventas por WhatsApp con prefijo +51.

**Decisión.** Moneda `PEN` con formato manual `S/ 4,999` (coma de miles, punto decimal) en `src/domain/money.ts`, porque `Intl.NumberFormat('es-PE')` produce resultados inconsistentes entre runtimes (Node, Workers, navegadores). Locale `es-PE` en `site.ts`, JSON-LD y `og:locale`. `LicenseType` pasa a las clases MTC: `sin-licencia`, `B-I`, `B-IIa`, `B-IIb`, `B-IIc`. Número de WhatsApp por defecto `51987654321`; envío "a todo el Perú (Lima y provincias)". Pagos siguen fuera de la web; el asesor puede ofrecer transferencia, Yape o Plin.

**Alternativas.** Mantener EUR y adaptar solo el número (incoherente para el comprador); `Intl` con `es-PE` (descartado por inconsistencia entre runtimes); mantener licencias europeas (no aplican en el Perú).

**Consecuencias.** Contenido, documentación y tests migrados a PEN/es-PE/MTC. Los precios del catálogo son placeholders (×4 sobre los valores originales en euros) pendientes de validación del cliente. Un eventual multi-país queda en el roadmap como i18n de moneda y licencias ([22-roadmap](./22-roadmap.md)).

**Estado.** Aceptada (2026-08-22).

## ADR-015 — Catálogo real RAIDEN: bicimotos, trimotos y repuestos

**Contexto.** El cliente (EG Motors SAC, distribuidor oficial de RAIDEN, Callao) entregó el 2026-10-22 su brief: 4 modelos reales (Golden Eagle, Royal Tiger, Vortex Kobra — bicimotos de 25 km/h; Titan Rhino — trimoto de carga), 26 repuestos, paleta (Raiden Black #111111, Raiden Blue #0142A6, blanco), tipografías (Montserrat + Integral CF), logo, fotos y textos de Nosotros/Contacto/Servicio técnico/Blog. El catálogo anterior (9 modelos ficticios en 7 categorías) era un placeholder.

**Decisión.**
- `CategorySlug` = `bicimotos | trimotos | repuestos`. Rutas: `/bicimotos/[slug]`, `/trimotos/[slug]`, `/repuestos/[slug]`, `/productos` (todo). Se eliminan `/motos-electricas*`, `/accesorios*` y las categorías ficticias.
- Versiones comerciales como variantes con `tier`: Estándar (350 W · 48V 12Ah) y Premium (500 W · 48V 20Ah). Precios del Excel del cliente; se excluyen las filas marca "EG MOTORS". Diego confirmó (2026-10-22) que los precios vigentes son los del Excel tal cual, aunque en Royal Tiger (350 W S/ 1,800 > 500 W S/ 1,400) y Vortex Kobra (350 W S/ 1,500 > 500 W S/ 1,200) la versión Estándar resulta más cara que la Premium; Titan Rhino S/ 2,700. Si el cliente los corrige, basta editar `variants[].price` en los JSON.
- Entidad `Part` (repuestos, unidad UND/PAR) sustituye a `Accessory`; el valor interno de carrito `accessory` se conserva por compatibilidad del estado persistido.
- Pesos y dimensiones pasan a opcionales (el fabricante no los facilita). `features` guarda la lista completa de características.
- Diseño: se mantiene la arquitectura y el layout actual; el acento pasa de lima a Raiden Blue; fuentes autoalojadas Montserrat (OFL) e Integral CF (webfonts entregadas por el cliente; licencia a confirmar con él).
- Contacto: formulario sin backend que compone el mensaje y abre WhatsApp (+51 989 853 431) con alternativa mailto; buscador estático con Pagefind.
- Razón social, RUC, dirección, horario y redes (@egmotors.peru) centralizados en `src/config/site.ts`.

**Consecuencias.** Reescritura de contenido, páginas y tests; los artículos del blog sobre motos de alta potencia se retiran o adaptan a bicimotos. Las fotos reales sustituyen a los SVG placeholder (Astro genera AVIF/WebP).

**Estado.** Aceptada (2026-10-22).

### Addendum ADR-015 (2026-10-23) — ajustes del cliente tras la primera revisión
- **Portada:** fondos alternos negro/blanco (hero y bandas "Raiders"/"Servicio técnico" en negro; catálogo, comunidad y blog en blanco). La marca es **azul**: el logo se muestra en su color sobre fondos claros (cabecera blanca) y, en el pie oscuro, sobre una placa blanca; no se invierte a blanco.
- **Repuestos aparte:** la ficha de un vehículo no ofrece añadir repuestos al pedido; se compran desde `/repuestos`. La sección "Repuestos compatibles" es solo informativa (enlaces).
- **WhatsApp flotante:** visible en móvil y escritorio, solo icono (nombre accesible oculto).
- **Rendimiento con fotografía real:** LCP objetivo 2,5 s (umbral "bueno" de CWV) como aviso en Lighthouse CI; performance ≥ 0,90 como error. Medido 2,5–2,7 s en móvil simulado con imágenes de 14–21 KB: el límite lo marca la cadena de red, no el peso. Fuentes: Montserrat sin corchetes en el nombre (evita doble descarga), un único fichero de Integral CF y fallbacks métricos (`size-adjust`) → CLS 0,002 y "Style & Layout" de 1058 ms a ~120 ms.

## ADR-016 — Solo contenido real: reseñas de Google Maps, tiempo de lectura calculado, ficha por versión

**Contexto.** Revisión de Diego del 2026-10-24. La portada mostraba testimonios de muestra y las fichas de producto traían reseñas inventadas (`reviews` en los JSON, con las que además se emitía `aggregateRating` en el JSON-LD). El tiempo de lectura del blog era un número escrito a mano en el frontmatter. La ficha técnica mezclaba en una misma celda los datos de las versiones Estándar y Premium ("30-35 km (Estándar) · 40-50 km (Premium)") aunque el configurador ya permite elegir versión. El botón flotante de WhatsApp era un círculo plano.

**Decisión.**
- **Testimonios = reseñas públicas reales.** Nueva colección `testimonials` (`src/content/testimonials/google-maps.json`): las 7 reseñas con texto de la ficha de Google Maps de RAIDEN (8 en total, todas 5★; una sin texto no se incluye), copiadas literalmente. Repositorio `repos.testimonials` y dominio `src/domain/testimonials.ts`: `pickTestimonials` destaca las 3 con valoración ≥ 4 y más palabras (criterio de Diego: "las mejores, que comentan más"). La portada enlaza a la ficha de Google (`site.mapsUrl`) y muestra la media y el total. Se eliminan las `reviews` inventadas de los 4 productos; `aggregateRating` solo volverá con reseñas reales por modelo. Nunca se redactan testimonios.
- **Tiempo de lectura real.** `src/domain/reading.ts` calcula `readingMinutes` del cuerpo Markdown (texto legible sin código, HTML, URLs ni marcas; 200 palabras/min; mínimo 1). El campo desaparece del frontmatter y del esquema; lo añade el repositorio (JSON y ejemplo Supabase). Valores actuales: 2–4 min.
- **Ficha técnica por versión.** `src/domain/specTable.ts` construye tiles y tabla con un valor único cuando todas las versiones coinciden y un valor por versión (`byVariant`) cuando difieren (autonomía, potencia, batería, batería extraíble…). El HTML renderiza todos los valores (sin JS se ven etiquetados Estándar/Premium); la isla `ProductConfigurator` marca la raíz con `is-js`, oculta los de la versión no elegida y actualiza el aviso "Datos de la versión X". Sin lógica en componentes: solo dominio + un efecto DOM, como ya hacían las miniaturas de color.
- **WhatsApp flotante.** Sigue siendo solo icono en reposo (addendum ADR-015): degradado verde oficial, halo pulsante (desactivado con `prefers-reduced-motion`), elevación al hover y etiqueta "¿Hablamos por WhatsApp?" que asoma al hover/foco y es el nombre accesible.

**Consecuencias.** Al actualizar reseñas basta copiar las nuevas en el JSON (nota en el propio archivo). Los artículos nuevos no necesitan `readingMinutes`. Las fichas con una sola versión (Titan Rhino) no cambian. Tests: unitarios de dominio (`testimonials`, `reading`, `specTable`) y e2e `product-specs.spec.ts`.

**Estado.** Aceptada (2026-10-24).

## ADR-017 — Promociones (edición EG Motors) separadas del catálogo RAIDEN; galería de clientes 1 a 1; logos de pago

**Contexto.** El Excel del cliente ("Lista de Productos - Pagina Web.xlsx", hoja MOTOS) tiene dos filas con marca **EG MOTORS** (Golden Eagle 500 W a S/ 1,100 y 350 W a S/ 1,400): la misma bicimoto con el logotipo del distribuidor en lugar del de RAIDEN, a precio promocional. ADR-015 las excluyó; Diego pidió el 2026-10-24 separarlas en un apartado propio, "Promociones". También pidió que la galería "Raiders satisfechos" muestre 6 fotos de una en una con flechas, y que el pie lleve los logotipos de Visa, Mastercard y American Express.

**Decisión.**
- Nueva categoría `promociones` (`CategorySlug`, `src/content/categories/promociones.json`, orden 4) con el producto `golden-eagle-eg-motors` (marca "EG Motors", categoría `promociones`, specs idénticas a Golden Eagle, color blanco con la foto del Excel, versiones Premium S/ 1,100 por defecto y Estándar S/ 1,400 tal cual el Excel). Rutas automáticas: `/promociones` y `/promociones/golden-eagle-eg-motors`; "Promociones" es una entrada propia de nivel superior en la cabecera (junto a Productos, Blog…; decisión de Diego: gancho comercial visible sin desplegar), más el tile en portada y el enlace del pie (categorías).
- **Separación:** el catálogo RAIDEN (`/productos`, comparador, buscador, portada: hero y recientes) solo incluye `TYPES = bicimotos | trimotos` (`isCatalogVehicle`); la promoción no compite con los modelos RAIDEN ni aparece en sus listados. Su ficha enlaza como relacionado a la Golden Eagle RAIDEN.
- Galería de clientes: componente `ClientGallery` (pista con scroll-snap, flechas "< foto >", contador, teclado, swipe; sin JS sigue siendo un scroll horizontal). 6 fotos elegidas de las 9 del cliente (`raider-1, 2, 3, 5, 6, 8`); la lista vive en `src/pages/index.astro`.
- Pie: `PaymentLogos` (SVG inline simplificados de Visa, Mastercard y American Express, con nombre accesible) bajo el título "Métodos de pago"; el pago sigue siendo en tienda, no en la web.

**Consecuencias.** Añadir otra promoción = un JSON más con `category: "promociones"`. Tests: `content.test` (5 productos, 4 categorías), e2e `promos-gallery.spec.ts`, cabecera y a11y actualizados.

### Addendum ADR-017 (2026-10-24) — la Premium siempre es la más cara; Estándar por defecto
En el Excel, Royal Tiger (350 W S/ 1,800 / 500 W S/ 1,400), Vortex Kobra (S/ 1,500 / S/ 1,200) y la Golden Eagle EG Motors (S/ 1,400 / S/ 1,100) traían la Premium más barata que la Estándar; el PPT del cliente muestra en todos los modelos la Premium como la cara (p. ej. Royal Tiger S/ 1,500 / S/ 1,900). Diego pidió corregirlo: se **intercambian los importes** de esas filas (Royal Tiger Estándar S/ 1,400 · Premium S/ 1,800; Vortex Kobra S/ 1,200 · S/ 1,500; EG Motors S/ 1,100 · S/ 1,400). Golden Eagle (S/ 1,200 / S/ 1,500) y Titan Rhino (S/ 2,700) no cambian. Además, en todos los modelos la versión por defecto pasa a ser la **Estándar** (coincide con el precio "Desde" de las tarjetas y con lo que añade el "quick add"). Sustituye a la nota de ADR-015 sobre precios "tal cual el Excel". Pendiente de confirmar los importes definitivos con el cliente. Los iconos de redes del pie adoptan el color de cada marca al pasar el ratón y el glifo de WhatsApp pasa al trazado oficial (auricular dentro de la burbuja).

**Estado.** Aceptada (2026-10-24).
