# Guía del administrador de la web RAIDEN

Esta guía explica, paso a paso, cómo usar el **panel de administración** de la web para cambiar precios, ocultar o mostrar productos, agregar productos nuevos, enlazar el manual y la ficha técnica en PDF, poner el video de YouTube y escribir o editar los artículos del blog. Está pensada para el equipo de la tienda (EG Motors): no hace falta saber de programación.

Una regla importante desde el principio: **las fotos no se suben desde el panel**. Se envían a Diego, que las prepara y las coloca en la web; en el panel solo se escribe el nombre (ruta) de cada foto. La sección 6 lo explica con detalle.

> **Sobre las capturas de pantalla.** El panel solo existe cuando la web está publicada en Cloudflare; por eso esta versión de la guía no lleva capturas. Donde pone *[Captura: …]* irá la imagen correspondiente cuando el panel esté en línea. Los nombres de botones y campos que aparecen entre comillas o en **negrita** son exactamente los que verás en pantalla.

## 1. Entrar al panel

1. Abre en el navegador `https://<dominio de la web>/admin` (guárdalo en favoritos: el enlace no aparece en la web pública).
2. Escribe tu **correo electrónico** y tu **contraseña** y pulsa **Entrar**.
3. **La primera vez** entrarás con la contraseña temporal que te dio Diego. El panel te pedirá elegir una nueva antes de seguir: escribe la temporal en "Contraseña actual", y tu contraseña nueva dos veces. Debe tener al menos 10 caracteres (una frase con espacios vale) y no puede ser tu correo ni una secuencia tipo `1234567890`. Solo tú la conocerás.
4. Ya dentro, arriba verás "Conectado como <tu correo> · Administrador" (o "· Editor"), los botones **Cambiar contraseña** y **Cerrar sesión**, y las pestañas del panel. La sesión dura 12 horas; después vuelve a pedirte la contraseña.

*[Captura: pantalla de inicio de sesión]* · *[Captura: panel abierto con las pestañas Productos, Repuestos y Blog]*

- **Cambiar la contraseña cuando quieras:** botón **Cambiar contraseña** (arriba). Al cambiarla se cierran las demás sesiones que tuvieras abiertas en otros dispositivos.
- **Si la olvidas:** pide a Diego una contraseña temporal nueva; al entrar con ella tendrás que elegir otra.
- Si te equivocas 5 veces seguidas, el acceso de tu cuenta queda bloqueado 15 minutos.
- Si ves **"Sin acceso"**: tu correo y contraseña son correctos pero ese correo no está autorizado en el panel. Pide al administrador (Diego) que lo añada.

En la esquina superior derecha del panel hay un enlace **Ayuda** que abre esta guía.

## 2. Qué puede hacer cada persona

| Acción | Administrador (Diego) | Editor (Wiliam) |
|---|---|---|
| Ver todos los productos y repuestos, incluidos los ocultos | Sí | Sí |
| Cambiar precios | Sí | Sí |
| Ocultar o mostrar un producto o repuesto | Sí | Sí |
| Editar la ficha completa (nombre, descripción, versiones, colores, manual, ficha técnica, video…) | Sí | No |
| Agregar o borrar productos y repuestos | Sí | No |
| Escribir, editar o borrar artículos del blog | Sí | No |
| Subir el PDF del manual o de la ficha técnica | Sí | No |
| Subir fotos | Nadie desde el panel: se envían a Diego, que las coloca por git (sección 6) | — |
| Cambiar su propia contraseña | Sí | Sí |

El editor no ve los botones ni la pestaña de las acciones que no puede hacer; y aunque los viera, el servidor las rechaza.

## 3. Cambiar un precio (administrador y editor)

1. En la pestaña **Productos** (o **Repuestos**) busca la fila del modelo. Puedes escribir en el cuadro "Buscar por nombre o slug".
2. Cada producto tiene un campo de precio por versión: **Estándar** y **Premium** (la Titan Rhino solo una). Escribe el nuevo importe **en soles**, por ejemplo `1250`, `1,250` o `1250.50`.
3. Al cambiar el número aparecen "Motivo (opcional)", **Guardar** y **Cancelar**. El motivo (por ejemplo "nueva lista del proveedor") queda en el historial.
4. Pulsa **Guardar**. Aparece el aviso "Publicando… los cambios tardan unos 3 minutos en verse en la web". No hay que hacer nada más.

