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
| Privacidad de visitantes | Rastreo sin consentimiento | Sanción de la Autoridad de Protección de Datos (Ley N.º 29733) / INDECOPI | Sin cookies ni trackers en MVP; analítica sin cookies opcional |
| Teléfono de ventas | Scraping/spam | Molestia operativa | Número solo en `PUBLIC_WHATSAPP_NUMBER`, enlace generado en cliente al hacer clic (no inline en HTML) |

## 2. Cabeceras de seguridad (`public/_headers`)

**Fuente de verdad: [`public/_headers`](../public/_headers)** (formato Cloudflare Pages/Netlify), replicado byte a byte en [`vercel.json`](../vercel.json). Este documento no copia la política literal (la auditoría del 2026-11-08 encontró tres versiones distintas en los docs): aquí solo se explica cada directiva. La CI comprueba en cada build que todo script inline de `dist/` tiene su hash en la CSP (paso "CSP: hashes de scripts inline" de `ci.yml`).

| Directiva / cabecera | Valor en `_headers` | Por qué |
|---|---|---|
| `script-src` | `'self'` + 10 hashes `sha256-…` + `'wasm-unsafe-eval'` + `https://static.cloudflareinsights.com` | Sin `'unsafe-inline'`. Astro inlina el runtime de islas (4 scripts) y los `<script>` pequeños de 6 componentes: se autorizan por hash y cambian al actualizar Astro o editar esos componentes (la CI imprime los hashes nuevos). `wasm-unsafe-eval`: Pagefind compila WebAssembly. El beacon de Cloudflare solo se carga si `PUBLIC_CF_BEACON_TOKEN` está definido. |
| `style-src` | `'self' 'unsafe-inline'` | Estilos scoped de Astro (`inlineStylesheets: 'auto'`) e islas Preact. |
| `img-src` / `font-src` | `'self' data:` / `'self'` | Imágenes y fuentes self-hosted. |
| `connect-src` | `'self' https://cloudflareinsights.com` | Solo el propio origen (y el beacon si está activo). |
| `frame-src` | `https://www.youtube-nocookie.com` | Facade de vídeo de la ficha: el iframe se crea solo al pulsar reproducir. |
| `frame-ancestors` / `X-Frame-Options` | `'none'` / `DENY` | Anti clickjacking. |
| `object-src`, `base-uri`, `manifest-src`, `worker-src` | `'none'`, `'self'`, `'self'`, `'self'` | Cierre por defecto. |
| `form-action` | `'self' https://wa.me` | Por si el carrito pasara a `<form action>`. Los enlaces `wa.me` son navegaciones `<a href>` y no dependen de la CSP. |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | `preload` solo tras verificar que todos los subdominios sirven HTTPS. |
| `Referrer-Policy`, `Permissions-Policy`, `COOP`, `CORP`, `X-Content-Type-Options`, `X-Permitted-Cross-Domain-Policies` | ver fichero | Endurecimiento estándar. |
| `/admin`, `/admin/*` | CSP propia (`connect-src 'self'`, `frame-src 'none'`, solo los 4 hashes del runtime), `X-Robots-Tag: noindex`, `Cache-Control: no-store` | Panel de administración (ADR-018). |
| `/docs/*` | `Content-Disposition: attachment`, `nosniff` | Los PDF subidos desde el panel se descargan en vez de abrirse en el visor dentro del origen del sitio. |
| `/_astro/*` | `Cache-Control: public, max-age=31536000, immutable` | Activos con hash en el nombre. |

Se prueba con securityheaders.com y Mozilla Observatory antes de cada release. Cualquier cambio de CSP: Security + Tech Lead ([agents/security.md](../agents/security.md)).

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
- **Admin sobre Supabase**: Auth, MFA, sesiones cortas, RLS por rol ([17-admin-panel](./17-admin-panel.md) §3), solo si el catálogo crece.

## 8b. Panel de administración `/admin` (ADR-018, ADR-024)

