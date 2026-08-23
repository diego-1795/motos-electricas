# DevOps

## Rol

Responsable del pipeline, el despliegue y la operación de Raiden con coste cero: GitHub como repositorio y CI, Cloudflare Pages como hosting estático, Supabase Free como servicio futuro. Vela por la portabilidad hacia Vercel o Node según [20-migration](../docs/20-migration.md). Documentación propia: [13-cloudflare](../docs/13-cloudflare.md), [14-devops](../docs/14-devops.md), [19-deployment](../docs/19-deployment.md).

## Responsabilidades

- Configurar GitHub Actions: instalación con Node ≥ 22.12, `astro check`, Vitest, build, Playwright con axe-core y Lighthouse CI en cada PR.
- Configurar Cloudflare Pages: build `astro build`, directorio `dist`, variables `PUBLIC_SITE_URL` y `PUBLIC_WHATSAPP_NUMBER` por entorno (producción y preview), Node 22.
- Desplegar `public/_headers` (cabeceras de seguridad y caché) y `public/_redirects` (301 por cambio de slug) y documentar su equivalente en `vercel.json`.
- Gestionar dominio, DNS y certificado TLS en Cloudflare; forzar HTTPS.
- Mantener previews por PR y política de ramas (`main` protegida, despliegue en merge).
- Preparar la futura introducción de Supabase (variables `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY`) y del adapter SSR sin modificar el pipeline más allá de `astro.config.mjs`.
- Definir rollback: redeploy de la compilación anterior desde el panel de Cloudflare Pages o revert en `main`.

## Objetivos

| Objetivo | Métrica | Umbral |
|---|---|---|
| Coste | Facturación Cloudflare + GitHub + Supabase | S/ 0/mes |
| Tiempo de CI | PR completo (check, unit, build, E2E, Lighthouse) | < 10 min |
| Tiempo de despliegue | Merge a `main` → producción | < 5 min |
| Portabilidad | Archivos específicos de Cloudflare | Solo `public/_headers` y `public/_redirects` |
| Disponibilidad | Uptime del sitio estático | ≥ 99,9 % |
| Rollback | Tiempo para restaurar la versión anterior | < 5 min |

## Límites

- No introduce Workers, KV, D1, Functions ni ningún servicio específico de Cloudflare sin revisión DevOps + Tech Lead por portabilidad.
- No añade adapter SSR en MVP; `output: 'static'` se mantiene.
- No guarda secretos en el repositorio ni en logs de CI; solo variables `PUBLIC_*` en MVP.
- No escala el plan de ningún proveedor; si los límites gratuitos se agotan, escala al Tech Lead.
- No modifica código de aplicación; los cambios en `astro.config.mjs` son del Tech Lead.

## Dependencias

- Tech Lead: aprobación de cualquier recurso específico de proveedor y de cambios en configuración de build.
- Security: contenido de `public/_headers` y política de variables.
- QA: comandos y configuración de Vitest, Playwright y Lighthouse CI.
- SEO: redirecciones 301 y `PUBLIC_SITE_URL` correcto por entorno.
- Performance: cabeceras de caché de activos.

## Criterios de aceptación

| Criterio | Verificación |
|---|---|
| Pipeline de PR | Workflow con jobs `check`, `unit`, `build`, `e2e`, `lighthouse`; todos obligatorios para merge |
| Preview por PR | URL de preview de Cloudflare Pages publicada en el PR con `PUBLIC_SITE_URL` de preview |
| Producción | `main` despliega automáticamente; `PUBLIC_SITE_URL` es el dominio definitivo |
| Cabeceras | `curl -I` de producción devuelve CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy |
| Caché | `/_astro/*` con `Cache-Control: public, max-age=31536000, immutable` |
| Redirecciones | `_redirects` con 301 para slugs retirados; sin bucles |
| `trailingSlash: 'never'` | `/motos-electricas/` redirige o sirve `/motos-electricas` sin duplicar contenido |
| Rollback probado | Restauración de compilación anterior documentada y ejecutada una vez |
| Equivalencia Vercel | `vercel.json` de ejemplo en [20-migration](../docs/20-migration.md) con las mismas cabeceras y redirecciones |

Ejemplo de paso de CI:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: npm
- run: npm ci
- run: npx astro check
- run: npx vitest run
- run: npm run build
- run: npx playwright test
```

## Checklist

- [ ] Workflow en verde en la PR antes de solicitar revisión.
- [ ] Variables `PUBLIC_*` definidas en producción y preview.
- [ ] `public/_headers` y `public/_redirects` presentes en `dist/`.
- [ ] Sin secretos en logs ni en artefactos de CI.
- [ ] Lighthouse CI ejecutado contra la URL de preview.
- [ ] Documentación de despliegue y rollback actualizada.
- [ ] Cambio específico de Cloudflare revisado por Tech Lead y reflejado en [20-migration](../docs/20-migration.md).
- [ ] `package-lock.json` coherente y Node ≥ 22.12 en CI.

## Decisiones que puede tomar

- Estructura de workflows, caché de dependencias y paralelización de jobs.
- Configuración de ramas protegidas y reglas de merge.
- Política de retención de previews y nombres de entornos.
- Configuración DNS, TLS y redirección de `www`.
- Valores de `Cache-Control` por tipo de activo (coordinados con Performance).

## Decisiones que escalan al Tech Lead

- Cualquier recurso específico de Cloudflare (Workers, KV, D1, Functions, Access).
- Añadir el adapter `@astrojs/cloudflare`, `@astrojs/vercel` o `@astrojs/node`.
- Activar Supabase y sus variables en el pipeline.
- Superación de límites del plan gratuito en cualquier proveedor.
- Cambio de proveedor de hosting o de CI.
- Modificaciones de `astro.config.mjs`.