Reglas que el panel aplica solo:

- El importe debe ser mayor que 0.
- La versión **Premium nunca puede ser más barata que la Estándar**. Si quieres bajar la Premium por debajo de la Estándar actual, baja primero la Estándar.
- Si escribes el mismo precio que ya había, el panel dice "Sin cambios" y no publica nada.

*[Captura: fila de un producto con los campos de precio Estándar y Premium y el botón Guardar]*

## 4. Ocultar o mostrar un producto o repuesto (administrador y editor)

En cada fila hay un interruptor **Oculto**. Al activarlo, el producto desaparece de toda la web (catálogo, comparador, buscador, portada) pero **no se borra**: sus datos y fotos siguen guardados y puedes volver a mostrarlo cuando quieras con el mismo interruptor. Las filas ocultas llevan la insignia "Oculto".

Úsalo para modelos sin stock por mucho tiempo o descatalogados temporalmente. Si solo es falta de stock por unos días, es mejor cambiar la disponibilidad a **Agotado** desde "Editar ficha" (lo hace el administrador): el producto se sigue viendo, pero no se puede pedir.

## 5. Agregar un producto nuevo (solo administrador)

Un producto nuevo se crea **copiando uno parecido** y cambiando lo que haga falta.

1. En la pestaña **Productos** pulsa **Nuevo producto** (en Repuestos, **Nuevo repuesto**).
2. En el diálogo, elige la "Plantilla (ficha parecida)", escribe el "Slug nuevo" y el "Nombre", y pulsa **Continuar al editor**.
   - El *slug* es el nombre que irá en la dirección web: `/bicimotos/storm-x2`. Solo minúsculas, números y guiones, sin espacios ni tildes (ejemplo: `storm-x2`). Después de guardar no se puede cambiar.
3. Se abre "Nuevo producto: <nombre>" con todos los datos copiados. Revisa:
   - **Subtítulo**, **Claim**, **Descripción**, **Categoría** (bicimotos, trimotos o promociones), **Orden en Recomendados**, **Fecha de publicación**.
   - **Versiones (variantes)**: nombre, versión (Estándar/Premium), **Precio (soles)**, **Disponibilidad**, SKU. Marca una como "Versión por defecto" (normalmente la Estándar).
   - **Colores**: id, nombre y color hex; debajo de cada color, "Añadir foto del color … (por ruta)" si ese color tiene su propia foto (ver sección 6).
   - **Fotos del producto**: las rutas de las fotos de la galería, heredadas del modelo copiado. **Cámbialas** por las del producto nuevo (sección 6): si dejas las del modelo copiado, la ficha nueva mostrará las fotos del otro modelo.
   - **Manual, ficha técnica y video**: ver las secciones 7 y 8.
   - **JSON avanzado**: características técnicas (specs), repuestos compatibles, productos relacionados, preguntas frecuentes. Es texto en formato técnico; cambia solo valores (números y textos entre comillas) y no borres comas ni llaves.
4. Marca **Oculto (no aparece en la web)** si las fotos todavía no están en la web (sección 6): así el producto queda guardado sin verse y sin romper nada; cuando Diego confirme que las fotos están, desmarca "Oculto" (o usa el interruptor **Oculto** de la lista).
5. Escribe un "Motivo (opcional)" y pulsa **Guardar**. Si algo falta o está mal, el panel lo lista bajo "No se ha guardado:" y no publica nada hasta corregirlo.

*[Captura: diálogo "Nuevo producto" con plantilla, slug y nombre]* · *[Captura: editor de ficha completo]*

Para **editar** un producto existente: botón **Editar ficha** en su fila; es el mismo formulario. Para **borrar**: botón **Borrar**, escribe el slug para confirmar y pulsa **Borrar**. Si otro producto o repuesto lo referencia, el panel se niega y te dice cuál: ocúltalo o quita antes la referencia.

