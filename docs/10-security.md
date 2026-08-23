# 10 — Seguridad

Raiden en MVP es un sitio estático sin backend propio, sin cuentas de usuario y sin pagos. La superficie de ataque es pequeña, pero no nula: el carrito vive en el navegador, el mensaje de WhatsApp se construye con entradas del usuario y la cadena de suministro (npm, GitHub Actions, Cloudflare) es compartida. Este documento fija el modelo de amenazas y los controles obligatorios. Ver [01-architecture](./01-architecture.md), [13-cloudflare](./13-cloudflare.md), [16-whatsapp-commerce](./16-whatsapp-commerce.md) y [05-backend](./05-backend.md) para el futuro con Supabase.

## 1. Modelo de amenazas

| Activo | Amenaza | Impacto | Mitigación |
|---|---|---|---|
| HTML/JS servido | Inyección de script por XSS (notas del carrito, parámetros URL) | Robo de sesión futura, defacement | Escape por defecto de Astro/Preact, sin `set:html`/`dangerouslySetInnerHTML` con entrada de usuario, CSP estricta |
| Enlace wa.me | Manipulación del mensaje (inyección de texto, URL larga, número cambiado) | Fraude, phishing al equipo de ventas | Número desde `site.ts`, `encodeURIComponent`, límite de longitud, sanitización de notas |
| localStorage `raiden:cart:v1` | Lectura/alteración por extensión o XSS | Carrito alterado (bajo impacto) | Sin datos personales ni sensibles; validación al hidratar; precios recalculados desde catálogo |
| Catálogo JSON en repo | Commit malicioso o erróneo | Precios/datos falsos publicados | Revisión de PR obligatoria, validación de esquema en test, rama `main` protegida |
| Dependencias npm | Paquete comprometido (typosquatting, versión maliciosa) | Código malicioso en el build | Lockfile, `npm ci`, `npm audit`, Renovate con revisión, sin postinstall de terceros desconocidos |
| GitHub Actions | Action comprometida o secreto filtrado | Despliegue malicioso | Actions fijadas por SHA, permisos mínimos, secretos solo en Cloudflare |
| Cloudflare Pages | Cuenta comprometida | Control del dominio | 2FA obligatorio, tokens con alcance mínimo, rotación |
| Dominio/DNS | Secuestro, falta de HTTPS | Suplantación | DNSSEC, HSTS con preload, HTTPS forzado |
| Clickjacking | Sitio embebido en iframe malicioso | Clics engañados hacia WhatsApp | `X-Frame-Options: DENY`, `frame-ancestors 'none'` |
| Privacidad de visitantes | Rastreo sin consentimiento | Sanción RGPD/LSSI | Sin cookies ni trackers en MVP; analítica sin cookies opcional |
| Teléfono de ventas | Scraping/spam | Molestia operativa | Número solo en `PUBLIC_WHATSAPP_NUMBER`, enlace generado en cliente al hacer clic (no inline en HTML) |

## 2. Cabeceras de seguridad (`public/_headers`)

Formato Cloudflare Pages/Netlify. La CSP permite el script inline mínimo que Astro genera para islas mediante `'unsafe-inline'` solo en estilos (los `style` inline de `inlineStylesheets`), no en scripts: Astro emite los scripts de islas como módulos externos en `/_astro/`, por lo que `script-src 'self'` basta. El beacon de Cloudflare Web Analytics se incluye únicamente si está activado.

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://wa.me https://api.whatsapp.com; upgrade-insecure-requests
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  X-Permitted-Cross-Domain-Policies: none

