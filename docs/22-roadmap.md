# 22 — Roadmap

Plan de ejecución del MVP de Raiden y evolución posterior. Los responsables son los agentes definidos en `/agents`; el Tech Lead coordina y resuelve dependencias cruzadas. Relacionado con [00-product-overview](./00-product-overview.md), [14-devops](./14-devops.md), [20-migration](./20-migration.md) y [21-decisions](./21-decisions.md).

## 1. Fases del MVP

Las fases se ejecutan en el orden de la tabla; las que comparten dependencias pueden solaparse. Una fase se cierra solo cuando se cumple su criterio de salida y el Tech Lead lo valida.

| # | Fase | Objetivo | Entregables | Responsable | Dependencias | Criterio de salida |
|---|---|---|---|---|---|---|
| 1 | Foundation | Base técnica sobre la que construir sin rehacer | Estructura de carpetas (`config`, `domain`, `services`, `data`, `components`, `islands`, `lib`), `site.ts`, tipos de dominio, `ProductRepository` + `JsonProductRepository`, 3 productos de ejemplo, CI con lint/typecheck/vitest | tech-lead, backend | — | `npm run build` y `npm test` en verde en CI; dominio tipado sin `any` |
| 2 | Design System | Tokens y componentes base reutilizables | `tokens.css`, `base.css`, `components.css`; Button, Card, Input, Select, Badge, Tabs, Modal, Drawer, Toast, Table, SpecTile, ColorSwatch, QuantityStepper; página `/dev/ui` solo en dev | designer, frontend | 1 | Todos los componentes documentados en [02-design-system](./02-design-system.md); contraste AA verificado; CSS < 25 KB gz |
| 3 | Navigation | Esqueleto navegable del sitio | `BaseLayout`, Header con menú móvil, Footer, breadcrumbs, 404, rutas vacías de todas las páginas de [01-architecture](./01-architecture.md) | frontend | 2 | Todas las rutas responden 200; menú usable con teclado; axe sin errores críticos |
| 4 | Home | Primera impresión y entrada a los flujos | Hero, categorías, productos destacados, bloque "Encuentra tu moto", propuesta de valor, CTA WhatsApp | designer, frontend, content | 3 | LCP < 2,0 s en móvil simulado; copy aprobado por content |
| 5 | Catalog | Descubrimiento por categoría con filtros | Listados por categoría, `ProductCard`, filtros por precio/autonomía/potencia (query params, sin JS obligatorio), orden | frontend, backend | 3 | Filtros funcionan sin JS; E2E catálogo → filtro → producto |
| 6 | Product | Ficha que resuelve dudas y lleva al carrito | `/motos-electricas/[slug]`, galería `<Picture>`, specs, selector de variante y color, precio calculado, accesorios compatibles, FAQ, JSON-LD Product | frontend, backend, seo | 5 | JS de la ficha < 60 KB gz; Rich Results válido; tests de pricing |
| 7 | Compare | Ayuda a la decisión entre modelos | `CompareBar` (isla), `/comparar` con `CompareTable`, hasta 3 productos, persistencia en nanostores | frontend | 6 | Comparar 3 modelos en móvil sin scroll horizontal roto; evento `compare_add` |
| 8 | Cart | Construir la solicitud de pedido | Reducer de carrito, `CartDrawer`, `/carrito`, cantidades, eliminar, notas, total estimado, persistencia `raiden:cart:v1` | frontend, backend | 6 | Tests del reducer al 100 %; E2E añadir → cantidad → eliminar; estado sobrevive a recarga |
| 9 | WhatsApp | Entregar el pedido a ventas | `WhatsAppMessageBuilder`, enlace `wa.me` con `encodeURIComponent`, botón flotante, CTA en ficha y contacto | backend, frontend | 8 | Mensaje idéntico al formato de [16-whatsapp-commerce](./16-whatsapp-commerce.md); tests unitarios con emojis y tildes; número solo desde env |
| 10 | SEO | Indexación y rich results | Metadatos por página, canonicals, JSON-LD (Organization, Product, BreadcrumbList, FAQPage, Article), sitemap, `robots.txt`, blog y FAQ iniciales | seo, content | 6 | Sitemap sin `/carrito` ni `/comparar`; 0 errores en validador de Schema; 10 artículos y 15 FAQ publicados |
| 11 | Analytics | Medir el embudo | `AnalyticsService`, adaptadores noop/console/cloudflare/dataLayer, cola idle, eventos cableados | backend, frontend | 8, 9 | E2E de secuencia en `dataLayer`; sin PII; ver [18-analytics](./18-analytics.md) |
| 12 | Admin foundation | Preparar la edición de datos sin construir el admin | Validador de JSON de productos en CI, guía de edición del catálogo, esquema SQL de Supabase en `supabase/migrations` (sin desplegar), `SupabaseProductRepository` esqueleto | backend, tech-lead | 1 | PR con JSON inválido falla en CI; esquema revisado por Security (RLS) |
| 13 | QA | Validar los flujos críticos | Suite Playwright completa (móvil y escritorio), axe-core en cada página, informe de bugs priorizado | qa | 4–11 | 0 bugs bloqueantes ni críticos abiertos; E2E en verde tres ejecuciones seguidas |
| 14 | Security audit | Cerrar la superficie expuesta | Revisión de `_headers` (CSP estricta), grep de secretos, validación de entradas de finder/carrito, revisión de `encodeURIComponent`, política de privacidad | security | 9, 11 | Checklist de [10-security](./10-security.md) completa; CSP sin `unsafe-eval`; Mozilla Observatory ≥ A |
| 15 | Performance audit | Cumplir presupuestos | Lighthouse CI configurado con presupuestos, revisión de imágenes, directivas `client:*`, inlining de CSS crítico | performance | 13 | LCP < 2,0 s, INP < 200 ms, CLS < 0,1, JS < 60 KB gz en ficha, en las 3 páginas de referencia |
| 16 | Deployment | Producción | Cloudflare Pages conectado, variables por entorno, dominio y HTTPS, previews protegidas, runbook, checklist post-deploy ejecutada | devops | 14, 15 | Checklist de [19-deployment](./19-deployment.md) §7 completa; rollback probado una vez |