## 6. Fotos: cómo se envían y quién las sube

El panel **no sube fotos** (ni de productos, ni de repuestos, ni del blog). El motivo: todas las imágenes de la web se guardan en un formato comprimido (webp) y con un nombre fijo, y eso lo hace Diego con sus herramientas antes de colocarlas en la web por git.

El flujo es siempre el mismo:

1. **Envía las fotos a Diego** por el canal habitual (WhatsApp, correo o carpeta compartida), con la mejor calidad que tengas (JPG o PNG, fondo limpio, al menos 1600 px de ancho). Indica para qué son: qué modelo y qué color, o qué artículo del blog.
2. Diego las convierte a webp y las coloca en la web con un nombre fijo:
   - Producto: `~/assets/products/<slug>-<color>.webp` (por ejemplo `~/assets/products/storm-x2-negro.webp`).
   - Artículo del blog: `~/assets/blog/<slug-del-artículo>.webp`.
   Te confirmará el nombre exacto y el **ancho y alto en píxeles** de cada una.
3. **En el panel escribes esa ruta** en el campo correspondiente:
   - Producto → bloque **Fotos del producto**: cada foto tiene "Ruta de la foto (webp en src/assets)", "Texto alternativo" (qué se ve: "Storm X2 en color negro"), "Ancho (px)" y "Alto (px)". **Añadir foto (por ruta)** agrega otra; **Quitar foto** la retira (siempre debe quedar al menos una).
   - Producto, por color → en el bloque **Colores**, "Añadir foto del color … (por ruta)": la foto que se muestra al elegir ese color en la ficha. Los mismos cuatro campos.
   - Artículo → bloque **Foto del artículo (opcional)**: "Añadir foto (por ruta)" y los mismos campos.
4. Pulsa **Guardar**.

Reglas que el panel comprueba: la ruta debe empezar por `~/assets/` (o por `/` o `https://` si es un enlace externo); el texto alternativo es obligatorio; ancho y alto deben ser números mayores que 0. Lo que el panel **no puede** comprobar es que la foto exista ya en la web: si guardas una ruta de una foto que Diego aún no ha colocado, la publicación falla y la web se queda con la versión anterior (el aviso dirá "El build ha fallado"). Por eso, **mientras no existan las fotos, guarda el producto como Oculto** y muéstralo cuando Diego confirme que están; en el blog, deja el artículo sin foto hasta entonces (es opcional).

*[Captura: bloque "Fotos del producto" con una foto y sus cuatro campos]*

## 7. Enlazar o subir el manual de uso y la ficha técnica (PDF) (solo administrador)

Dentro de "Editar ficha" (o "Nuevo producto") hay un bloque **"Manual, ficha técnica y video"** con tres campos:

- **Manual de uso (PDF)**
- **Ficha técnica (PDF)**
- **Video de YouTube**

Tienes dos formas de poner el PDF:

**A) Subir el PDF desde tu computadora (recomendado).**
1. Pulsa el botón **Subir PDF** que hay junto al campo (hay uno para el manual y otro para la ficha técnica).
2. Elige el archivo PDF (máximo 10 MB; si pesa más, comprímelo antes).
3. Espera el mensaje "<archivo> subido (<tamaño>)". El campo se rellena solo con la dirección, por ejemplo `/docs/golden-eagle-manual.pdf` o `/docs/golden-eagle-ficha.pdf`.
4. Pulsa **Guardar** en la ficha para que el enlace quede guardado en el producto. (La subida del PDF y el guardado de la ficha son dos publicaciones distintas; ambas tardan unos minutos.)

**B) Pegar un enlace.** Si el PDF ya está en internet (por ejemplo en la web del fabricante), pega la dirección completa, que debe empezar por `https://`. También sirve una dirección de la propia web que empiece por `/`.

Cuando el manual tiene enlace, la pestaña **Manual de uso** de la ficha pública muestra el botón "Descargar manual (PDF)". Si el campo está vacío, muestra "Disponible próximamente" y un botón para pedirlo por WhatsApp.

