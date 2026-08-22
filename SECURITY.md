# Política de seguridad — Voltia

## Reportar una vulnerabilidad

- Escribe a **security@voltia.example.com** (sustituir por el buzón real antes del lanzamiento) o abre un *Security Advisory* privado en GitHub (Security → Report a vulnerability). **No** abras issues públicos para vulnerabilidades.
- Incluye: URL afectada, pasos para reproducir, impacto estimado y, si lo tienes, un PoC. Respondemos en un máximo de 5 días laborables y publicamos la corrección junto con el crédito al reportante si lo desea.
- Alcance: el sitio público (`https://voltia.es` y previews `*.pages.dev`), este repositorio y sus workflows de CI. Fuera de alcance: WhatsApp/Meta, Cloudflare y GitHub como plataformas, y ataques que requieran un dispositivo o navegador ya comprometido.
- Versiones soportadas: solo la rama `main` desplegada en producción.

## Modelo de amenazas (sitio estático + traspaso a WhatsApp)

Voltia es un sitio 100 % estático sin backend propio, sin cuentas de usuario, sin pagos online y sin cookies. El único "canal de escritura" es un enlace `https://wa.me/<número>?text=...` que el usuario abre voluntariamente. Detalle en [docs/10-security](./docs/10-security.md).

| Activo | Amenaza | Control |
|---|---|---|
| HTML/JS servido | XSS vía notas del carrito o parámetros URL | Escape por defecto de Astro/Preact; sin `set:html`/`innerHTML` con entrada de usuario; CSP con `script-src 'self'` (sin `unsafe-inline` en scripts) |
| Enlace `wa.me` | Inyección de texto, cambio de número, URL excesiva | Número solo desde `src/config/site.ts` (`PUBLIC_WHATSAPP_NUMBER`), nunca de props/URL/localStorage; `sanitizeNotes` (control chars fuera, longitud máxima); `encodeURIComponent` sobre el mensaje completo; el mensaje es **visible para el usuario en WhatsApp antes de enviarlo** |
| Carrito | Alteración de precios o ítems | Solo en `localStorage` (`voltia:cart:v1`) con `{productId, variantId, colorId, quantity}`; precios recalculados desde el catálogo en cada render; estructura validada al hidratar |
| Datos personales | Fuga / RGPD | **No se almacena PII**: ni nombre, ni teléfono, ni email, ni notas persistidas; sin cookies ni trackers; analítica opcional sin cookies |
| Clickjacking | Iframe malicioso | `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| Cadena de suministro | Paquete npm o Action comprometida | `npm ci` con lockfile, `npm audit --audit-level=high` bloqueante, `--ignore-scripts` donde es posible, `permissions: contents: read`, sin secretos en CI |
| Secretos | Filtración en bundle/repo | Solo variables `PUBLIC_*` (públicas por diseño); no existen claves privadas en el MVP; `.env` ignorado; CI escanea `src/`, `public/` y `dist/` |
| Dominio/TLS | Downgrade, suplantación | HSTS (1 año, `includeSubDomains`, `preload`), `upgrade-insecure-requests`, TLS Full (strict) en Cloudflare |

## Cabeceras HTTP

Definidas en [`public/_headers`](./public/_headers) (Cloudflare Pages/Netlify) y replicadas en [`vercel.json`](./vercel.json).

| Cabecera | Valor |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'sha256-…' ×6 https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://wa.me; manifest-src 'self'; worker-src 'self'; upgrade-insecure-requests` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Cache-Control` (`/_astro/*`) | `public, max-age=31536000, immutable` |

Notas sobre la CSP:

- `script-src` **no** usa `unsafe-inline`. Los módulos van bajo `/_astro/` (`'self'`); los seis scripts que Astro inlina (runtime de islas `astro-island`, cargadores `client:load/idle/visible` y los `<script>` pequeños de `Header.astro` y `CatalogView.astro`) se autorizan por hash `sha256`. CI falla si aparece un script inline sin hash y muestra el valor a añadir en `public/_headers` y `vercel.json`. Los bloques `<script type="application/ld+json">` son datos y no se ejecutan.
- `style-src 'unsafe-inline'` es necesario por los estilos scoped de Astro (`inlineStylesheets: 'auto'`) y las islas Preact.
- Los orígenes `cloudflareinsights.com` solo se usan si `PUBLIC_CF_BEACON_TOKEN` está definido. Si se descarta Web Analytics, retirarlos.
- Los enlaces `wa.me` son navegaciones (`<a href target="_blank">`), no peticiones: la CSP no los afecta. `form-action` incluye `https://wa.me` por si el carrito pasa a usar `<form action>`.
- Cualquier cambio de CSP requiere aprobación Security + Tech Lead ([agents/security.md](./agents/security.md)).

## Variables de entorno

- Únicamente `PUBLIC_SITE_URL`, `PUBLIC_WHATSAPP_NUMBER`, `PUBLIC_CONTACT_EMAIL`, `PUBLIC_ANALYTICS` y `PUBLIC_CF_BEACON_TOKEN`. Todas acaban en el bundle: **nunca** pongas un secreto en una variable `PUBLIC_*`.
- Si en el futuro aparece una clave privada (Supabase `service_role`, SMTP…), vive solo en GitHub/Cloudflare Secrets y jamás se lee desde `src/`.

## Comprobaciones automáticas (CI)

- `npm audit --audit-level=high` (falla con high/critical).
- Grep de teléfonos/secretos en `src/` y `public/` (única excepción permitida: el valor por defecto de `src/config/site.ts`).
- Verificación de que `dist/_headers` existe, de que `dist/` no contiene tokens y de que todo script inline de `dist/` tiene su hash `sha256` en la CSP.
- Lighthouse CI con categoría *best-practices* ≥ 0,95 (incluye comprobaciones de CSP y HTTPS).

## Auditoría manual recomendada antes de cada release

1. `curl -I https://voltia.es` → CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy presentes.
2. securityheaders.com y Mozilla Observatory con nota A/A+.
3. Consola del navegador sin violaciones CSP en `/`, una ficha de producto, `/carrito`, `/comparar` y `/encuentra-tu-moto`.
4. Añadir un producto, escribir notas con `<script>` y saltos de línea, pulsar "Solicitar pedido": el texto llega codificado en `?text=` y nunca se renderiza como HTML.