- **Identidad (ADR-024):** email + contraseña contra las Pages Functions. Contraseñas en PBKDF2-SHA256 (100 000 iteraciones, sal aleatoria) guardadas en el KV `ADMIN_KV`; la temporal que asigna el administrador va ya en hash en `ADMIN_INITIAL_PASSWORDS` y hay que cambiarla en la primera entrada. Sesión en cookie `raiden_admin` firmada con HMAC-SHA256 (`SESSION_SECRET`), `HttpOnly`, `SameSite=Strict`, `Secure`, `Path=/api/admin`, 12 h; lleva la versión de la contraseña, así que cambiarla invalida las demás sesiones. Bloqueo tras 5 fallos por cuenta / 20 por IP durante 15 min (423); mismo mensaje y mismo coste para email desconocido y contraseña incorrecta.
- **CSRF:** cookie `SameSite=Strict` + `Origin` igual al propio origen en toda petición con efectos (403) + `Content-Type: application/json` obligatorio (415).
- **Perímetro opcional:** Cloudflare Access (Zero Trust) delante de `/admin` y `/api/admin/*`. Si `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` están definidos, las Functions exigen además el JWT `Cf-Access-Jwt-Assertion` (firma RS256 contra el JWKS del equipo, `aud`, `iss`, `exp`) y que su email coincida con el de la sesión.
- **Rol en servidor:** `ADMIN_EMAILS`/`EDITOR_EMAILS`; sin rol no se emite cookie. La interfaz no decide nada: un editor que llame a `PUT`/`DELETE` o envíe un `PATCH` con campos fuera de precio/`hidden` recibe 403/422. El editor no recibe la lista de administradores en `/me`.
- **Secretos:** `SESSION_SECRET`, `GITHUB_TOKEN` (token *fine-grained*, permiso *Contents* solo sobre el repositorio) y, opcional, `CF_API_TOKEN` (solo lectura de deployments) viven en las variables de Pages marcadas como secreto. Nunca en `src/`, `PUBLIC_*`, `.env.example` ni en logs (las Functions no registran cabeceras ni tokens). La CI sigue comprobando que `dist/` no contiene secretos.
- **Validación:** todo lo que se escribe pasa por `src/content/schemas.ts` (`strict`, sin claves desconocidas) y `src/domain/catalogRules.ts`; el `sha` del fichero evita sobrescrituras ciegas (409).
- **Cabeceras:** `public/_headers` da a `/admin` una CSP propia (`default-src 'self'`, `connect-src 'self'`, sin terceros, `frame-src 'none'`), `X-Robots-Tag: noindex` y `Cache-Control: no-store`; `/api/admin/*` también `no-store`.
- **Modo local:** la identidad simulada (`ADMIN_LOCAL_USER`) solo se acepta si el host de la petición es `localhost` y `NODE_ENV` no es `production`; nunca se define en Pages y en `.dev.vars` va comentada por defecto (el login real funciona en local con el KV de wrangler).
- **Blog:** el cuerpo Markdown no admite etiquetas HTML crudas (`<script>`, `<iframe>`, `<meta>`, `<style>`, `<form>`…) ni enlaces `javascript:`/`data:`; lo comprueban `blogRules` (panel) y `validate:content` (CI). Los PDF de `/docs/*` se sirven con `Content-Disposition: attachment`.
- **Auditoría:** el historial de git (`chore(catalog): <acción> <slug> por <email>` + motivo) es el registro; GitHub conserva autor, fecha y diff.

## 9. Cumplimiento legal en Perú (Ley N.º 29733 e INDECOPI)

- MVP: cero cookies, cero almacenamiento con fines de rastreo → no hace falta banner de cookies. `localStorage` del carrito es funcional y exento de consentimiento (se informa en la política de privacidad).
- Cloudflare Web Analytics no usa cookies ni huella persistente; se menciona en privacidad.
- Páginas obligatorias en `/legal/`: términos y condiciones (datos del titular: razón social, RUC, domicilio; Libro de Reclamaciones de INDECOPI), privacidad (base legal del contacto por WhatsApp: interés legítimo/ejecución precontractual), cookies (declaración de que no se usan), condiciones de venta.
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
