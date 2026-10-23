# 14 — DevOps

Define cómo se desarrolla, integra y despliega Raiden. El principio es el mismo que en [01-architecture](./01-architecture.md): todo vive en el repositorio (configuración, cabeceras, contenido), y el proveedor de hosting es intercambiable. Despliegue en detalle en [19-deployment](./19-deployment.md); hosting en [13-cloudflare](./13-cloudflare.md).

## 1. Flujo git

Se adopta **GitHub Flow** (trunk-based con ramas cortas). `main` es siempre desplegable y es la rama de producción en Cloudflare Pages.

| Rama | Propósito | Vida | Preview |
|---|---|---|---|
| `main` | Producción | Permanente | Producción |
| `feat/<tema>` | Funcionalidad | < 5 días | Sí |
| `fix/<tema>` | Corrección | < 2 días | Sí |
| `content/<tema>` | Productos, blog, FAQ (git como CMS) | < 2 días | Sí |
| `chore/<tema>` | Tooling, dependencias | < 2 días | No |
| `renovate/*` | Automáticas | — | No |

Reglas:
- Nada se fusiona en `main` sin PR y CI en verde. Protección de rama: 1 revisión requerida, checks obligatorios, historial lineal (squash merge).
- No existen ramas `develop` ni `release`. Un hotfix es un `fix/*` normal con prioridad.
- Rebase sobre `main` antes de pedir revisión; los conflictos los resuelve quien abre la PR.

### Convención de commits

Conventional Commits, en español, imperativo, sin punto final. Tipos permitidos: `feat`, `fix`, `content`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`. Ámbito opcional = capa o módulo.

```
feat(cart): añadir QuantityStepper al drawer
fix(whatsapp): escapar saltos de línea en notas del cliente
content(products): alta Golden Eagle con versiones Estándar y Premium
perf(images): limitar widths a 4 por imagen de producto
ci: cachear node_modules en el job de build
```

`BREAKING CHANGE:` en el pie solo para cambios de esquema de contenido o de clave de localStorage (`raiden:cart:v1` → `v2`).

### Plantilla de PR (`.github/pull_request_template.md`)

```markdown
## Qué cambia
<!-- Una o dos frases -->

## Por qué
<!-- Enlace a issue o decisión en docs/21-decisions.md -->

## Checklist
- [ ] `npm run check` y `npm test` pasan en local
- [ ] Sin números de teléfono ni secretos hardcodeados
- [ ] Sin nuevas dependencias (o justificadas y revisadas por Frontend+Performance)
- [ ] Nada específico de Cloudflare (o revisado por DevOps+Tech Lead)
- [ ] Preview revisada en móvil (375 px)
- [ ] Documentación en /docs actualizada si aplica
```

## 2. CI con GitHub Actions

Un único workflow `ci.yml` en cada PR y en `main`. Playwright y Lighthouse solo se ejecutan tras un build correcto; Lighthouse es bloqueante en `main` y advertencia en PR.

| Job | Comando | Duración objetivo | Bloqueante |
|---|---|---|---|
| `check` | `npx astro check` (tipos + `.astro`) | < 1 min | Sí |
| `unit` | `npx vitest run --coverage` | < 1 min | Sí |
| `build` | `npm run build` y subida de `dist` como artefacto | < 2 min | Sí |
| `e2e` | `npx playwright test` sobre `dist` con `astro preview` | < 4 min | Sí |
| `lighthouse` | `npx lhci autorun` con presupuesto | < 3 min | En `main` |

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
env:
  PUBLIC_SITE_URL: https://ci.raiden.invalid
  PUBLIC_WHATSAPP_NUMBER: "51987654321"
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22.12.0, cache: npm }
      - run: npm ci
      - run: npx astro check
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22.12.0, cache: npm }
      - run: npm ci
      - run: npx vitest run
  build:
    needs: [check, unit]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22.12.0, cache: npm }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist, retention-days: 3 }
  e2e:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22.12.0, cache: npm }
      - run: npm ci
      - uses: actions/download-artifact@v4
        with: { name: dist, path: dist }
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report }
  lighthouse:
    needs: build
    runs-on: ubuntu-latest
    continue-on-error: ${{ github.event_name == 'pull_request' }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22.12.0, cache: npm }
      - run: npm ci
      - uses: actions/download-artifact@v4
        with: { name: dist, path: dist }
      - run: npx @lhci/cli autorun --config=lighthouserc.json
```

El despliegue no lo hace Actions: Cloudflare Pages construye desde el push a `main`. Si en el futuro se quiere que solo despliegue lo que CI ha validado, se desactiva el build automático y se usa `cloudflare/wrangler-action` con `pages deploy dist` (o el CLI equivalente de Vercel/Netlify), sin tocar nada más.

## 3. Entornos

| Entorno | Origen | URL | WhatsApp | Analítica | Indexable |
|---|---|---|---|---|---|
| Local | `npm run dev` | `http://localhost:4321` | Número de pruebas en `.env` | `console` | No |
| Preview | Rama `feat/*`, `fix/*`, `content/*` | `https://<rama>.raiden.pages.dev` | Número de pruebas | `console` | No (`noindex`) |
| Producción | `main` | `https://raiden.pe` | Número real | `cloudflare` | Sí |

`.env.example` versionado con todas las `PUBLIC_*` documentadas; `.env` en `.gitignore`.

## 4. Secretos y variables

