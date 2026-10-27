# 23 — Guía de edición del catálogo

Dos vías, ambas acaban en un commit en `main` y en un build de Cloudflare Pages (2–3 minutos hasta verse en la web):

- **Panel `/admin`** (§0): para la tienda. Precios y ocultar/mostrar (Diego y Wiliam); crear, editar y borrar fichas (solo Diego). No requiere saber git.
- **Git** (§1 en adelante): para todo lo demás (imágenes, blog, FAQ, testimonios, categorías, textos globales) y como alternativa siempre disponible.

Referencias: [17-admin-panel](./17-admin-panel.md) (qué hace el panel y por qué), [19-deployment](./19-deployment.md) §12 (alta y variables), ADR-018.

## 0. Usar el panel de administración

### 0.1 Entrar

1. Abrir `https://<dominio>/admin` (el enlace no aparece en la web; guardarlo en favoritos).
2. Cloudflare Access pide el **email** y envía un **código de un solo uso**; introducirlo. Solo entran los emails autorizados (Diego como administrador, Wiliam como editor). La sesión dura 24 horas.
3. El panel muestra arriba "Conectado como <email> · Administrador" (o "Editor") y dos pestañas: **Productos** (bicimotos, trimotos y promociones) y **Repuestos**, con el número de fichas. El cuadro "Buscar por nombre o slug" filtra la pestaña activa. Las fichas ocultas llevan la insignia "Oculto".

Si aparece "Sin acceso": el email entró por Access pero no está en `ADMIN_EMAILS` ni `EDITOR_EMAILS`; pedir a Diego que lo añada ([19-deployment](./19-deployment.md) §12.6).

### 0.2 Cambiar un precio (Diego y Wiliam)

1. Localizar la ficha. En productos hay un campo de precio por versión (**Estándar** y **Premium**; Titan Rhino solo una); en repuestos, uno.
2. Escribir el nuevo importe **en soles** en el campo (`1250`, `1,250` o `1250.50`). Al cambiarlo aparecen "Motivo (opcional)", **Guardar** y **Cancelar**. El motivo ("nueva lista del proveedor") queda en el historial.
3. Reglas que el panel y el servidor imponen: importe mayor que 0 ("El importe debe ser mayor que 0"); la **Premium nunca más barata que la Estándar** ("La versión Premium no puede ser más barata que la Estándar (cambia primero la otra versión)"). Si otra persona modificó la misma ficha, aparece "Alguien modificó esta ficha; se ha recargado": repetir el cambio. Si el importe es el mismo que ya había, el panel dice "Sin cambios" y no publica nada.
4. Aparece el aviso **"Publicando… los cambios tardan unos 3 minutos en verse en la web"** con un contador (o, si está conectada la API de Pages, "En cola" → "Construyendo el sitio" → "Publicado"). Pasado ese tiempo el precio nuevo está en la ficha, en el precio "Desde", en el configurador, en el comparador y en el mensaje de WhatsApp. No hay que hacer nada más.

### 0.3 Ocultar o mostrar una ficha (Diego y Wiliam)

Interruptor **Oculto** en cada fila. Ocultar retira la ficha de toda la web (catálogo, página de la categoría, comparador, buscador, portada, sitemap) sin borrarla; sus datos y fotos se conservan y se puede volver a mostrar cuando se quiera. Úsalo para productos sin stock prolongado o descatalogados temporalmente. Para "sin stock" de corta duración es mejor la disponibilidad **Agotado** (se sigue viendo pero no se puede pedir), que cambia Diego desde "Editar ficha" o por git.

Si se oculta el modelo de la portada (hero), la portada usa el siguiente modelo visible; conviene que Diego reasigne el hero.

### 0.4 Crear un producto o repuesto (solo Diego)

1. **Nuevo producto** (o **Nuevo repuesto**) → en el diálogo, elegir la "Plantilla (ficha parecida)", escribir el "Slug nuevo" (minúsculas, números y guiones; será la URL: `/bicimotos/<slug>`; después no se puede cambiar desde el panel) y el "Nombre" → **Continuar al editor**.
2. Se abre "Nuevo producto: <nombre>" con todos los datos copiados (sin la marca de hero): revisar subtítulo, descripción, categoría, versiones y precios, colores, disponibilidad y el bloque **JSON avanzado** (specs, imágenes, repuestos compatibles, relacionados, FAQ…). Las imágenes deben existir ya en `src/assets/products/` (se suben por git, §3 y §5); si se referencia una que no existe, el build fallará y el sitio seguirá con la versión anterior.
3. **Guardar**. El servidor valida igual que el build (campos obligatorios, una sola versión por defecto, Premium ≥ Estándar, referencias existentes, URLs seguras) y, si algo falla, lo lista bajo "No se ha guardado:".

