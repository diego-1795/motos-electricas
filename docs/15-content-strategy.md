# 15 — Estrategia de contenidos

Raiden (nombre provisional) vende movilidad eléctrica con un showroom digital cuya conversión termina en WhatsApp. El contenido tiene tres funciones: posicionar en buscadores ([08-seo](./08-seo.md)), resolver dudas antes de que lleguen a ventas y dar la información técnica necesaria para que el cliente configure bien su pedido ([16-whatsapp-commerce](./16-whatsapp-commerce.md)). En el MVP el contenido se gestiona como ficheros JSON en el repositorio (git como CMS, ver [17-admin-panel](./17-admin-panel.md)).

## 1. Tono y voz de marca

| Rasgo | Sí | No |
|---|---|---|
| Registro | Tú, cercano pero profesional | Usted; jerga de concesionario |
| Precisión | Cifras con unidad y condición ("hasta 120 km a 45 km/h") | "Gran autonomía" |
| Honestidad | Indicar que la autonomía declarada depende de peso y vía | Promesas absolutas |
| Longitud | Frases cortas, un dato por frase | Párrafos de marketing |
| Vocabulario | Bicimoto eléctrica, trimoto eléctrica de carga, batería Chilwee de plomo-ácido, versión Estándar / Premium, repuestos originales, Servicio técnico RAIDEN | Anglicismos innecesarios ("e-bike", "scooter"); "moto eléctrica" para referirse a las bicimotos |
| Velocidad y licencia | "25 km/h; en general no requiere licencia ni placa; verifica con el MTC o tu municipalidad" | Afirmaciones absolutas ("no necesitas brevete"), números de leyes o decretos, "80 km/h", clases B-IIa/B-IIb (solo como contraste en el artículo de licencia) |
| Llamada a la acción | "Cotiza por WhatsApp", "Pruébala en tienda" | "Compra ahora" (no hay pago online) |

Keywords de referencia (Perú, ADR-015): "bicimoto eléctrica Lima", "bicimoto eléctrica precio Perú", "bicimoto 500w", "bicimoto 350w", "bicimoto eléctrica sin licencia", "repuestos bicimoto", "batería Chilwee 48V", "trimoto eléctrica carga", "trimoto eléctrica Perú". Secundarias: "cómo manejar una bicimoto eléctrica", "cuánto cuesta cargar una bicimoto", "bicimoto para delivery". Detalle por página en [08-seo](./08-seo.md).

Claim de marca: "The Future of Power" (`site.tagline`). Claims por modelo en `claim` de cada ficha ("Escoge la libertad que te impulsa", "Define la forma de moverte").

Datos fijos que todo contenido debe respetar (fuente: ficha del fabricante, 2026-10-22): velocidad máxima 25 km/h; motor 350 W (Estándar) o 500 W (Premium), 800 W en Titan Rhino; batería Chilwee plomo-ácido 48V 12Ah / 48V 20Ah (60V 20Ah en Titan Rhino); autonomía 30-35 km / 40-50 km (35-40 km Titan Rhino); carga 6-8 h a 220 V; vida útil 2 años o 350-400 ciclos; carga máxima 150 kg (250 kg Titan Rhino); garantía 12 meses en batería y motor; precios desde S/ 1,200 (Golden Eagle, Vortex Kobra), S/ 1,400 (Royal Tiger) y S/ 2,700 (Titan Rhino), IGV incluido.

## 2. Taxonomía del catálogo

| Categoría | Slug | Descripción | Licencia |
|---|---|---|---|
| Bicimotos | `bicimotos` | Bicimotos eléctricas de baja velocidad (25 km/h): Golden Eagle, Royal Tiger, Vortex Kobra. Versiones Estándar (350 W · 48V 12Ah) y Premium (500 W · 48V 20Ah) | En general no requiere (verificar MTC / municipalidad) |
| Trimotos | `trimotos` | Trimotos eléctricas de carga (25 km/h): Titan Rhino, 800 W, 250 kg | En general no requiere; confirmar uso comercial |
| Repuestos | `repuestos` | 26 repuestos originales: baterías Chilwee, cargadores, motores, controladores, frenos, llantas, iluminación, mandos, seguridad | — |

