# 00 — Visión de producto: Raiden

> Catálogo real RAIDEN desde el 2026-10-22 ([ADR-015](./21-decisions.md)). Marca y datos de empresa (EG Motors SAC, RUC 20615247384, distribuidor oficial RAIDEN, Bocanegra, Callao) se centralizan en `src/config/site.ts`.

## 1. Visión

Raiden es un **showroom digital de movilidad eléctrica**: una web rápida y mobile-first para descubrir, comparar y configurar bicimotos y trimotos eléctricas RAIDEN (más sus repuestos), y convertir esa intención en una **solicitud de pedido por WhatsApp** que cierra el equipo de ventas. No es una tienda con pasarela de pago; es el escaparate y el embudo previo a la venta asistida.

**Mercado: Perú.** Precios en soles (`PEN`, formato `S/ 1,200`, IGV incluido), locale `es-PE`, licencias de conducir MTC clase B (B-I, B-IIa, B-IIb, B-IIc) cuando aplican, WhatsApp con prefijo `+51` (ventas: +51 989 853 431) y envío a todo el Perú (Lima y provincias). Ver [ADR-014](./21-decisions.md).

## 2. Propuesta de valor

| Para quién | Qué obtiene | Por qué Raiden y no otro |
|---|---|---|
| Comprador particular urbano | Catálogo claro, fichas con especificaciones reales (autonomía, potencia, batería), comparador y buscador guiado | Decide en minutos desde el móvil sin registrarse ni pagar online |
| Negocio de reparto / flota | Trimoto de carga Titan Rhino (250 kg) y bicimotos con datos de carga útil y autonomía | Solicitud de pedido con varias unidades y repuestos en un solo mensaje |
| Equipo de ventas | Mensaje de WhatsApp estructurado con modelo, variante, color, cantidad y total estimado | Cero transcripción manual; la conversación empieza con el pedido ya definido |

## 3. Público objetivo

- **Primario:** personas de 25–45 años en Lima, Callao y otras ciudades del Perú que buscan sustituir el transporte público o el taxi en trayectos cortos con un vehículo que en general no requiere licencia. Compran desde el móvil y comparan precio/autonomía.
- **Secundario:** autónomos y pymes de reparto de última milla (trimoto de carga Titan Rhino).
- **Terciario:** compradores de ocio y clientes existentes que buscan repuestos (baterías, cargadores, motores, controladores).

## 4. Catálogo

| Categoría | Ruta | Ejemplos de atributos clave |
|---|---|---|
| Bicimotos | `/bicimotos` | Golden Eagle (desde S/ 1,200), Royal Tiger (S/ 1,400) y Vortex Kobra (S/ 1,200): 25 km/h, motor 350/500 W, batería Chilwee 48V, autonomía, carga máx. |
| Trimotos | `/trimotos` | Titan Rhino (S/ 2,700): trimoto de carga, 800 W, 250 kg, modo reversa, batería 60V 20Ah |
| Repuestos | `/repuestos` | 26 repuestos: baterías, motores, controladores, cargadores, faros, frenos, cables y mandos; unidad (UND/PAR) y código |

Las bicimotos de 25 km/h en general no requieren licencia (confirmar con el MTC); ver [ADR-015](./21-decisions.md). Cada modelo tiene **versiones** (variantes con `tier`: Estándar 350 W · 48V 12Ah y Premium 500 W · 48V 20Ah), **colores** y **repuestos compatibles**. El catálogo vive en JSON dentro del repositorio en el MVP (git como CMS); ver [01-architecture](./01-architecture.md) y [15-content-strategy](./15-content-strategy.md).

## 5. Flujo completo: DESCUBRIMIENTO → VENTAS

| Paso | Página / componente | Qué ocurre | Evento analítico |
|---|---|---|---|
| 1. Descubrimiento | Home, categorías, blog, SEO | El usuario llega por búsqueda orgánica o enlace y explora categorías con filtros (precio, autonomía, potencia) | `page_view` |
| 2. Producto | `/bicimotos/[slug]`, `/trimotos/[slug]` | Ficha con galería, especificaciones (SpecTile), versiones, colores, repuestos compatibles, FAQ y garantía | `product_view` |
| 3. Comparar | `/comparar` | Hasta 3 modelos lado a lado (CompareTable) con diferencias resaltadas | `compare_add` |
| 4. Configurar | Isla configurador en la ficha | Elección de variante, color y cantidad; precio recalculado al instante | — |
| 5. Carrito | Drawer + `/carrito` | Lista de líneas (vehículos y repuestos), cantidades, total estimado, notas libres | `add_to_cart`, `cart_open` |
| 6. Solicitud de pedido | `/carrito` | Se genera un `OrderRequest` con líneas, total y notas; validación manual de cantidades y texto | `purchase_request` |
| 7. WhatsApp | Botón "Enviar pedido por WhatsApp" | Abre `https://wa.me/<número>?text=<mensaje URL-encoded>` con el mensaje autogenerado | `whatsapp_click` |
| 8. Ventas | Fuera de la web | El equipo confirma disponibilidad, condiciones, entrega y cobro por sus canales | — |

