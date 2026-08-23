# 15 — Estrategia de contenidos

Raiden (nombre provisional) vende movilidad eléctrica con un showroom digital cuya conversión termina en WhatsApp. El contenido tiene tres funciones: posicionar en buscadores ([08-seo](./08-seo.md)), resolver dudas antes de que lleguen a ventas y dar la información técnica necesaria para que el cliente configure bien su pedido ([16-whatsapp-commerce](./16-whatsapp-commerce.md)). En el MVP el contenido se gestiona como ficheros JSON en el repositorio (git como CMS, ver [17-admin-panel](./17-admin-panel.md)).

## 1. Tono y voz de marca

| Rasgo | Sí | No |
|---|---|---|
| Registro | Tú, cercano pero profesional | Usted; jerga de concesionario |
| Precisión | Cifras con unidad y condición ("hasta 120 km a 45 km/h") | "Gran autonomía" |
| Honestidad | Indicar que la autonomía declarada depende de peso y vía | Promesas absolutas |
| Longitud | Frases cortas, un dato por frase | Párrafos de marketing |
| Vocabulario | Moto eléctrica, scooter eléctrico, batería extraíble, licencia B-IIa/B-IIb, SOAT | Anglicismos innecesarios ("e-bike" salvo en bicimotos) |
| Llamada a la acción | "Pide tu presupuesto por WhatsApp" | "Compra ahora" (no hay pago online) |

Keywords de referencia (Perú): "moto eléctrica Perú", "scooter eléctrico Lima", "precio en soles", "licencia B-IIa", "SOAT". Detalle por página en [08-seo](./08-seo.md).

Claim provisional: "Movilidad eléctrica sin complicaciones." Se usa en `<title>` de la home y en Open Graph hasta que el cliente confirme el nombre.

## 2. Taxonomía del catálogo

| Categoría | Slug | Descripción | Carnet habitual |
|---|---|---|---|
| Scooters eléctricos | `scooters-electricos` | Scooters de 45–120 km/h de uso urbano | B-I / B-IIa |
| Motos eléctricas urbanas | `motos-electricas-urbanas` | Motos tipo naked o trail ligera | B-IIa / B-IIb |
| Bicimotos | `bicimotos` | Bicicletas con motor y pedales, estilo retro o cargo ligero | Sin licencia o B-I según potencia (normativa MTC) |
| Trimotos | `trimotos` | Vehículos de tres ruedas para pasajeros o reparto | B-IIb / B-IIc |
| Vehículos de carga | `vehiculos-carga` | Triciclos y motocarros con caja o furgón | B-IIb / B-IIc |
| Cuatrimotos | `cuatrimotos` | Quads y cuadriciclos ligeros eléctricos | B-IIb / B-IIc |
| Accesorios | `accesorios` | Cascos, baterías adicionales, cargadores, baúles, candados | — |

La página `/motos-electricas` agrupa todas las categorías de vehículo. Las marcas (`Brand`) son entidad propia para filtros y JSON-LD, pero no generan páginas en el MVP.

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

Pilares de contenido: (1) Guías de compra y normativa, (2) Mantenimiento y baterías, (3) Comparativas de modelos del catálogo, (4) Ahorro y ayudas públicas, (5) Uso profesional (reparto y carga).

| Mes | Título | Pilar | Enlaza a |
|---|---|---|---|
| 1 | Qué licencia (B-I, B-IIa, B-IIb, B-IIc) necesitas para conducir una moto eléctrica en el Perú | 1 | Scooters, urbanas |
| 1 | Autonomía real de un scooter eléctrico: qué influye y cómo calcularla | 2 | Encuentra tu moto |
| 2 | Batería extraíble o fija: cuál te conviene si vives en piso | 2 | Accesorios (batería) |
| 2 | Cuánto cuesta cargar una moto eléctrica en casa | 4 | Scooters |
| 3 | Scooter eléctrico de 45 km/h frente a 80 km/h: guía de decisión | 3 | Comparar |
| 3 | SOAT, placa e inscripción en SUNARP de una moto eléctrica: guía paso a paso | 4 | Contacto |
| 4 | Mantenimiento de una moto eléctrica: qué revisar cada mes | 2 | Garantía |
| 4 | Bicimotos: qué son y cuándo tienen sentido frente a una bici eléctrica | 1 | Bicimotos |
| 5 | Vehículos eléctricos de carga para reparto de última milla | 5 | Vehículos de carga |
| 5 | Cómo elegir casco para scooter eléctrico | 1 | Accesorios (casco) |
| 6 | Trimotos eléctricas para movilidad reducida y reparto ligero | 5 | Trimotos |
| 6 | Cuánto dura la batería de una moto eléctrica y cómo alargar su vida | 2 | Garantía |

Formato: 900–1.500 palabras, H2 cada 200–300 palabras, una tabla o lista de datos, CTA final a la categoría relacionada. Ficha en `src/content/blog/<slug>.json` con `title`, `slug`, `publishedAt`, `updatedAt`, `author`, `pillar`, `summary`, `body` (Markdown), `cover`, `relatedProducts[]`.

## 7. FAQ inicial

1. ¿Necesito licencia de conducir (clase B) para un scooter eléctrico?
2. ¿Cuánta autonomía tiene realmente una moto eléctrica?
3. ¿Se puede cargar la batería en casa con un enchufe normal?
4. ¿Cuánto tarda en cargarse la batería?
5. ¿La batería es extraíble?
6. ¿Cuánto dura la batería y qué garantía tiene?
7. ¿Puedo llevar pasajero?
8. ¿Puede circular por autovía o autopista?
9. ¿Cómo hago el pedido si no hay pago online? (El asesor puede ofrecer transferencia, Yape o Plin; nunca se cobra desde la web.)
10. ¿Qué ocurre después de enviar la solicitud por WhatsApp?
11. ¿Hacen envíos a todo el Perú? ¿Y a provincias (Arequipa, Trujillo, Cusco)?
12. ¿Viene con placa e inscrita en SUNARP o la inscribo yo? ¿Incluye SOAT?
13. ¿Qué garantía tiene el vehículo y dónde se repara?
14. ¿Puedo probar la moto antes de comprarla?
15. ¿Existen ayudas o beneficios para comprar una moto eléctrica en el Perú?

Fichero `src/content/faqs/<slug>.json` con `question`, `answer` (Markdown), `category` (`compra`, `tecnica`, `legal`, `postventa`), `order`. Se renderizan en `/faq` y, filtradas, en fichas de producto, con JSON-LD `FAQPage` ([08-seo](./08-seo.md)).

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