La página `/productos` agrupa todo el catálogo (ADR-015). Las categorías anteriores (scooters, motos urbanas, vehículos de carga, cuatrimotos, accesorios) se eliminaron junto con el catálogo ficticio.

## 3. Ficha de producto

### Campos obligatorios (`src/content/products/<slug>.json`)

| Campo | Tipo | Notas |
|---|---|---|
| `slug` | string | kebab-case, igual al nombre de fichero |
| `name` | string | Nombre comercial, p. ej. "ODIN 1.0" |
| `brand` | slug de `brands` | — |
| `category` | slug de categoría | — |
| `summary` | string ≤ 160 caracteres | Usado en ProductCard y meta description |
| `description` | string (Markdown simple) | 2–4 párrafos |
| `priceFrom` | número (céntimos de sol, PEN; IGV incluido indicado en `priceNote`) | Precio de la variante más barata |
| `variants[]` | ProductVariant | Al menos una |
| `colors[]` | ProductColor | Al menos uno |
| `specs` | objeto | Ver estructura siguiente |
| `images[]` | rutas en `src/assets/products/` | Primera = principal |
| `license` | `"sin-licencia" \| "B-I" \| "B-IIa" \| "B-IIb" \| "B-IIc"` | Clases MTC |
| `warrantyMonths` | número | Vehículo; batería en `specs.battery.warrantyMonths` |
| `status` | `"draft" \| "published" \| "discontinued"` | Solo `published` se construye |
| `seo` | `{ title?, description? }` | Opcional, sobrescribe los generados |

### Estructura de `specs`

| Grupo | Claves | Ejemplo |
|---|---|---|
| `motor` | `powerNominalW`, `powerPeakW`, `type` | 3000, 5000, "hub" |
| `battery` | `voltage`, `capacityAh`, `chemistry`, `removable`, `warrantyMonths` | 72, 50, "LiFePO4", true, 24 |
| `range` | `declaredKm`, `conditions` | 120, "45 km/h, 75 kg, llano" |
| `speed` | `maxKmh`, `limited` | 45, true |
| `charging` | `hoursFull`, `chargerW`, `plug` | 6, 900, "Schuko" |
| `weight` | `kg`, `maxLoadKg` | 95, 150 |
| `license` | `required`, `homologation` | "B-IIa", "L3e" |
| `warranty` | `vehicleMonths`, `batteryMonths` | 24, 24 |

Los valores se almacenan como números sin unidad; `SpecTile` formatea con `Intl.NumberFormat('es-PE')` y la unidad. El comparador ([03-ux](./03-ux.md)) usa las mismas claves.

## 4. Nomenclatura de variantes y colores

- Variante = combinación de batería que altera precio o autonomía. Nombre: `<voltaje>V <capacidad>Ah`, p. ej. `72V 50Ah`. Si la diferencia es de motor: `<potencia>W` (`3000W`). Slug de variante: `72v-50ah`.
- Color: nombre en español con mayúscula inicial y código hexadecimal para `ColorSwatch`: `{ "name": "Negro mate", "hex": "#1A1A1A", "slug": "negro-mate" }`. Nombres cerrados: Negro, Negro mate, Blanco, Gris, Rojo, Azul, Verde, Amarillo, Naranja, Plata. Variantes compuestas usan "/" : "Negro / Volt".
- Un color puede restringirse a variantes concretas mediante `availableFor: ["72v-50ah"]`.
- SKU interno opcional: `<marca>-<modelo>-<variante>-<color>` en mayúsculas para el equipo de ventas; no se muestra.

## 5. Fotografía