Estimación global del MVP: 7–9 semanas con trabajo en paralelo de agentes; el camino crítico es 1 → 2 → 3 → 6 → 8 → 9 → 13 → 15 → 16.

## 2. Post-MVP

Prioridad: P1 (siguiente trimestre), P2 (cuando haya volumen), P3 (expansión).

| Iniciativa | Prioridad | Prerequisitos | Descripción breve |
|---|---|---|---|
| Supabase como origen de datos | P1 | Fase 12; ruta c de [20-migration](./20-migration.md) | Catálogo en Postgres con doble lectura y test de paridad |
| Admin | P1 | Supabase; SSR con adapter (ruta b) | Supabase Auth + RLS, CRUD de productos/variantes/accesorios, subida de imágenes; ver [17-admin-panel](./17-admin-panel.md) |
| Stock y disponibilidad | P1 | Admin | Campo `stock` por variante, badge "Disponible / Bajo pedido", ficha con `prerender = false` solo si se exige tiempo real |
| CRM ligero | P1 | Supabase | Tablas `customers`, `order_requests`, `whatsapp_requests`; estado del pedido; registro manual desde admin |
| Usuarios | P2 | Supabase Auth | Cuenta opcional para guardar carrito y ver solicitudes; nunca obligatoria para pedir |
| Financiación | P2 | Acuerdo con entidad financiera | Simulador de cuota en ficha (cálculo puro en dominio); enlace al formulario del financiador |
| Reservas con señal | P2 | CRM, asesoría legal | Stripe Checkout para señal reembolsable; revisa y sustituye ADR-008 |
| Seguimiento de pedidos | P2 | CRM, Usuarios | Página `/pedido/[id]` con estado; notificaciones por email |
| WhatsApp Business API | P2 | SSR, CRM; ruta d | Envío automático, plantillas, registro de conversaciones; fallback permanente a `wa.me` |
| Email transaccional | P2 | Backend | `EmailService` con adaptador Resend/Postmark; confirmación de solicitud y cambios de estado |
| Automatizaciones | P2 | CRM, Email | Recordatorio a ventas de solicitudes sin respuesta en 24 h; aviso de stock |
| Analítica avanzada | P2 | Fase 11 | Embudo por producto, atribución de finder/comparador, panel en admin |
| i18n | P3 | Content | `es-PE` por defecto; `en`, `pt` con rutas prefijadas y JSON-LD por idioma |
| Multi-país (i18n de moneda/licencias) | P3 | i18n, CRM | Monedas, impuestos, tipos de licencia y números de WhatsApp por país en `site.ts`, sitemaps por región |

