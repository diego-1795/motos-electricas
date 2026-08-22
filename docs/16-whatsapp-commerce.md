# 16 — Comercio por WhatsApp

El carrito de Voltia no cobra: construye una solicitud de pedido y la entrega al equipo de ventas como mensaje de WhatsApp pre-rellenado. Este documento fija cómo se genera ese mensaje, cómo se integra en la interfaz, qué hace ventas al recibirlo y qué implicaciones tiene en protección de datos. Flujo global en [00-product-overview](./00-product-overview.md); UX del carrito en [03-ux](./03-ux.md).

## 1. Enlace `wa.me` frente a Business API

| Criterio | Enlace `wa.me` (MVP) | WhatsApp Business API (futuro) |
|---|---|---|
| Coste | 0 € | Proveedor BSP + coste por conversación |
| Backend necesario | No | Sí (webhooks, almacenamiento, verificación de Meta) |
| Tiempo de puesta en marcha | Minutos | Semanas (verificación de empresa) |
| Quién inicia | El cliente, desde su propio WhatsApp | La empresa o el cliente |
| Datos que procesa Voltia | Ninguno (el mensaje viaja cliente → WhatsApp) | Conversaciones completas en sistemas propios |
| Automatización | Ninguna | Plantillas, bots, CRM |
| Portabilidad | Total, es una URL | Dependencia del BSP |

Decisión: `wa.me` hasta que el volumen (> 150 solicitudes/mes) o la necesidad de seguimiento justifiquen la API. El diseño de `WhatsAppMessageBuilder` es independiente del canal: el mismo texto sirve para ambos.

## 2. Anatomía del enlace

```
https://wa.me/<número E.164 sin +>?text=<encodeURIComponent(mensaje)>
```

- Número: solo dígitos, con prefijo de país y sin `+`, espacios ni guiones. España: `34` + 9 dígitos. Ejemplo: `34612345678`.
- `text`: mensaje completo codificado con `encodeURIComponent`. Los saltos de línea se codifican como `%0A`; los emojis quedan como secuencias UTF-8 percent-encoded.
- Se usa `wa.me` y no `api.whatsapp.com/send`: es el dominio oficial corto y redirige correctamente a app, escritorio o web según el dispositivo.
- Longitud: los navegadores aceptan URLs de más de 8.000 caracteres, pero WhatsApp recorta textos pre-rellenados largos en algunas versiones. Se limita el mensaje a **1.500 caracteres** antes de codificar.

## 3. `WhatsAppMessageBuilder` (`src/services/whatsapp/`)

### Interfaz

```ts
export interface WhatsAppMessageInput {
  items: CartItem[];          // producto o accesorio, variante, color, cantidad, precio unitario
  total: number;              // calculado por pricing.ts; nunca se recibe del cliente
  currency: 'EUR';
  locale: 'es-ES';
  notes?: string;             // texto libre del cliente
  source?: 'cart' | 'product' | 'compare';
}

export interface WhatsAppMessageResult {
  text: string;               // mensaje en claro
  url: string;                // https://wa.me/<n>?text=...
  truncated: boolean;
  length: number;             // caracteres del texto en claro
}

export interface WhatsAppMessageBuilder {
  build(input: WhatsAppMessageInput, phone: string): WhatsAppMessageResult;
}
```

Es una función pura: sin acceso a `window`, a nanostores ni a `import.meta.env`. El número lo inyecta quien llama (desde `src/config/site.ts`). Esto permite testearla en Vitest y reutilizarla en un futuro backend.

### Orden de líneas

1. Saludo fijo: `Hola 👋`
2. Intención: `Estoy interesado en realizar el siguiente pedido:`
3. Línea en blanco.
4. Por cada ítem, en el orden del carrito (vehículos primero, accesorios después):
   - Cabecera con emoji por tipo: `🏍️` vehículo, `🔋` batería, `🪖` casco, `🧰` otro accesorio.
   - `Variante: …` solo si el producto tiene más de una variante.
   - `Color: …` solo si tiene más de un color.
   - `Cantidad: N`
   - Línea en blanco.
5. `💰 Total estimado: 5.499 €`
6. Línea en blanco y `Notas: …` solo si el cliente escribió notas.
7. Línea en blanco y cierre fijo: `¿Podéis confirmarme disponibilidad y condiciones de compra?`