Alternativa al paso 1–2: el buscador **"Encuentra tu moto"** (`/encuentra-tu-moto`) hace 4–5 preguntas (uso, distancia diaria, presupuesto, licencia, necesidad de carga) y ordena el catálogo por puntuación de compatibilidad (`finder_complete`). El detalle del mensaje y del enlace está en [16-whatsapp-commerce](./16-whatsapp-commerce.md); la UX paso a paso en [03-ux](./03-ux.md).

## 6. Alcance del MVP

**Dentro del alcance**

- Catálogo estático generado en build (SSG) con todas las categorías y fichas de producto.
- Comparador (máx. 3), buscador guiado, carrito persistente en `localStorage`, solicitud de pedido por WhatsApp.
- Blog, FAQ, garantía, contacto, páginas legales, 404.
- SEO técnico completo (metadatos, JSON-LD, sitemap, robots), rendimiento con presupuesto y accesibilidad AA.
- Analítica sin cookies (opcional, Cloudflare Web Analytics) tras interfaz agnóstica.

**Fuera del alcance (MVP)**

- Pagos online, cuentas de usuario, favoritos sincronizados, reseñas enviadas por usuarios.
- Panel de administración (futuro con Supabase Auth + RLS; ver [17-admin-panel](./17-admin-panel.md)).
- Stock en tiempo real, financiación, reserva de citas, chat en vivo.
- Multi-idioma y multi-moneda (locale fijo `es-PE`, moneda `PEN`; mercado: Perú).

## 7. KPIs

| KPI | Definición | Objetivo MVP |
|---|---|---|
| Tasa de solicitud | `whatsapp_click` / sesiones | ≥ 3 % |
| Tasa de carrito | `add_to_cart` / `product_view` | ≥ 12 % |
| Uso del finder | `finder_complete` / sesiones que entran en `/encuentra-tu-moto` | ≥ 50 % |
| Uso del comparador | sesiones con `compare_add` ≥ 2 | ≥ 8 % |
| Core Web Vitals (móvil, p75) | LCP / INP / CLS | < 2,0 s / < 200 ms / < 0,1 |
| Tráfico orgánico | Sesiones desde buscadores / mes | Crecimiento mensual > 15 % los primeros 6 meses |
| Calidad del lead | Pedidos de WhatsApp con variante y color definidos | ≥ 90 % |

## 8. Restricciones

- **Coste cero:** Cloudflare Pages (plan gratuito), GitHub, Supabase Free en el futuro. Sin servicios de pago ni CDN de imágenes; optimización con sharp en build.
- **Sin pagos:** ningún dato financiero se recoge ni almacena. El carrito guarda solo identificadores de producto, variante, color, cantidad y notas.
- **Agnóstico del proveedor:** el build es HTML estático; el cambio Cloudflare → Vercel → Netlify → Node se limita a `astro.config.mjs`, cabeceras y variables de entorno ([20-migration](./20-migration.md)).
- **Sin dependencias superfluas:** sin Tailwind, sin librerías UI, sin zod; validadores manuales y Design System propio.
- **Número de WhatsApp** siempre vía `PUBLIC_WHATSAPP_NUMBER`; nunca hardcodeado.

## 9. Referencia conceptual: kayencorp.com

Se tomó como referencia de *categoría* (showroom de vehículos eléctricos con enfoque comercial directo), no como plantilla. Lo que se adopta es la idea: catálogo por tipo de vehículo, ficha con especificaciones técnicas prominentes y conversión hacia un canal de mensajería. Lo que se diferencia: comparador y finder propios, Design System con acento Raiden Blue (`#0142A6`) y fuentes Montserrat + Integral CF, rendimiento con presupuesto, SEO estructurado y arquitectura portable. No se copian textos, imágenes, estructura de navegación ni estilos.

## 10. Glosario

| Término | Definición |
|---|---|
| **Solicitud de pedido** (`OrderRequest`) | Conjunto de líneas del carrito, total estimado y notas que el usuario envía por WhatsApp. No es un pedido confirmado. |
| **Variante** (`ProductVariant`) | Versión comercial de un modelo con precio propio y `tier` (`estandar` o `premium`). |
| **Color** (`ProductColor`) | Acabado disponible para una variante, con nombre y valor hex para el `ColorSwatch`. |
| **Repuesto** (`Part`) | Pieza o complemento con precio, unidad (`UND`/`PAR`) y código propios, ligado a los modelos compatibles. Sustituye a la antigua entidad `Accessory` ([ADR-015](./21-decisions.md)). |
| **Finder** | Buscador guiado "Encuentra tu moto" basado en `RecommendationService`. |
| **Isla** | Componente Preact hidratado en cliente; el resto de la página es HTML estático. |
| **Total estimado** | Suma de líneas según precios publicados; el precio final lo confirma ventas. |
| **SSG** | Generación estática en build (`output: 'static'`). |
| **Raiden Blue** | Color de acento `#0142A6` del Design System ([02-design-system](./02-design-system.md)). |