Si subes otra vez un PDF con el mismo nombre (mismo producto y mismo tipo), sustituye al anterior.

*[Captura: bloque "Manual, ficha técnica y video" con el botón Subir PDF]*

## 8. Poner el video de YouTube (solo administrador)

1. En YouTube, abre el video y copia el enlace del navegador o del botón "Compartir". Valen enlaces como `https://www.youtube.com/watch?v=XXXX`, `https://youtu.be/XXXX` o `https://www.youtube.com/shorts/XXXX`.
2. Pégalo en el campo **Video de YouTube** del bloque "Manual, ficha técnica y video".
3. Pulsa **Guardar**. El panel guarda el enlace en su forma estándar y, en la web, la pestaña **Video** de la ficha muestra la portada del producto con un botón de reproducir; el video se carga desde YouTube solo cuando el visitante lo pulsa.

Si el campo queda vacío, la pestaña Video muestra el aviso de lanzamiento en el canal de YouTube. Un enlace que no sea de YouTube se rechaza con el mensaje "Video de YouTube: pega un enlace de youtube.com/watch?v=…".

## 9. El blog (solo administrador)

La pestaña **Blog** muestra la lista de artículos con su título, categoría, fecha y si tienen foto, y los botones **Editar**, **Ver** (abre el artículo en la web) y **Borrar**.

### 9.1 Editar un artículo

1. Pulsa **Editar** en la fila del artículo. Se abre "Editar artículo: <título>".
2. Campos:
   - **Título** y **Descripción** (el resumen que sale en Google y en la lista del blog).
   - **Slug (URL)**: no se puede cambiar en un artículo existente.
   - **Categoría**, **Autor**, **Fecha de publicación** y **Fecha de actualización (opcional)**: si retocas un artículo antiguo, pon la fecha de hoy en "actualización".
   - **Modelos relacionados**: marca los productos que se mostrarán al final del artículo.
   - **Foto del artículo (opcional)**: ver 9.2.
   - **Texto del artículo (Markdown)**: el cuerpo. Es texto normal con unas marcas sencillas:
     - Título de sección: una línea que empiece por `## ` (por ejemplo `## Cuándo cargar la batería`).
     - **Negrita**: `**texto**`. *Cursiva*: `*texto*`.
     - Lista con viñetas: líneas que empiecen por `- `. Lista numerada: `1. `, `2. `…
     - Enlace: `[texto que se ve](/repuestos)` o `[texto](https://…)`.
     - Deja una línea en blanco entre párrafos.
     - Debajo del cuadro se ve el número de palabras y los minutos de lectura (se calculan solos; no hay que escribirlos).
3. Pulsa **Guardar**. Aparece el aviso de publicación; en unos 3 minutos el artículo actualizado está en la web.

Reglas que el panel comprueba antes de guardar: título, descripción y autor no pueden estar vacíos; la fecha debe ser válida; el texto no puede estar vacío; y el blog no debe mencionar euros (€, EUR), "carnet" ni "IVA" (en el Perú: S/, licencia, IGV).

*[Captura: editor de artículo con los campos y el cuadro de texto Markdown]*

### 9.2 La foto del artículo

Como en los productos, la foto **no se sube desde el panel** (sección 6): se la envías a Diego, que la coloca como `~/assets/blog/<slug-del-artículo>.webp` y te confirma el ancho y alto.

1. En el bloque **Foto del artículo (opcional)**, pulsa **Añadir foto (por ruta)**. El panel propone la ruta `~/assets/blog/<slug>.webp`; confírmala o corrígela con la que te dio Diego.
2. Rellena **Texto alternativo** (una frase con lo que se ve en la foto; sirve para personas con lector de pantalla y para Google), **Ancho (px)** y **Alto (px)**.
3. Pulsa **Guardar**.

**Quitar foto** deja el artículo sin imagen de cabecera (el archivo sigue en la web por si se necesita). Si la foto aún no está colocada, deja el artículo sin foto y añádela cuando Diego confirme.

### 9.3 Crear un artículo nuevo