- En el MVP no hay secretos: solo variables `PUBLIC_*` leídas en build ([10-security](./10-security.md)).
- Las variables se definen en tres sitios y deben coincidir en nombre: `.env.example`, `env.d.ts` (tipado `ImportMetaEnv`) y el dashboard del hosting.
- Cuando llegue Supabase: `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` son públicas por diseño (protegidas por RLS); la `service_role` jamás entra en el repositorio ni en el build; se usa solo en Edge Functions o en GitHub Secrets para scripts de migración.
- Rotación: el número de WhatsApp y las claves se cambian mediante runbook (sección 9), nunca con commit de datos.

## 5. Versionado y changelog

- Versión semántica en `package.json`, gestionada con etiquetas git `vX.Y.Z` en `main`.
- `CHANGELOG.md` generado a partir de los commits convencionales (sección "Sin publicar" alimentada en cada PR; se consolida al etiquetar).
- Se etiqueta al cerrar cada hito del [22-roadmap](./22-roadmap.md). Una etiqueta equivale a un deploy identificable para rollback.
- Cambios de contenido (`content:`) no incrementan versión.

## 6. Dependencias

- Renovate (app de GitHub, gratuita) con `renovate.json`: agrupación semanal los lunes, `automerge` solo para parches de devDependencies con CI en verde, PR individuales para `astro`, `preact` y `@astrojs/*`.
- Dependabot queda activo únicamente para alertas de seguridad.
- Política: cada dependencia nueva de runtime requiere revisión Frontend + Performance y su impacto en el presupuesto de 60 KB gz ([09-performance](./09-performance.md)). Las actualizaciones mayores de Astro se prueban en rama `chore/astro-N` con E2E completos.

## 7. Calidad de código

| Herramienta | Estado | Configuración |
|---|---|---|
| `.editorconfig` | Obligatoria | UTF-8, LF, 2 espacios, final de línea en ficheros |
| Prettier | Obligatoria | `prettier-plugin-astro`; `printWidth: 100`, comillas simples, sin punto y coma final opcional → se fija `semi: true` |
| `astro check` | Obligatoria | TypeScript `strict`, `noUncheckedIndexedAccess` |
| ESLint | Opcional | Solo si aparece deuda real; `eslint-plugin-astro` + `jsx-a11y` para islas |
| Hooks git | Recomendado | `simple-git-hooks` + `lint-staged` con Prettier en pre-commit |

El formato se verifica en CI con `npx prettier --check .` dentro del job `check`.

## 8. Observabilidad mínima

- Disponibilidad: un monitor HTTP externo gratuito (UptimeRobot o similar) contra `https://raiden.pe/` y `/productos` cada 5 min, alerta por correo.
- Rendimiento real: Cloudflare Web Analytics (Core Web Vitals RUM) y Search Console para errores de rastreo.
- Errores de cliente: no se instala Sentry en MVP. `AnalyticsService` expone `trackError` con adaptador `noop`; se conecta a un servicio cuando haya backend.
- Builds: notificaciones de fallo de Cloudflare Pages y de Actions al correo del Tech Lead.

## 9. Runbooks

### Rollback de producción

1. Pages → Deployments → localizar el último deploy correcto (por commit o etiqueta).
2. "Rollback to this deployment": efectivo en menos de 1 min, sin rebuild.
3. Abrir `fix/*` con la corrección; no se hace `git revert` en `main` salvo que el rollback deba persistir más de un día.
4. Registrar la incidencia en `docs/21-decisions.md` si implica cambio de proceso.

### Incidencia (sitio caído o flujo de WhatsApp roto)

1. Confirmar con el monitor externo y con `curl -I https://raiden.pe` desde otra red.
2. Clasificar: DNS/TLS (panel Cloudflare), build (último deploy), aplicación (E2E contra producción con `PLAYWRIGHT_BASE_URL`).
3. Si el último deploy es sospechoso: rollback (runbook anterior).
4. Si es DNS/TLS: revisar registros y modo SSL "Full (strict)"; no tocar reglas fuera del repositorio.
5. Comunicar al cliente tiempo estimado; cerrar con nota en el changelog.

### Cambio de número de WhatsApp

1. Nuevo número en formato E.164 sin `+` (p. ej. `51989853431`), verificado con un enlace `wa.me` manual desde móvil.
2. Actualizar `PUBLIC_WHATSAPP_NUMBER` en el entorno Production del hosting.
3. Lanzar "Retry deployment" del último deploy de `main` (el valor se lee en build).
4. Verificar en producción el `href` del botón del carrito y el test E2E de enlace WhatsApp ([16-whatsapp-commerce](./16-whatsapp-commerce.md)).
5. Mantener el número antiguo operativo 30 días con mensaje de redirección.

## 10. Responsabilidades

| Área | Responsable | Respaldo |
|---|---|---|
| Protección de ramas, CI, Renovate | DevOps | Tech Lead |
| Variables de entorno y dominios | DevOps | Tech Lead |
| Rollback y respuesta a incidencias | DevOps (primer nivel) | Tech Lead |
| Presupuesto Lighthouse y alertas de bundle | Performance | Frontend |
| Revisión de PR de contenido | Content | SEO |
| Cambio de número de WhatsApp | Tech Lead (ejecuta DevOps) | — |
| Aprobación de nueva dependencia | Frontend + Performance | Tech Lead |

Perfil del agente en `/agents/devops.md`.