### 0.5 Editar la ficha completa (solo Diego)

**Editar ficha** → "Editar ficha: <nombre>", formulario con los campos principales y el JSON avanzado para el resto. Mismas validaciones (errores bajo "No se ha guardado:"). Cambiar la categoría mueve la URL (`/bicimotos/x` → `/promociones/x`); la antigua dejará de existir.

### 0.6 Borrar (solo Diego)

**Borrar** → "Escribe `<slug>` para confirmar" → "Motivo (opcional)" → **Borrar**. El servidor se niega (409) si otra ficha la referencia (`related` de un producto, `compatibleWith` de un repuesto, `accessories`): en ese caso, ocultarla o quitar antes las referencias desde las otras fichas. Borrar elimina el JSON del repositorio (las fotos quedan en `src/assets` hasta limpiarlas por git); el historial de git permite recuperarlo.

### 0.7 Qué deja rastro

Cada guardado es un commit en GitHub con el mensaje `chore(catalog): actualizar <slug> por <email>` (o `crear`/`borrar`), el detalle del cambio y el motivo. Para ver el historial: GitHub → repositorio → *Commits*, o `git log -- src/content`.

### 0.8 Accesos

La sección **Accesos** del panel muestra "Administradores", "Editores" y la "Rama de escritura" (normalmente `main`); en desarrollo aparece además la insignia "Modo local" y el selector "Simular como…" para probar la vista de cada rol. Para cambiar los accesos, Diego edita en Cloudflare la política de Access (emails que pueden entrar) y las variables `ADMIN_EMAILS` / `EDITOR_EMAILS` del proyecto de Pages, y relanza el build ([19-deployment](./19-deployment.md) §12.6).

---

Las secciones siguientes describen la vía por git: necesaria para imágenes, blog, FAQ, testimonios, categorías y `src/config/site.ts`, y válida también para precios y fichas si el panel no está disponible. Toda edición queda versionada, revisada y validada en CI.

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
- Fuera de la web pero conservando la ficha → `"hidden": true` en el JSON (lo mismo que el interruptor "Oculto" del panel): desaparece de rutas, listados, sitemap y buscador; se vuelve a mostrar quitando el campo o poniéndolo a `false`. Si el oculto es el `isHero`, el validador avisa para reasignar el hero.
- Retirada definitiva → borrar el JSON **y** limpiar su slug de `related` y `accessories` de los productos, de `compatibleWith` de los repuestos y de `relatedProducts` del blog (el validador lista los rotos).

## 6b. Actualizar las reseñas de "Comunidad RAIDEN"

Abrir `src/content/testimonials/google-maps.json` y añadir a `items` cada reseña nueva de la ficha de Google Maps **tal cual la escribió el cliente** (`author`, `rating` 1–5, `text`, `date` `AAAA-MM`). Una reseña solo con estrellas va con `text: ""` (cuenta para la media y el total, no se destaca). La portada elige sola las 3 mejor valoradas con más texto y muestra la media y el número total. No se redactan ni retocan reseñas (ADR-016).

## 7. Qué valida la CI

`npm run validate:content` (rápido, sin build): JSON parseable, slugs = nombre de fichero, referencias cruzadas existentes, imágenes presentes, moneda PEN y precios enteros, una sola variante default, Premium ≥ Estándar, `hidden` booleano, un solo hero (y no oculto), coherencia de batería, licencia vs. velocidad, y ausencia de referencias a España/EUR en el blog. Después `astro build` valida los esquemas zod completos ([content.config.ts](../src/content.config.ts) → [schemas.ts](../src/content/schemas.ts), los mismos que usa el panel).

## 8. Futuro: Supabase

El esquema SQL equivalente está en `supabase/migrations/00000000000001_initial_schema.sql` (validado con el parser de PostgreSQL); el diseño actualizado con `parts`, `tier`, `unit` y `code` está en [06-database](./06-database.md) y debe trasladarse a la migración antes de desplegarla. Cuando el catálogo crezca, la migración descrita en [20-migration](./20-migration.md) sustituye esta carpeta por tablas sin tocar la UI (misma interfaz `Repositories`).
