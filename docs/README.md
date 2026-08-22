# Documentación — Voltia

Showroom digital de movilidad eléctrica. Plataforma web premium de motos eléctricas (scooters, motos urbanas, bicimotos, trimotos, vehículos de carga, cuatrimotos y accesorios) construida con Astro 7 en modo estático, islas Preact y solicitud de pedido por WhatsApp. Sin pagos online. MVP de coste cero, arquitectura agnóstica del proveedor.

> "Voltia" es un nombre provisional pendiente de decisión del cliente (ver [ADR-012](./21-decisions.md)).

## Flujo de negocio

```
DESCUBRIMIENTO → PRODUCTO → COMPARAR → CONFIGURAR → CARRITO → SOLICITUD DE PEDIDO → WHATSAPP → VENTAS
```

## Índice

| Nº | Documento | Qué responde |
|----|-----------|--------------|
| 00 | [Visión de producto](./00-product-overview.md) | Qué es Voltia, público, catálogo, alcance MVP, KPIs |
| 01 | [Arquitectura](./01-architecture.md) | Capas, estructura de `src/`, islas, repositorios, portabilidad |
| 02 | [Design System](./02-design-system.md) | Tokens CSS (color, tipografía, espaciado, radios, sombras), componentes |
| 03 | [UX](./03-ux.md) | Navegación, wireframes de páginas clave, microinteracciones, carrito → WhatsApp |
| 04 | [Frontend](./04-frontend.md) | Convenciones Astro/Preact, store del carrito, content collections, imágenes |
| 05 | [Backend](./05-backend.md) | Servicios e interfaces, validadores, scoring del finder, pricing, backend futuro |
| 06 | [Base de datos](./06-database.md) | DDL completo de Supabase Postgres y políticas RLS |
| 07 | [API](./07-api.md) | Contrato de datos estáticos actual y API REST futura |
| 08 | [SEO](./08-seo.md) | URLs, metadatos, JSON-LD, sitemap, robots, enlazado |
| 09 | [Rendimiento](./09-performance.md) | Presupuestos (LCP, INP, CLS, JS), estrategia zero-JS, Lighthouse CI |
| 10 | [Seguridad](./10-security.md) | Modelo de amenazas, cabeceras `_headers`, CSP, validación, RGPD |
| 11 | [Testing](./11-testing.md) | Vitest, Playwright, axe-core, Lighthouse CI, CI |
| 12 | [Accesibilidad](./12-accessibility.md) | WCAG 2.2 AA, contraste, teclado, componentes accesibles |
| 13 | [Cloudflare](./13-cloudflare.md) | Pages free, configuración, límites, qué evitar por portabilidad |
| 14 | [DevOps](./14-devops.md) | Flujo git, GitHub Actions, entornos, runbooks |
| 15 | [Estrategia de contenido](./15-content-strategy.md) | Tono, taxonomía, fichas, fotografía, blog, FAQ, legales |
| 16 | [Comercio por WhatsApp](./16-whatsapp-commerce.md) | Enlace wa.me, `WhatsAppMessageBuilder`, proceso de ventas |
| 17 | [Panel de administración](./17-admin-panel.md) | Git como CMS en MVP; panel futuro con Supabase Auth + RLS |
| 18 | [Analítica](./18-analytics.md) | `AnalyticsService`, catálogo de eventos, adaptadores, embudo |
| 19 | [Despliegue](./19-deployment.md) | Pipeline en Cloudflare Pages, verificación, rollback, alternativas |
| 20 | [Migración](./20-migration.md) | Cambio de hosting, SSG → SSR, JSON → Supabase, Business API |
| 21 | [Decisiones (ADR)](./21-decisions.md) | ADR-001 a ADR-012 |
| 22 | [Roadmap](./22-roadmap.md) | Fases del MVP y post-MVP |

## Agentes

Roles del equipo con responsabilidades, límites y criterios de aceptación. El Tech Lead coordina y resuelve escalados.

| Agente | Archivo | Ámbito |
|--------|---------|--------|
| Tech Lead | [agents/tech-lead.md](../agents/tech-lead.md) | Arquitectura, gobernanza, revisión transversal |
| Frontend | [agents/frontend.md](../agents/frontend.md) | Astro, islas Preact, store, componentes |
| Backend | [agents/backend.md](../agents/backend.md) | Servicios, repositorios, datos, Supabase futuro |
| Designer | [agents/designer.md](../agents/designer.md) | Design System, UX, tokens |
| SEO | [agents/seo.md](../agents/seo.md) | Metadatos, JSON-LD, URLs, contenido indexable |
| QA | [agents/qa.md](../agents/qa.md) | Tests unitarios, E2E, accesibilidad automatizada |
| Security | [agents/security.md](../agents/security.md) | Cabeceras, CSP, validación, RGPD |
| Performance | [agents/performance.md](../agents/performance.md) | Presupuestos, bundle, Core Web Vitals |
| DevOps | [agents/devops.md](../agents/devops.md) | CI/CD, Cloudflare Pages, entornos |
| Content | [agents/content.md](../agents/content.md) | Fichas, blog, FAQ, legales |

## Reglas transversales

- **Checklist de decisión**: ¿Mejora UX? ¿Conversión? ¿SEO? ¿Performance? ¿Seguridad? ¿Mantenible? ¿Necesario? ¿Sin dependencia? ¿Agnóstico del proveedor?
- **Revisión cruzada obligatoria**: animación pesada → Performance; SEO con muchas páginas → SEO + Content; nueva dependencia en Backend → Tech Lead; funcionalidad específica de Cloudflare → DevOps + Tech Lead; nueva librería frontend → Frontend + Performance.
- **Secretos**: solo variables `PUBLIC_*` en el frontend. Ningún número de teléfono hardcodeado: `PUBLIC_WHATSAPP_NUMBER` vía `src/config/site.ts`.
- **Presupuesto de rendimiento** en página de producto: LCP < 2,0 s, INP < 200 ms, CLS < 0,1, JS < 60 KB gz.

## Stack (hechos del repositorio)

| Pieza | Valor |
|-------|-------|
| Framework | Astro ^7.2 (`output: 'static'`, `trailingSlash: 'never'`) |
| UI interactiva | Preact ^10.29 (`@astrojs/preact`, `compat: false`) |
| Estado | nanostores ^1.5 + `@nanostores/persistent` (`voltia:cart:v1`) |
| SEO | `@astrojs/sitemap` (excluye `/carrito` y `/comparar`) |
| Tests | Vitest ^4, Playwright ^1.62 |
| Node | >= 22.12 |
| Hosting MVP | Cloudflare Pages (free) |
| Datos MVP | JSON en `src/content/` (git como CMS) |
| Datos futuros | Supabase Postgres + Auth + RLS |

## Cómo mantener esta documentación

1. Toda decisión de arquitectura nueva se registra como ADR en [21-decisions.md](./21-decisions.md) antes de implementarse.
2. Cada documento se actualiza en el mismo PR que cambia el comportamiento que describe.
3. Los archivos de `/agents` son la fuente de verdad de responsabilidades; si cambia un límite, cambia también la matriz de gobernanza en [agents/tech-lead.md](../agents/tech-lead.md).