1. Pulsa **Nuevo artículo**.
2. Escribe el **Título**: el **Slug (URL)** se propone solo (por ejemplo "¿Cómo elegir una bicimoto eléctrica?" → `como-elegir-una-bicimoto-electrica`). Puedes cambiarlo antes de guardar; después ya no.
3. Rellena descripción, categoría, fechas, modelos relacionados, la foto (opcional) y el texto.
4. Pulsa **Publicar artículo**. En unos minutos estará en `https://<dominio>/blog/<slug>` y en la lista del blog.

### 9.4 Borrar un artículo

**Borrar** → escribe el slug para confirmar → **Borrar**. El artículo desaparece de la web en la siguiente publicación. El historial de cambios permite recuperarlo si fue un error (pídeselo a Diego).

## 10. Qué pasa cuando guardas

Cada vez que pulsas **Guardar**, **Publicar artículo**, **Subir PDF** o **Borrar**:

1. El panel envía el cambio al servidor, que lo revisa (campos obligatorios, precios, enlaces seguros, etc.). Si algo está mal, lo verás en rojo y **no se publica nada**.
2. Si está bien, el cambio se guarda en el **historial de la web (GitHub)** con tu correo, qué cambiaste y el motivo que escribiste. Nada se pierde: siempre se puede volver atrás.
3. Automáticamente se **reconstruye y publica la web**. Arriba del panel aparece el aviso **"Publicando… los cambios tardan unos 3 minutos en verse en la web"** con un contador (o "En cola" → "Construyendo el sitio" → "Publicado" cuando el estado real está conectado).
4. Pasados esos minutos, recarga la página pública para ver el cambio. Si en 10 minutos no se ve, avisa a Diego.

No hace falta esperar a que termine para seguir editando otras cosas; cada guardado es una publicación.

## 11. Errores frecuentes

| Mensaje | Qué significa | Qué hacer |
|---|---|---|
| "Sin acceso" | Tu correo no está autorizado en el panel | Pedir a Diego que lo añada |
| "La sesión de Cloudflare Access ha caducado" | Pasaron 24 horas desde el código | Recargar la página y pedir un código nuevo |
| "Importe no válido" | El precio tiene letras o un formato raro | Escribir solo números: `1250` o `1250.50` |
| "La versión Premium no puede ser más barata que la Estándar" | Regla de la tienda | Cambiar primero la otra versión |
| "Alguien modificó esta ficha; se ha recargado" | Otra persona guardó la misma ficha antes que tú | Repetir tu cambio sobre los datos recargados |
| "Cierra el editor y vuelve a abrirlo…" | Lo mismo, dentro del editor | Cancelar, abrir de nuevo y repetir |
| "No se ha guardado:" seguido de una lista | Faltan datos o hay un valor incorrecto | Corregir lo que indica cada línea |
| "Ruta de destino no permitida" / "el fichero no es un PDF" | El archivo no es un PDF | Elegir un PDF real |
| "El PDF pesa … el máximo es 10 MB" | Archivo demasiado grande | Comprimir el PDF (por ejemplo con "Guardar como tamaño reducido") |
| "foto 1: la ruta debe empezar por ~/assets/…" | La ruta de la foto está mal escrita | Copiar la ruta exacta que dio Diego (sección 6) |
| "image.src debe ser ~/assets/blog/<nombre>.webp" | La foto del artículo apunta fuera de la carpeta del blog | Usar `~/assets/blog/<slug>.webp` |
| "Fallo de GitHub o Cloudflare (reintenta en unos minutos)" | Problema temporal del servicio | Esperar unos minutos y repetir |
| "Configuración incompleta del panel (avisar a Diego)" | Falta una configuración en el servidor | Avisar a Diego |
| "El build ha fallado" | La web no pudo reconstruirse; sigue la versión anterior | Avisar a Diego; normalmente es una foto referenciada que no existe |

## 12. Cosas que siguen haciéndose fuera del panel

Todas las fotos (productos, repuestos y blog: sección 6), las preguntas frecuentes, las reseñas, las categorías, los textos de la portada y el número de WhatsApp se cambian por git (los hace Diego). Pídeselos por el canal habitual.