| Requisito | Valor |
|---|---|
| Fondo | Blanco neutro (#FFFFFF) para principal y colores; ambiente urbano real para secundarias |
| Ratio | 4:3 para principal y galería; 1:1 para swatches de color; 16:9 para hero de categoría |
| Resolución mínima | 2000 px en el lado largo (principal), 1200 px (galería) |
| Formato de origen | JPEG calidad 90 o PNG; la conversión a AVIF/WebP la hace el build |
| Peso máximo de origen | 3 MB |
| Vista mínima | Lateral izquierdo, lateral derecho, 3/4 frontal, detalle de cuadro, detalle de batería |
| Nombre de fichero | `<slug>-<color-slug>-<vista>.jpg` → `odin-1-0-negro-lateral.jpg` |
| Ubicación | `src/assets/products/<slug>/` |
| `alt` | Obligatorio, descriptivo: "ODIN 1.0 en negro, vista lateral izquierda" |

Sin texto ni marcas de agua en las imágenes. Las fotos del proveedor se renombran antes de entrar en el repositorio.

## 6. Blog

Pilares de contenido: (1) Guías de uso y normativa de bicimotos, (2) Batería de plomo-ácido y mantenimiento, (3) Comparativas entre modelos del catálogo, (4) Ahorro frente a pasaje y gasolina, (5) Uso profesional (reparto y carga). Los artículos 1-3 los redactó el cliente (EG Motors, 2026-10-22) y se publican casi literalmente; el resto los adapta el equipo de contenidos a partir del catálogo real.

Calendario editorial vigente (`src/content/blog/<slug>.md`):

| Publicación | Slug | Categoría | Pilar | Enlaza a |
|---|---|---|---|---|
| 2026-10-23 | `necesito-licencia-para-una-bicimoto-electrica-en-peru` | legislacion | 1 | Bicimotos, Titan Rhino, Encuentra tu moto |
| 2026-10-27 | `como-cuidar-la-bateria-de-tu-bicimoto-electrica` | baterias | 2 | Repuestos (baterías, cargadores), Servicio técnico |
| 2026-10-30 | `bicimoto-electrica-que-es-como-funciona-y-ventajas` (cliente) | guias | 1 | /bicimotos |
| 2026-11-03 | `cuanto-cuesta-cargar-una-bicimoto-electrica-en-peru` | autonomia | 4 | Golden Eagle, Vortex Kobra, Titan Rhino |
| 2026-11-06 | `como-elegir-una-bicimoto-electrica` (cliente) | compra | 1 | /bicimotos |
| 2026-11-10 | `mantenimiento-de-una-bicimoto-electrica-que-revisar` | mantenimiento | 2 | Repuestos, Servicio técnico, Garantía |
| 2026-11-13 | `como-manejar-una-bicimoto-electrica-manual-para-principiantes` (cliente) | guias | 1 | /bicimotos |
| 2026-11-17 | `bicimoto-o-trimoto-electrica-para-reparto-y-carga` | comparativas | 3 / 5 | Royal Tiger, Titan Rhino, Comparar |

Próximos temas propuestos (pendientes de aprobación del cliente): "Golden Eagle, Royal Tiger o Vortex Kobra: en qué se diferencian" (comparativas), "Estándar o Premium: cuál elegir" (compra), "Cómo cambiar la batería Chilwee de tu bicimoto" (mantenimiento), "Guía de repuestos RAIDEN: qué se desgasta y cuánto cuesta" (mantenimiento).

Formato: 600–900 palabras (los artículos del cliente conservan su extensión original), H2 cada 150–250 palabras, una tabla o lista de datos, CTA final con enlace interno (`/bicimotos`, `/trimotos/titan-rhino`, `/repuestos`, `/servicio-tecnico`, `/encuentra-tu-moto`, `/comparar`). Frontmatter: `title`, `description`, `category`, `publishedAt`, `updatedAt?`, `author` ("Equipo Raiden"), `readingMinutes`, `image?` (`~/assets/blog/<slug>.jpg`, 1264×848), `relatedProducts[]` (slugs reales; lo valida `npm run validate:content`, que además prohíbe "€", "EUR", "carnet" e "IVA").

## 7. FAQ inicial

Tres grupos en `src/content/faqs/{compra,garantia,tecnica}.json` (24 preguntas en total):

- **Compra y pedido (8):** cómo se compra por WhatsApp; sin pago online y medios de pago (Visa/Mastercard/Amex en tienda; Yape, Plin y transferencia a consultar con el asesor); boleta o factura (EG Motors SAC, IGV incluido); plazos de entrega (Lima y Callao 3-7 días hábiles, provincias 7-15); envíos a provincias; prueba de manejo en tienda de Bocanegra, Callao (L-D 10 a. m.–8 p. m.); la bicimoto llega lista; qué pasa tras la solicitud.
- **Garantía y servicio técnico (6):** 12 meses en batería y motor; qué no cubre; dónde se hace el servicio técnico; repuestos disponibles; vida útil y precio de la batería de repuesto; mantenimiento necesario.
- **Técnica, autonomía y normativa (10):** velocidad 25 km/h; licencia y placa (con hedge MTC / municipalidad); autonomía por versión; Estándar vs Premium; tiempo y lugar de carga; cuidados de la batería de plomo-ácido; carga máxima 150 / 250 kg; sierra y subidas; lluvia y garúa; costo de carga.

Cada fichero tiene `group`, `order` e `items[] { question, answer }`. Se renderizan en `/faq` con JSON-LD `FAQPage` ([08-seo](./08-seo.md)); cada ficha de producto lleva además sus propias `faqs` (6 por modelo: licencia, autonomía, Estándar vs Premium o carga, batería, garantía y compra/entrega).

## 8. Páginas legales (`/legal/*`)

| Página | Ruta | Contenido mínimo |
|---|---|---|
| Aviso legal | `/legal/aviso-legal` | Titular, NIF, domicilio, correo, datos registrales (LSSI art. 10) |
| Privacidad | `/legal/privacidad` | Responsable, finalidad (atención de solicitudes vía WhatsApp), base legal, conservación, derechos, transferencias (Meta/WhatsApp) |
| Cookies | `/legal/cookies` | Declaración de que no se usan cookies de seguimiento; localStorage del carrito como almacenamiento técnico |
| Garantía | `/garantia` | Garantía legal 3 años (RDL 7/2021), garantía de batería por modelo, proceso de reclamación |
| Envíos y devoluciones | `/legal/envios-devoluciones` | Plazos, zonas, coste orientativo, desistimiento 14 días, condiciones de devolución |

Los textos legales los aporta el cliente o su asesoría; el equipo de Content entrega la estructura y marcadores `[PENDIENTE]`. No se publica ninguna página legal con marcadores pendientes.

## 9. Proceso editorial (git como CMS)

1. Crear rama `content/<tema>` desde `main`.
2. Añadir o editar JSON en `src/content/{products,accessories,blog,faqs}/` y las imágenes en `src/assets/`.
3. `npm run dev` y revisar la página localmente; `npm run build` falla si el JSON no cumple el esquema de la colección ([04-frontend](./04-frontend.md)).
4. Abrir PR con la plantilla; el preview se genera automáticamente ([14-devops](./14-devops.md)).
5. Revisión: Content (texto, datos técnicos contra la ficha del fabricante) y SEO (títulos, descripciones, enlaces internos). Productos nuevos: también Ventas confirma precio y disponibilidad.
6. Squash merge en `main` → despliegue en producción.

Tiempo objetivo de alta de producto completo: menos de 2 horas desde que se reciben datos y fotos.

## 10. Checklist de publicación

- [ ] `status: "published"`, `slug` único y sin acentos.
- [ ] `summary` ≤ 160 caracteres; `name` sin mayúsculas innecesarias.
- [ ] Todas las claves de `specs` con valor numérico y condiciones de autonomía indicadas.
- [ ] Al menos una variante con precio y un color con hex.
- [ ] Imagen principal 4:3, ≥ 2000 px, fondo blanco, `alt` descriptivo, nombre de fichero normalizado.
- [ ] Precio en PEN (céntimos de sol), IGV indicado en `priceNote`.
- [ ] Garantía de vehículo y batería informadas.
- [ ] Carnet requerido coherente con velocidad y homologación.
- [ ] Enlaces internos: categoría, 2 productos relacionados, 1 artículo de blog si existe.
- [ ] Preview revisado en 375 px y 1280 px; JSON-LD `Product` validado en Rich Results Test.
- [ ] Mensaje de WhatsApp generado desde el preview y revisado en un móvil real.
