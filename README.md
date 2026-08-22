# Voltia — Digital Electric Mobility Showroom

Showroom digital de motos eléctricas (scooters, motos, bicimotos, trimotos, cuatrimotos y vehículos de carga). El visitante compara, configura y **solicita su compra por WhatsApp**: no hay pagos online, cuentas de usuario ni backend propio en el MVP.

- Sitio **100 % estático** (`astro build` → `dist/`), desplegable en cualquier CDN.
- **Coste de infraestructura: 0 €/mes** (Cloudflare Pages Free + GitHub Actions Free; solo el dominio se paga).
- Sin cookies, sin trackers, sin datos personales almacenados.

Documentación completa en [`/docs`](./docs/README.md) y perfiles de cada rol en [`/agents`](./agents).

## Stack

| Capa | Tecnología |
|---|---|
| Framework | [Astro 7](https://astro.build) (`output: 'static'`, `trailingSlash: 'never'`) |
| Islas interactivas | Preact (`@astrojs/preact`, sin `compat`) |
| Estado cliente | nanostores + `@nanostores/persistent` (carrito y comparador en `localStorage`) |
| Contenido | Content collections JSON en `src/content/` (git como CMS) |
| Imágenes | `<Image>` de Astro con sharp en build → AVIF/WebP |
| SEO | `@astrojs/sitemap`, JSON-LD, Open Graph |
| Tests | Vitest (unitarios) · Playwright + axe-core (E2E/a11y) · Lighthouse CI |
| Hosting | Cloudflare Pages (Free) — intercambiable por Vercel, Netlify, S3 o Nginx |

Cero dependencias de runtime más allá de Astro, Preact y nanostores ([docs/09-performance](./docs/09-performance.md)).

## Infraestructura de coste cero

| Servicio | Plan | Uso |
|---|---|---|
| GitHub | Free | Repositorio, PRs, Actions (CI) |
| Cloudflare Pages | Free | Hosting estático, previews por rama, TLS, dominio |
| Cloudflare Web Analytics | Free | RUM sin cookies (opcional) |
| Supabase | Free (fase posterior) | Catálogo/solicitudes cuando haya backend |

Ver [docs/13-cloudflare](./docs/13-cloudflare.md) para límites del plan y qué **no** se usa para mantener la portabilidad.

## Requisitos

- Node **≥ 22.12** (`engines` en `package.json`; `NODE_VERSION=22.12.0` en Pages y CI)
- npm (con `package-lock.json` versionado; usar `npm ci`)

## Comandos

| Comando | Acción |
|---|---|
| `npm install` | Instala dependencias |
| `npm run dev` | Servidor de desarrollo en `http://localhost:4321` |
| `npm run build` | Build de producción en `./dist/` |
| `npm run preview` | Sirve `dist/` localmente (no aplica `public/_headers`) |
| `npm run check` | `astro check`: tipos + validación de `.astro` |
| `npm test` | Tests unitarios (Vitest) |
| `npm run test:e2e` | Tests E2E + accesibilidad (Playwright + axe) |
| `npm audit --audit-level=high` | Auditoría de dependencias (bloqueante en CI) |
| `npx @lhci/cli autorun` | Lighthouse CI sobre `dist/` con los presupuestos de `.lighthouserc.json` |

## Variables de entorno

Solo existen variables con prefijo `PUBLIC_` (se leen en build y llegan al bundle). **Ninguna es secreta**; nunca pongas claves privadas en una `PUBLIC_*`. Plantilla en [`.env.example`](./.env.example).

| Variable | Ejemplo | Uso |
|---|---|---|
| `PUBLIC_SITE_URL` | `https://voltia.es` | URL canónica: canonicals, sitemap, JSON-LD, OG |
| `PUBLIC_WHATSAPP_NUMBER` | `34612345678` | Número de ventas, formato internacional sin `+` |
| `PUBLIC_CONTACT_EMAIL` | `hola@voltia.es` | Email del pie y del JSON-LD |
| `PUBLIC_ANALYTICS` | `console` \| `datalayer` \| vacío | Adaptador de analítica (vacío = noop) |
| `PUBLIC_CF_BEACON_TOKEN` | vacío | Token del beacon de Cloudflare Web Analytics (solo producción) |

Copia `.env.example` a `.env` para desarrollo local (`.env` está ignorado por git).

### Cómo se configura el número de WhatsApp

El número vive **solo** en [`src/config/site.ts`](./src/config/site.ts), que lee `PUBLIC_WHATSAPP_NUMBER` con un valor por defecto de pruebas (`34600000000`). Ningún componente lo hardcodea; [`src/services/whatsapp/WhatsAppMessageBuilder.ts`](./src/services/whatsapp/WhatsAppMessageBuilder.ts) construye `https://wa.me/<número>?text=<mensaje codificado con encodeURIComponent>`. Para cambiarlo en producción: actualizar la variable en el hosting y relanzar el build (se lee en tiempo de build). Runbook en [docs/14-devops §9](./docs/14-devops.md).

## Estructura

```text
.
├── .github/workflows/
│   ├── ci.yml                       # check + audit, vitest, build, playwright, lighthouse
│   └── deploy-cloudflare-pages.yml  # despliegue manual opcional (wrangler)
├── .lighthouserc.json               # presupuestos Lighthouse CI
├── astro.config.mjs                 # site, static output, preact, sitemap, imágenes
├── vercel.json                      # cabeceras equivalentes a public/_headers (migración)
├── public/
│   ├── _headers                     # CSP, HSTS, caché (Cloudflare Pages / Netlify)
│   ├── robots.txt
│   └── og-default.png               # imagen Open Graph por defecto (1200×630)
├── src/
│   ├── assets/                      # imágenes de producto/categoría (procesadas por sharp)
│   ├── components/                  # .astro: layout, catalog, product, seo, ui
│   ├── islands/                     # Preact: carrito, comparador, configurador, finder, toasts
│   ├── layouts/BaseLayout.astro
│   ├── pages/                       # rutas: /, /[categoria], /motos-electricas/[slug], /carrito, /comparar…
│   ├── content/                     # products/, accessories/, categories/, faqs/, blog/ (JSON)
│   ├── content.config.ts            # esquemas zod de las colecciones
│   ├── config/site.ts               # única fuente de verdad de marca, contacto y límites
│   ├── domain/                      # tipos y lógica pura (carrito, precios, recomendación)
│   ├── data/                        # repositorios de acceso al contenido (JSON hoy, Supabase mañana)
│   ├── services/                    # whatsapp/, analytics/, infra/
│   ├── stores/                      # nanostores: cart, compare, toast
│   ├── lib/                         # seo/, images, analytics-init
│   └── styles/                      # tokens.css, base.css, components.css
├── docs/                            # 00–22: producto, arquitectura, seguridad, despliegue…
└── agents/                          # perfiles de rol (tech-lead, frontend, security, devops…)
```

## Cómo añadir un producto

1. Crea `src/content/products/<slug>.json` (el nombre del fichero es el `slug` de la URL `/motos-electricas/<slug>` o la categoría correspondiente).
2. Rellena los campos del esquema de [`src/content.config.ts`](./src/content.config.ts): `id` (UUID), `slug`, `name`, `subtitle`, `claim`, `description`, `category` (uno de los slugs de categoría), `brand`, `images[]` (`src` apuntando a `~/assets/products/...`, `alt`, `width`, `height`), `specs` (autonomía, velocidad, potencia, batería, carnet…), `variants[]`, colores, precio (`{ amount: céntimos, currency: "EUR" }`), `availability` y `useCases`.
3. Añade las imágenes en `src/assets/products/` (máximo 4 anchos por imagen, ver [docs/09-performance](./docs/09-performance.md)).
4. `npm run build`: el esquema valida en build; un JSON inválido rompe la compilación con el campo exacto.
5. Abre una PR desde una rama `content/<tema>`; la preview de Cloudflare Pages se publica en la PR.

Usa [`src/content/products/odin-1-0.json`](./src/content/products/odin-1-0.json) como plantilla. Más detalle en [docs/15-content-strategy](./docs/15-content-strategy.md).

## Despliegue en Cloudflare Pages

Integración Git (zero-config), sin adapter ni `wrangler.toml`:

| Ajuste | Valor |
|---|---|
| Production branch | `main` |
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| `NODE_VERSION` | `22.12.0` |
| Variables | `PUBLIC_SITE_URL`, `PUBLIC_WHATSAPP_NUMBER` (+ opcionales) en Production y Preview |

Cada push a `main` despliega producción; cualquier otra rama genera una preview `https://<rama>.voltia.pages.dev`. `public/_headers` se copia a `dist/` y Cloudflare aplica las cabeceras. Rollback: Pages → Deployments → "Rollback to this deployment".

Alternativa (despliegue solo tras CI verde): workflow manual [`deploy-cloudflare-pages.yml`](./.github/workflows/deploy-cloudflare-pages.yml) con `cloudflare/wrangler-action` y los secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`.

Procedimiento completo y checklist post-deploy en [docs/19-deployment](./docs/19-deployment.md).

### Migración a otro proveedor

El artefacto es `dist/`; cambiar de hosting es configuración, no código ([docs/20-migration](./docs/20-migration.md)):

- **Vercel**: detecta Astro; las cabeceras están ya en [`vercel.json`](./vercel.json) (mantener sincronizado con `public/_headers`).
- **Netlify**: usa el mismo `public/_headers` sin cambios.
- **S3/CloudFront, Nginx**: subir `dist/` y replicar las cabeceras en la capa de servidor.
- **SSR futuro** (`/admin`): añadir únicamente un adapter (`@astrojs/node`, `@astrojs/vercel` o `@astrojs/cloudflare`) en `astro.config.mjs`.

## Seguridad

Modelo de amenazas, cabeceras y política de reporte en [`SECURITY.md`](./SECURITY.md) y [docs/10-security](./docs/10-security.md).

## Documentación

- [`docs/README.md`](./docs/README.md) — índice de los 23 documentos (producto, arquitectura, diseño, SEO, rendimiento, seguridad, testing, Cloudflare, DevOps, WhatsApp commerce, migración, decisiones, roadmap).
- [`agents/`](./agents) — responsabilidades, límites y criterios de aceptación por rol.
- [`AGENTS.md`](./AGENTS.md) — notas para agentes de desarrollo.
