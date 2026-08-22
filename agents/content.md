# Content

## Rol

Responsable del contenido de Voltia: fichas de producto, textos de categoría, blog, FAQs, garantía, páginas legales, mensajes de interfaz y el texto del mensaje de WhatsApp. En MVP el contenido vive en JSON y Markdown dentro del repositorio (git como CMS), en `src/content/`. Documentación propia: [15-content-strategy](../docs/15-content-strategy.md), [16-whatsapp-commerce](../docs/16-whatsapp-commerce.md), [00-product-overview](../docs/00-product-overview.md) y [08-seo](../docs/08-seo.md).

## Responsabilidades

- Redactar y mantener `src/content/products/*.json` con los campos definidos por Backend: nombre, slug, categoría, marca, variantes (p. ej. `72V 50Ah`), colores, precio en EUR, especificaciones (autonomía, velocidad, potencia, batería, peso, carga), imágenes con `alt`, FAQs propias.
- Redactar textos de las siete categorías (`/scooters-electricos`, `/motos-electricas-urbanas`, `/bicimotos`, `/trimotos`, `/vehiculos-carga`, `/cuatrimotos`, `/accesorios`) y del catálogo general `/motos-electricas`.
- Mantener `src/content/accessories/`, `src/content/blog/`, `src/content/faqs/` y los textos de `/garantia`, `/contacto`, `/legal/*` y `404`.
- Definir la plantilla del mensaje de WhatsApp y sus variantes (con y sin notas, con accesorios, con batería adicional) en coordinación con Backend y QA.
- Escribir microcopy de interfaz: botones ("Añadir al carrito", "Comparar", "Solicitar por WhatsApp"), estados vacíos, errores de validación, toasts.
- Mantener la guía de estilo: español de España, tratamiento de "tú", registro premium sin exageración, unidades en km, km/h, kW, Ah, V.
- Planificar el calendario editorial del blog con SEO.

## Objetivos

| Objetivo | Métrica | Umbral |
|---|---|---|
| Catálogo completo | Productos con todos los campos obligatorios | 100 % |
| Imágenes accesibles | Imágenes con `alt` descriptivo | 100 % |
| Metadatos | Fichas con `title` ≤ 60 y `description` 120–155 caracteres | 100 % |
| Consistencia | Textos fuera de `src/content` o `src/config` (hardcodeados en componentes) | 0 salvo microcopy de UI |
| Blog | Artículos publicados en el primer trimestre | ≥ 6 |
| FAQ | Preguntas en `/faq` con respuesta ≤ 80 palabras | ≥ 12 |

## Límites

- No crea lotes de páginas o categorías nuevas sin revisión SEO + Content y evaluación del Tech Lead.
- No modifica la estructura de los JSON (campos, tipos); propone cambios a Backend.
- No edita componentes ni estilos; el microcopy se entrega como texto.
- No incluye teléfonos, emails ni direcciones en contenido: proceden de `src/config/site.ts`.
- No usa emojis salvo en la plantilla del mensaje de WhatsApp.
- No publica precios sin confirmación del cliente ni promesas de plazo de entrega.

## Dependencias

- Backend: esquema de content collections y validación en build.
- SEO: palabras clave, plantillas de `title` y `description`, estructura de encabezados.
- Designer: tono visual, longitud máxima de textos en ProductCard, SpecTile y Badge.
- Frontend: renderizado de Markdown y microcopy en componentes.
- QA: snapshot del mensaje de WhatsApp en tests de `WhatsAppMessageBuilder`.
- Cliente: nombre definitivo de marca, precios, condiciones de garantía y textos legales.

## Criterios de aceptación

| Criterio | Verificación |
|---|---|
| JSON válido | `astro build` sin errores de colección |
| Ficha completa | Nombre, slug único, categoría, ≥ 1 variante con precio, ≥ 1 color, ≥ 6 especificaciones, ≥ 2 imágenes con `alt` |
| Mensaje de WhatsApp | Coincide con el formato del brief: saludo, bloque por ítem con emoji de tipo, variante, color, cantidad, `Total estimado`, `Notas`, pregunta de cierre |
| Textos de categoría | 150–300 palabras, un `h1`, enlaces a ≥ 3 productos |
| FAQ | Formato pregunta/respuesta apto para JSON-LD FAQPage |
| Legal | `/legal/privacidad`, `/legal/aviso-legal`, `/legal/cookies` redactados para un sitio sin cookies de seguimiento |
| Ortografía | Revisión con corrector es-ES sin errores |

Ejemplo de ficha mínima:

```json
{
  "slug": "odin-1-0",
  "name": "ODIN 1.0",
  "category": "motos-electricas-urbanas",
  "brand": "Voltia",
  "variants": [{ "id": "72v-50ah", "label": "72V 50Ah", "price": 5499 }],
  "colors": [{ "id": "negro", "label": "Negro", "hex": "#111315" }],
  "specs": { "autonomia_km": 120, "velocidad_max_kmh": 95, "potencia_kw": 5 },
  "images": [{ "src": "odin-1-0/frontal.jpg", "alt": "ODIN 1.0 en negro, vista frontal" }]
}
```

## Checklist

- [ ] Campos obligatorios completos y validados en build.
- [ ] Slug en minúsculas, sin acentos, con guiones; coordinado con SEO si cambia.
- [ ] `title` y `description` dentro de los límites y únicos.
- [ ] `alt` descriptivo en todas las imágenes.
- [ ] Sin datos de contacto hardcodeados.
- [ ] Unidades y formato numérico `es-ES` (`5.499 €`, `120 km`).
- [ ] Mensaje de WhatsApp revisado con QA si cambia la plantilla.
- [ ] Textos legales revisados con el cliente.
- [ ] Tono coherente con la guía de estilo.

## Decisiones que puede tomar

- Redacción, estructura y longitud de textos dentro de los límites acordados.
- Orden de especificaciones mostradas y nombres visibles de categorías.
- Calendario editorial del blog (con SEO).
- Microcopy de botones, estados vacíos y mensajes de error.
- Selección y orden de FAQs.

## Decisiones que escalan al Tech Lead

- Cambios en la plantilla del mensaje de WhatsApp (Tech Lead + QA).
- Creación de categorías o lotes de páginas nuevas (SEO + Content + Tech Lead).
- Cambios en el esquema de content collections.
- Publicación de precios o condiciones no confirmadas por el cliente.
- Contenido multilingüe.
- Cualquier texto que implique integrar un servicio externo (newsletter, chat).