### Ejemplo de salida

```
Hola 👋
Estoy interesado en realizar el siguiente pedido:

🏍️ ODIN 1.0
Variante: 72V 50Ah
Color: Negro
Cantidad: 1

🔋 Batería adicional
Cantidad: 1

🪖 Casco
Cantidad: 1

💰 Total estimado: 5.499 €

Notas: Recogida en tienda si es posible

¿Podéis confirmarme disponibilidad y condiciones de compra?
```

### Reglas de formato

- Precios con `Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })`: `5.499 €`. Con decimales solo si el total no es entero (`1.234,50 €`).
- No se incluyen precios unitarios por ítem: el total es "estimado" y ventas confirma condiciones. Evita discusiones por desfase entre web y tarifa.
- Los nombres de producto se usan tal cual del catálogo; no se añaden SKU.
- Saltos de línea `\n` (no `\r\n`).
- Texto siempre en español; no se localiza en MVP.

### Saneado de notas del cliente

- Se eliminan caracteres de control y se normaliza a NFC.
- Se colapsan saltos de línea múltiples a uno y espacios repetidos a uno.
- Máximo 300 caracteres; se recorta con `…`.
- Se rechazan (se sustituyen por vacío) cadenas que parezcan URLs (`https?://`) para evitar que el mensaje se use como vector de phishing hacia ventas.
- Nunca se interpreta como Markdown ni HTML; WhatsApp aplica su propio formato (`*negrita*`), que se deja pasar.

### Truncado

Si el texto supera 1.500 caracteres: se recortan primero las notas, después se sustituyen los ítems a partir del octavo por la línea `… y N artículos más (ver carrito)`. El saludo, el total y el cierre nunca se eliminan. `truncated: true` se emite al evento `whatsapp_click` para medir su frecuencia.

## 4. Integración con el carrito

- Isla Preact `CartDrawer` (`client:idle`) y página `/carrito` muestran el botón **"Enviar pedido por WhatsApp"** (componente `Button` variante `primary`, color volt). Es un `<a href={url} target="_blank" rel="noopener noreferrer">`, no un `<button>` con `window.open`, para que funcione con bloqueadores de popups y sea enlazable.
- El `href` se recalcula con cada cambio del store del carrito (`computed` de nanostores), nunca en el `onClick`.
- Al hacer clic se emiten en orden: `purchase_request` (con número de ítems, total, `source`) y `whatsapp_click` (con `truncated`, `length`). Ambos mediante `AnalyticsService`, sin bloquear la navegación ([18-analytics](./18-analytics.md)).
- El carrito **no se vacía** tras el clic: el cliente puede volver y reenviar. Se muestra un `Toast` "Hemos abierto WhatsApp con tu pedido" y un enlace "Copiar mensaje" como alternativa.
- El botón se deshabilita (atributo `aria-disabled` y sin `href`) con carrito vacío.
- En la ficha de producto existe un atajo "Preguntar por WhatsApp" que construye un mensaje de un solo ítem con `source: 'product'`.

## 5. Móvil frente a escritorio

| Dispositivo | Comportamiento del enlace `wa.me` |
|---|---|
| Android con app | Abre WhatsApp con el chat del número y el texto pre-rellenado |
| iOS con app | Igual; si la app no está instalada, Safari muestra la página de `wa.me` con enlace a App Store |
| Escritorio con WhatsApp Desktop | `wa.me` ofrece "Abrir WhatsApp" o "Usar WhatsApp Web" |
| Escritorio sin app | Redirige a WhatsApp Web; requiere sesión vinculada con el móvil |

No se detecta el user agent ni se construyen enlaces distintos: `wa.me` resuelve el destino. Se mantiene `target="_blank"` en todos los casos para no perder el estado del carrito.

## 6. `PUBLIC_WHATSAPP_NUMBER`

- Única fuente: `src/config/site.ts`, que lee `import.meta.env.PUBLIC_WHATSAPP_NUMBER` y la valida en build (`/^\d{8,15}$/`). Ningún componente accede a la variable directamente.
- Valor en producción: número real de ventas. En preview y local: número de pruebas del equipo ([14-devops](./14-devops.md)).
- Cambio de número: runbook en [14-devops](./14-devops.md); no requiere tocar código.
- El número se muestra también en `/contacto` y en el footer como enlace `wa.me` sin texto, con el mismo origen.