/_astro/*
  Cache-Control: public, max-age=31536000, immutable
```

Notas:
- Los enlaces `wa.me` son navegaciones `<a href>`, no afectadas por `connect-src`; `form-action` se incluye por si en el futuro el carrito usa `<form action>`.
- Si un script inline resulta imprescindible (p. ej. tema oscuro anti-flash), se usa `sha256-…` calculado en build, nunca `'unsafe-inline'` en `script-src`.
- Si se desactiva Cloudflare Web Analytics, se eliminan los dos orígenes `cloudflareinsights`.
- HSTS `preload` solo tras verificar que todos los subdominios sirven HTTPS.
- Equivalente Vercel (`vercel.json` → `headers`) en [20-migration](./20-migration.md). Se prueba con securityheaders.com y Mozilla Observatory antes de cada release.

## 3. Variables de entorno

- Solo variables con prefijo `PUBLIC_` llegan al cliente: `PUBLIC_SITE_URL`, `PUBLIC_WHATSAPP_NUMBER`, `PUBLIC_CF_ANALYTICS_TOKEN` (opcional).
- Ninguna de ellas es secreta. No existe en MVP ninguna clave privada; si aparece (Supabase service role, SMTP), vive exclusivamente en Cloudflare/GitHub Secrets y nunca se lee desde `src/`.
- `.env` en `.gitignore`; `.env.example` con valores ficticios. El build falla si falta `PUBLIC_WHATSAPP_NUMBER` (comprobación en `site.ts`).
- `PUBLIC_WHATSAPP_NUMBER` se valida con `/^\d{8,15}$/` (formato internacional sin `+`).

## 4. Validación de entradas (sin dependencias)

Validadores manuales en `src/domain/validation.ts`, funciones puras con tests en Vitest.

| Entrada | Origen | Regla |
|---|---|---|
| `productId`, `variantId`, `colorId` | Isla AddToCart, localStorage | Deben existir en el catálogo serializado; si no, se descarta el ítem |
| `quantity` | QuantityStepper, localStorage | Entero 1–10; fuera de rango se recorta |
| `notes` | Textarea del carrito | Máximo 300 caracteres; se eliminan caracteres de control; sin URLs (se rechazan `http://`, `https://`, `wa.me`) |
| Respuestas del finder | Isla Finder | Solo valores del enum definido (`uso`, `presupuesto`, `licencia`, `distancia`) |
| Parámetros URL (`?marca=`, `?ids=`) | Comparador, filtros | Lista blanca de slugs existentes; máximo 4 ids en comparador |
| Estado persistido | `raiden:cart:v1` | Validación completa al hidratar; si la versión del esquema no coincide se reinicia el carrito |

Los precios nunca se leen del estado persistido: el total se recalcula con `pricing.ts` a partir del catálogo en cada render.

## 5. Construcción segura del enlace wa.me

```ts
// src/services/WhatsAppMessageBuilder.ts (extracto)
const MAX_MESSAGE = 1800; // margen bajo el límite práctico de ~2000 car. en URL
export function buildWhatsAppUrl(cart: Cart, notes: string): string {
  const phone = SITE.whatsappNumber; // validado en site.ts, nunca del usuario
  const text = truncate(buildMessage(cart, sanitizeNotes(notes)), MAX_MESSAGE);
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
export function sanitizeNotes(raw: string): string {
  return raw.replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}
```

- El número nunca proviene de props, URL ni localStorage.
- `encodeURIComponent` sobre el texto completo; sin concatenación manual de `%20`.
- El enlace se abre con `target="_blank" rel="noopener noreferrer"`.
- Los nombres de producto provienen del catálogo, no del usuario; aun así pasan por `sanitizeNotes`.
- Ver el formato de mensaje en [16-whatsapp-commerce](./16-whatsapp-commerce.md).

## 6. localStorage

Clave `raiden:cart:v1` contiene solo `{ version, items: [{productId, variantId, colorId, quantity}], updatedAt }`. Nunca nombre, teléfono, email, dirección ni notas (las notas viven en memoria y se descartan al cerrar). Si se necesita guardar contacto en el futuro, requiere decisión explícita y aviso al usuario.

## 7. Dependencias y cadena de suministro

- `package-lock.json` versionado; CI usa `npm ci`. `npm audit --audit-level=high` en CI (fallo bloqueante para `high`/`critical`).
- Renovate (o Dependabot) con agrupación semanal; las actualizaciones mayores las revisa el Tech Lead; toda nueva dependencia frontend pasa por Frontend + Performance ([09-performance](./09-performance.md)).
- Política: cero dependencias de runtime más allá de Astro, Preact y nanostores. `ignore-scripts=true` en `.npmrc` para CI salvo excepción documentada.
- GitHub Actions fijadas por SHA completo; `permissions: contents: read` por defecto; despliegue con token de Cloudflare de alcance "Pages: Edit" únicamente.
- Rama `main` protegida: PR obligatoria, CI verde, una revisión.

## 8. Futuro (fuera del MVP)

- **Supabase**: RLS activado en todas las tablas; `anon` solo `select` sobre catálogo publicado; `order_requests` e `inserts` vía Edge Function con validación servidor; `service_role` nunca en cliente. Detalle en [05-backend](./05-backend.md) y [06-database](./06-database.md).
- **Rate limiting**: en Cloudflare Workers o Supabase Edge Functions (por IP y por huella), para formularios de contacto y registro de solicitudes.
- **CAPTCHA**: Cloudflare Turnstile (gratuito, sin cookies de rastreo) en formularios con escritura en backend. Añadir `https://challenges.cloudflare.com` a `script-src` y `frame-src` solo entonces.
- **Admin** `/admin`: Supabase Auth, MFA, sesiones cortas, RLS por rol ([17-admin-panel](./17-admin-panel.md)).

## 9. Cumplimiento RGPD / LSSI

- MVP: cero cookies, cero almacenamiento con fines de rastreo → no hace falta banner de cookies. `localStorage` del carrito es funcional y exento de consentimiento (se informa en la política de privacidad).
- Cloudflare Web Analytics no usa cookies ni huella persistente; se menciona en privacidad.
- Páginas obligatorias en `/legal/`: aviso legal (datos del titular LSSI), privacidad (base legal del contacto por WhatsApp: interés legítimo/ejecución precontractual), cookies (declaración de que no se usan), condiciones de venta.
- El envío por WhatsApp implica tratamiento por Meta: se informa en privacidad y el usuario inicia la acción con un clic explícito.
- Futuro con backend: registro de actividades de tratamiento, retención de `order_requests` ≤ 24 meses, derecho de supresión.

## 10. Checklist de auditoría

- [ ] `_headers` desplegado; A+ en securityheaders.com; sin errores CSP en consola en home, producto, carrito, comparador y finder.
- [ ] Ningún `set:html` ni `dangerouslySetInnerHTML` con datos no provenientes del repo.
- [ ] `grep -r "PUBLIC_" src/` solo muestra las 3 variables aprobadas; ningún secreto en `src/` ni en `dist/`.
- [ ] Número de WhatsApp solo en `site.ts`; `grep -rE "\+?34[0-9]{9}" src/` vacío.
- [ ] Tests de `sanitizeNotes`, `buildWhatsAppUrl` (longitud, encoding, caracteres de control) y de validación de estado persistido en verde.
- [ ] `npm audit` sin high/critical; lockfile sin cambios no revisados.
- [ ] Actions fijadas por SHA; permisos mínimos; secretos no impresos en logs.
- [ ] HSTS activo; HTTP → HTTPS 301; DNSSEC activado.
- [ ] Páginas legales publicadas y enlazadas en el footer.
- [ ] Revisión trimestral de este documento y de la CSP.
