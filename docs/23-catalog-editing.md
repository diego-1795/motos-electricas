# 23 — Guía de edición del catálogo (git como CMS)

Cómo añadir o modificar bicimotos, trimotos, repuestos, precios y contenido **sin panel de administración**. Esta es la operativa oficial del MVP; el panel llegará después (ver [17-admin-panel](./17-admin-panel.md)). Toda edición pasa por git: queda versionada, revisada y validada en CI.

## 1. Dónde vive cada cosa

| Contenido | Carpeta | Formato |
|---|---|---|
| Productos (bicimotos y trimotos) | `src/content/products/` | 1 JSON por modelo, nombre de fichero = slug (hoy: `golden-eagle`, `royal-tiger`, `vortex-kobra`, `titan-rhino`) |
| Repuestos | `src/content/repuestos/` | 1 JSON por repuesto (26 hoy), nombre de fichero = slug |
| Categorías | `src/content/categories/` | 1 JSON por categoría: `bicimotos`, `trimotos`, `repuestos`, `promociones` (no añadir nuevas sin tocar dominio) |
| Promociones (edición EG Motors) | `src/content/products/` con `category: "promociones"` | Misma ficha que un modelo; no entra en `/productos`, comparador ni portada (ADR-017) |
| Artículos del blog | `src/content/blog/` | Markdown con frontmatter (el tiempo de lectura se calcula solo) |
| Reseñas de clientes (portada) | `src/content/testimonials/` | 1 JSON por origen (`google-maps.json`): reseñas públicas reales, copiadas tal cual |
| FAQ generales | `src/content/faqs/` | 1 JSON por grupo |
| Imágenes | `src/assets/products/`, `hero/`, `repuestos/`, `blog/` | JPG/PNG/AVIF/WebP |
| Marca, WhatsApp, textos globales | `src/config/site.ts` | TypeScript |

## 2. Cambiar un precio

1. Abrir `src/content/products/<slug>.json`.
2. Buscar `variants[].price.amount`: es el precio en **céntimos de sol** (S/ 1,200 → `120000`). `currency` siempre `"PEN"`.
3. Cada modelo tiene dos versiones (`variants[].tier`: `estandar` y `premium`; Titan Rhino solo una): editar el precio de la versión que corresponda. Para un repuesto, editar `price.amount` en `src/content/repuestos/<slug>.json`.
4. Guardar, commit y push. Nada más: el precio "Desde", el configurador, el comparador y el mensaje de WhatsApp se recalculan solos.

## 3. Añadir un producto nuevo

1. Copiar el JSON de un modelo parecido (p. ej. `src/content/products/golden-eagle.json` para una bicimoto) y renombrarlo al nuevo slug (`kebab-case`, p. ej. `storm-x2.json`; el campo `slug` debe coincidir). La URL resultante será `/bicimotos/storm-x2`.
2. Rellenar: `id` único, nombre, subtítulo, claim, descripción, `category` (`bicimotos`, `trimotos` o `promociones` para ediciones EG Motors), specs completas, 1–2 variantes (Estándar/Premium con `tier`; exactamente **una** con `isDefault: true`), colores, `accessories` (slugs de repuestos compatibles) y `related` (slugs de modelos existentes), `useCases`, highlights, `technology` (6 bloques), 6 FAQs, `featured` (orden en "Recomendados"), `publishedAt`.
3. Añadir una foto por color en `src/assets/products/` como `<slug>-<color>.jpg` (p. ej. `storm-x2-negro.jpg`), una imagen hero en `src/assets/hero/` si el modelo va a la portada, y referenciarlas como `~/assets/products/<slug>-<color>.jpg` con `width`/`height` reales.
4. Ejecutar:

```bash
npm run validate:content && npm run build
```

5. Commit y push. La CI repite la validación; un JSON inválido **bloquea el merge**.

Notas:
- `isHero: true` solo puede tenerlo **un** producto (el del hero de la portada).
- `specs.battery.capacityKwh` debe ser V·Ah/1000 (el validador lo comprueba).
- Licencias: `sin-licencia`, `B-I`, `B-IIa`, `B-IIb`, `B-IIc` (MTC). Las bicimotos de 25 km/h llevan `sin-licencia` con el texto "en general sin licencia (confirmar con MTC)"; ante la duda, confirmar con el asesor legal antes de publicar.
- Tras añadir el JSON no hace falta registrar rutas: `/bicimotos/<slug>` (o `/trimotos/<slug>`) se genera sola desde `category`.

## 4. Añadir un repuesto

1. Copiar un JSON de `src/content/repuestos/` (p. ej. `bateria-chilwee-48v-20ah.json`) y renombrarlo al nuevo slug.
2. Rellenar `id`, `name`, `description`, `price` (céntimos de sol), `availability`, `kind` (`bateria`, `motor`, `controlador`, `cargador`, `iluminacion`, `frenos`, `cables`, `mandos`, `seguridad`, `llantas`, `otro`), `unit` (`UND` o `PAR`), `code` (p. ej. `RP-027`) y `compatibleWith` (slugs de modelos; vacío = universal).
3. Foto en `src/assets/repuestos/` y `image` apuntando a ella. Para que aparezca como compatible en la ficha de un modelo, añadir su slug a `accessories` de ese producto.
4. `npm run validate:content && npm run build`.

## 5. Fotos reales (sustituir placeholders)

Exportar JPG ≥ 1600 px (fondo limpio) a `src/assets/products/` o `src/assets/repuestos/`, actualizar `images[].src` y dimensiones. Astro genera AVIF/WebP y srcset en el build; no hay que optimizar a mano.

## 6. Retirar un producto o repuesto

- Temporalmente sin stock → `variants[].availability: "agotado"` (la web lo muestra, deshabilita compra).
- Retirada definitiva → borrar el JSON **y** limpiar su slug de `related` y `accessories` de los productos, de `compatibleWith` de los repuestos y de `relatedProducts` del blog (el validador lista los rotos).

## 6b. Actualizar las reseñas de "Comunidad RAIDEN"

Abrir `src/content/testimonials/google-maps.json` y añadir a `items` cada reseña nueva de la ficha de Google Maps **tal cual la escribió el cliente** (`author`, `rating` 1–5, `text`, `date` `AAAA-MM`). Una reseña solo con estrellas va con `text: ""` (cuenta para la media y el total, no se destaca). La portada elige sola las 3 mejor valoradas con más texto y muestra la media y el número total. No se redactan ni retocan reseñas (ADR-016).

## 7. Qué valida la CI

`npm run validate:content` (rápido, sin build): JSON parseable, slugs = nombre de fichero, referencias cruzadas existentes, imágenes presentes, moneda PEN y precios enteros, una sola variante default, un solo hero, coherencia de batería, licencia vs. velocidad, y ausencia de referencias a España/EUR en el blog. Después `astro build` valida los esquemas zod completos ([content.config.ts](../src/content.config.ts)).

## 8. Futuro: Supabase

El esquema SQL equivalente está en `supabase/migrations/00000000000001_initial_schema.sql` (validado con el parser de PostgreSQL); el diseño actualizado con `parts`, `tier`, `unit` y `code` está en [06-database](./06-database.md) y debe trasladarse a la migración antes de desplegarla. Cuando el catálogo crezca, la migración descrita en [20-migration](./20-migration.md) sustituye esta carpeta por tablas sin tocar la UI (misma interfaz `Repositories`).