## 3. Hitos

| Hito | Contenido | Semana objetivo | Validación |
|---|---|---|---|
| H1 — Esqueleto | Fases 1–3 | 2 | Sitio navegable en preview de Pages |
| H2 — Catálogo navegable | Fases 4–6 | 4 | Demo al cliente con productos reales |
| H3 — Flujo de pedido | Fases 7–9 | 6 | Pedido de prueba recibido en WhatsApp de ventas |
| H4 — Listo para indexar | Fases 10–12 | 7 | Search Console sin errores en preview |
| H5 — Producción | Fases 13–16 | 9 | Checklist post-deploy completa; dominio público |
| H6 — Datos en Supabase | Post-MVP P1 | +6 | Paridad JSON/Supabase dos semanas |
| H7 — Admin operativo | Post-MVP P1 | +10 | Ventas edita catálogo sin pasar por git |

## 4. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación | Responsable |
|---|---|---|---|---|
| Nombre de marca cambia tarde (ADR-012) | Alta | Medio | Nombre centralizado en `site.ts`; assets de logo en una sola carpeta; dominio definitivo antes de H4 | tech-lead |
| Contenido de producto incompleto (fotos, specs) | Alta | Alto | Plantilla JSON con campos obligatorios validada en CI; content recopila fichas antes de H2 | content |
| Presupuesto de JS superado por islas | Media | Alto | Lighthouse CI bloquea PR; revisión de bundle por performance en cada nueva isla | performance |
| Mensaje de WhatsApp truncado o mal codificado en iOS/Android | Media | Alto | Tests con emojis y tildes; límite de 2.000 caracteres con resumen automático | backend |
| Previews indexadas | Baja | Medio | `noindex` + Cloudflare Access en preview | devops |
| Cloudflare cambia límites del plan free | Baja | Medio | Portabilidad probada (ruta a); `dist/` servible en cualquier host | devops |
| Acoplamiento accidental a Cloudflare o Supabase | Media | Alto | Regla de gobernanza: cambios específicos del proveedor requieren DevOps + Tech Lead | tech-lead |
| Scope creep hacia pagos online en MVP | Media | Alto | ADR-008 vigente; reservas solo en P2 con prerequisitos cumplidos | tech-lead |
| Falta de datos reales para fijar KPIs | Alta | Bajo | Objetivos iniciales de [18-analytics](./18-analytics.md) se revisan a los 30 días de producción | backend |

## 5. Reglas de ejecución

- Cada fase se abre con una issue que enlaza su fila de la tabla y cierra con la evidencia del criterio de salida (captura, log de CI o URL de preview).
- Una fase no puede empezar si alguna dependencia no ha cerrado, salvo autorización explícita del Tech Lead registrada en la issue.
- Cualquier desviación de los ADR de [21-decisions](./21-decisions.md) durante una fase se trata como nueva ADR, nunca como excepción tácita.
- El checklist de decisión de [01-architecture](./01-architecture.md) (UX, conversión, SEO, performance, seguridad, mantenibilidad, necesidad, dependencias, agnosticismo) se aplica a toda propuesta de post-MVP antes de asignarle prioridad.
