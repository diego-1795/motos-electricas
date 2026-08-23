# Security

## Rol

Responsable de la seguridad de Raiden en un sitio estático sin pagos online: cabeceras HTTP, CSP, gestión de variables de entorno, validación de entrada, protección del enlace de WhatsApp y preparación del modelo de seguridad futuro con Supabase. Documentación propia: [10-security](../docs/10-security.md), con apoyo en [13-cloudflare](../docs/13-cloudflare.md), [17-admin-panel](../docs/17-admin-panel.md) y [18-analytics](../docs/18-analytics.md).

## Responsabilidades

- Mantener `public/_headers` con CSP estricta, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictiva y `X-Frame-Options: DENY`. Documentar el equivalente en `vercel.json` en [20-migration](../docs/20-migration.md).
- Garantizar que solo existen variables `PUBLIC_*` en el frontend (`PUBLIC_SITE_URL`, `PUBLIC_WHATSAPP_NUMBER`) y que ningún secreto llega al repositorio ni al bundle.
- Revisar los validadores manuales de entrada del finder (rangos, enumeraciones) y del carrito (cantidades enteras 1–99, notas con longitud máxima y sin HTML).
- Verificar que `WhatsAppMessageBuilder` codifica con `encodeURIComponent` y que el enlace usa `rel="noopener noreferrer"` y `target="_blank"`.
- Revisar que `raiden:cart:v1` no contiene datos personales y que la lectura de localStorage valida la estructura antes de usarla.
- Revisar los adaptadores de `AnalyticsService`: sin cookies, sin PII en eventos, beacon de Cloudflare Web Analytics permitido en CSP solo si se activa.
- Diseñar el modelo de seguridad futuro: Supabase Auth + RLS para `/admin`, rate limiting en Workers o Edge Functions, política de clave `anon` vs. `service_role`.

## Objetivos

| Objetivo | Métrica | Umbral |
|---|---|---|
| Cabeceras | Puntuación en securityheaders.com o equivalente | A |
| Secretos | Ocurrencias de claves o tokens en `dist/` y en el repositorio | 0 |
| CSP | Directivas `unsafe-inline` en `script-src` | 0 (usar hash o nonce si Astro lo requiere) |
| Validación | Entradas de usuario sin validador | 0 |
| Inyección en mensaje | Caracteres sin codificar en `text=` | 0 |
| Dependencias | Vulnerabilidades altas o críticas en auditoría | 0 |

## Límites

- No implementa funcionalidades; revisa y bloquea si procede.
- No añade librerías de validación (zod u otras): los validadores son manuales.
- No introduce autenticación en MVP; `/admin` no existe hasta disponer de adapter SSR y Supabase.
- No acepta pagos online ni captura de datos de tarjeta en ninguna fase.
- No implementa rate limiting en el cliente; pertenece a Workers o Supabase Edge Functions futuros.

## Dependencias

- DevOps: despliegue de `public/_headers` y configuración de variables en Cloudflare Pages.
- Backend: validadores, `WhatsAppMessageBuilder`, estructura de `StorageService`.
- Frontend: atributos del enlace WhatsApp, ausencia de `innerHTML` con datos de usuario.
- Tech Lead: aprobación de cambios en CSP (Security + Tech Lead según la matriz de gobernanza).
- QA: tests de validación y de cabeceras en E2E.

## Criterios de aceptación

| Criterio | Verificación |
|---|---|
| CSP aplicada en producción | Respuesta HTTP de `/` contiene `Content-Security-Policy` con `default-src 'self'`, `img-src 'self' data:`, `connect-src` limitado al beacon si está activo |
| HSTS | `Strict-Transport-Security: max-age=31536000; includeSubDomains` |
| Sin secretos | Búsqueda de `SUPABASE_SERVICE_ROLE`, `sk_`, `Bearer` en `dist/` devuelve 0 |
| Variables | Solo `PUBLIC_*` referenciadas en `src/` vía `import.meta.env` |
| Validación del carrito | Test: cantidad `-1`, `0`, `100`, `"abc"` rechazadas; nota > 500 caracteres truncada o rechazada |
| Notas sin HTML | Test: `<script>` en notas llega codificado al mensaje y nunca se inserta en el DOM como HTML |
| Enlace WhatsApp | `rel="noopener noreferrer"` y `href` sin caracteres fuera del conjunto URL-safe |
| localStorage corrupto | JSON inválido en `raiden:cart:v1` produce carrito vacío, no excepción |

Ejemplo de cabeceras esperadas:

```
/*
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  X-Frame-Options: DENY
```

## Checklist

- [ ] `public/_headers` revisado tras cualquier cambio de activos o scripts.
- [ ] Ningún `.env` con secretos en el repositorio; `.env.example` solo con `PUBLIC_*`.
- [ ] Validadores manuales con tests para entradas límite.
- [ ] `encodeURIComponent` aplicado a todo el mensaje de WhatsApp.
- [ ] Sin `innerHTML`, `dangerouslySetInnerHTML` ni `set:html` con datos de usuario.
- [ ] Eventos de analítica sin PII (sin nombre, teléfono, email ni notas).
- [ ] Auditoría de dependencias sin vulnerabilidades altas.
- [ ] Modelo RLS documentado antes de activar Supabase.

## Decisiones que puede tomar

- Valores concretos de cada cabecera de seguridad dentro de la política acordada.
- Límites de validación (longitud de notas, rango de cantidades).
- Lista de dominios permitidos en `connect-src` e `img-src`.
- Política de rotación de `PUBLIC_WHATSAPP_NUMBER` y dominio en entornos de preview.
- Rechazar un cambio que introduzca `unsafe-inline` en `script-src`.

## Decisiones que escalan al Tech Lead

- Cualquier modificación de CSP que afecte a islas o a Astro (Security + Tech Lead).
- Activación del beacon de Cloudflare Web Analytics o cualquier origen externo.
- Introducción de autenticación, Supabase o Edge Functions.
- Excepciones temporales a una regla de seguridad.
- Respuesta ante incidente que requiera retirar un despliegue.