### Fallback sin número configurado

Si la variable está vacía o es inválida, `site.ts` expone `whatsapp: null` y:
- El build emite un aviso (no falla) para permitir previews de diseño.
- El botón del carrito se sustituye por "Copiar pedido" (copia el texto al portapapeles) y un enlace a `/contacto`.
- Se emite `whatsapp_click` con `fallback: 'copy'` para detectar la situación en analítica.

## 7. Proceso de ventas tras recibir el mensaje

| Paso | Responsable | SLA |
|---|---|---|
| Primera respuesta (acuse) | Ventas | < 15 min en horario comercial; < 12 h fuera de él |
| Confirmación de disponibilidad y precio final | Ventas | < 4 h laborables |
| Envío de presupuesto formal (PDF) con plazo y forma de pago | Ventas | < 24 h |
| Registro de la solicitud en hoja de seguimiento (MVP) o `order_requests` (futuro) | Ventas | Mismo día |
| Seguimiento si no hay respuesta del cliente | Ventas | A las 48 h y a los 7 días |

Plantillas de respuesta (guardadas como respuestas rápidas en WhatsApp Business):

```
Acuse: ¡Hola! Gracias por tu solicitud. Te confirmo disponibilidad y condiciones en menos de 4 horas. ¿Desde qué provincia nos escribes?
Disponible: Tenemos la ODIN 1.0 72V 50Ah en negro en stock. Precio final 5.499 € IVA incluido, envío a domicilio 120 € o recogida gratuita. ¿Te preparo el presupuesto?
Sin stock: Ese color llega la semana del 15. Puedo reservártela sin compromiso o proponerte el gris, disponible ya.
```

## 8. Métricas

| Métrica | Cálculo | Fuente |
|---|---|---|
| Tasa de solicitud | `whatsapp_click` / sesiones con `add_to_cart` | `AnalyticsService` |
| Valor medio de solicitud | media del `total` en `purchase_request` | `AnalyticsService` |
| Tasa de truncado | `truncated = true` / `whatsapp_click` | `AnalyticsService` |
| Tasa de conversión a venta | ventas cerradas / mensajes recibidos | Hoja de ventas (manual) |
| Tiempo de primera respuesta | media por semana | WhatsApp Business (estadísticas) |

Objetivo inicial: tasa de solicitud > 8 % sobre carritos y primera respuesta < 15 min.

## 9. RGPD

- Voltia no recibe ni almacena datos del cliente en el MVP: el mensaje viaja desde el dispositivo del cliente a WhatsApp; el sitio solo genera una URL. El carrito en `localStorage` contiene ítems y notas, sin datos personales, y nunca sale del navegador.
- En el momento del clic, el cliente comparte con la empresa su número de teléfono y nombre de perfil a través de WhatsApp (Meta Platforms Ireland). La política de privacidad ([15-content-strategy](./15-content-strategy.md)) lo declara como finalidad "gestión de solicitudes de pedido", base legal "medidas precontractuales", con mención a la transferencia internacional que implica el uso de WhatsApp.
- Junto al botón se muestra el texto: "Al continuar se abrirá WhatsApp y compartirás tu número con nuestro equipo de ventas. Más información en la política de privacidad." No es un consentimiento con casilla: la base legal es precontractual.
- El campo de notas advierte: "No incluyas datos bancarios ni documentos de identidad".
- Ventas conserva las conversaciones el tiempo necesario para la venta y, como máximo, 3 años (plazo de garantía) en el dispositivo corporativo con WhatsApp Business.

## 10. Futuro: Business API y CRM

1. **Fase 1 (sin API)**: formulario opcional en `/carrito` que envía la solicitud a `order_requests` en Supabase mediante Edge Function, además de abrir WhatsApp; permite medir conversión real y tener historial.
2. **Fase 2**: WhatsApp Business API a través de un BSP; el `OrderRequest` genera un mensaje de plantilla aprobado por Meta y se asocia a `whatsapp_requests` ([06-database](./06-database.md)).
3. **Fase 3**: panel de ventas en `/admin` ([17-admin-panel](./17-admin-panel.md)) con estado de cada solicitud y respuestas desde la interfaz.

En todas las fases `WhatsAppMessageBuilder` se mantiene como única fuente del texto, y `wa.me` permanece como canal de respaldo.
