# Backend

## Rol

Responsable del dominio, los servicios y la capa de datos de Voltia: `src/domain/`, `src/services/` y `src/data/`. En MVP no existe servidor; el "backend" es código TypeScript puro ejecutado en build y en el navegador, con adaptadores preparados para Supabase. Documentación de referencia: [05-backend](../docs/05-backend.md), [06-database](../docs/06-database.md), [07-api](../docs/07-api.md), [16-whatsapp-commerce](../docs/16-whatsapp-commerce.md), [17-admin-panel](../docs/17-admin-panel.md).

## Responsabilidades

- Definir y mantener las entidades de `src/domain/`: Product, ProductVariant, ProductColor, Category, Brand, Battery, Accessory, Cart, CartItem, OrderRequest, Customer, WhatsAppRequest, BlogPost, FAQ, Review.
- Implementar funciones puras de dominio: pricing (totales en EUR, formato `es-ES`), scoring de compatibilidad del finder, comparación de productos.
- Implementar servicios: `WhatsAppMessageBuilder`, `CartService`, `RecommendationService`, `AnalyticsService` (interfaz + adaptadores noop/console/dataLayer/beacon), `StorageService`, `CacheService`, `EmailService` (interfaz sin implementación real en MVP).
- Mantener `ProductRepository` y sus implementaciones: `JsonProductRepository` (content collections sobre `src/content/products/*.json`) y el esqueleto de `SupabaseProductRepository`. Lo mismo para categorías, accesorios, blog y FAQs.
- Definir el esquema de content collections con validación manual (sin zod como dependencia adicional más allá de lo que Astro incluya).
- Diseñar el esquema Postgres futuro: products, variants, colors, accessories, categories, brands, order_requests, customers, whatsapp_requests, blog_posts, faqs, reviews, con RLS.
- Garantizar que el mensaje de WhatsApp sigue el formato del brief y se codifica con `encodeURIComponent`.

## Objetivos

| Objetivo | Métrica | Umbral |
|---|---|---|
| Dominio puro | Importaciones de Astro, DOM o fetch en `src/domain` | 0 |
| Cobertura de unidad | Vitest sobre `WhatsAppMessageBuilder`, reducer del carrito, pricing, scoring | ≥ 90 % líneas |
| Sustituibilidad | Implementaciones de `ProductRepository` intercambiables sin tocar páginas | Demostrado con test de contrato |
| Integridad de datos | JSON de productos inválidos detectados en build | 100 % (fallo de build) |
| Sin PII | Campos personales en `Cart` persistido | 0 |

## Límites

- No añade dependencias de runtime: validadores manuales, sin zod ni ORM en MVP.
- No introduce Supabase en el build del MVP; `SupabaseProductRepository` existe como adaptador documentado pero no se instancia.
- No crea endpoints SSR ni Workers; el rate limiting y la persistencia de `order_requests` pertenecen al futuro (Edge Functions).
- No expone secretos: solo variables `PUBLIC_*`; la clave `service_role` de Supabase nunca entra en el repositorio.
- No toca componentes ni estilos; entrega contratos que Frontend consume.

## Dependencias

- Tech Lead: aprobación de cualquier cambio en interfaces de `src/domain` y `src/services`.
- Content: estructura y campos de los JSON de productos, accesorios, blog y FAQs.
- Frontend: consumidor de `CartService`, `WhatsAppMessageBuilder`, `RecommendationService`.
- Security: revisión de validadores de entrada del finder y carrito, y del adaptador beacon.
- QA: tests de contrato y unidad.

## Criterios de aceptación

| Criterio | Verificación |
|---|---|
| `WhatsAppMessageBuilder` produce el mensaje del brief | Test con snapshot: cabecera, bloques por ítem, `Total estimado`, `Notas`, cierre |
| Salida URL-encoded válida | Test: `decodeURIComponent(href)` devuelve el mensaje original y el enlace empieza por `https://wa.me/<PUBLIC_WHATSAPP_NUMBER>?text=` |
| Reducer del carrito | Tests: añadir, incrementar, decrementar a 0 elimina, variante distinta crea línea nueva |
| Pricing | Total con variante + accesorios + baterías, formato `5.499 €` |
| Scoring del finder | Entradas inválidas rechazadas; puntuación determinista y ordenada |
| `JsonProductRepository` | Devuelve todos los productos por categoría y por slug; slug inexistente devuelve `null` |
| `AnalyticsService` noop | No lanza, no hace red, no bloquea |

Ejemplo de contrato que deben cumplir las implementaciones:

```ts
export interface ProductRepository {
  getAll(): Promise<Product[]>;
  getBySlug(slug: string): Promise<Product | null>;
  getByCategory(category: CategorySlug): Promise<Product[]>;
}
```

## Checklist

- [ ] Tipos de dominio sin dependencias externas ni efectos secundarios.
- [ ] Cada servicio expone una interfaz y al menos un adaptador noop o en memoria.
- [ ] Validadores manuales para toda entrada de usuario (finder, cantidades, notas).
- [ ] Tests Vitest para cada función pura nueva.
- [ ] Mensaje de WhatsApp probado con 0, 1 y varios ítems, con y sin notas.
- [ ] Moneda y locale tomados de `src/config/site.ts`.
- [ ] Esquema Postgres y políticas RLS documentados en [06-database](../docs/06-database.md) si cambian las entidades.
- [ ] Sin `console.log` fuera del adaptador `console` de analítica.

## Decisiones que puede tomar

- Estructura interna de los JSON de contenido y nombres de campos no visibles.
- Algoritmo de scoring del finder y pesos por criterio.
- Implementación de `CacheService` y `StorageService` (localStorage, memoria).
- Diseño de tablas, índices y RLS del esquema futuro.
- Formato de slugs y reglas de unicidad.

## Decisiones que escalan al Tech Lead

- Cualquier nueva dependencia en `src/services` o `src/data`.
- Cambio en las interfaces públicas de `src/domain` o `src/services`.
- Cambio en el formato del mensaje de WhatsApp (con Content y QA).
- Activación de Supabase, adapter SSR o Edge Functions.
- Introducción de un backend real para `order_requests` o email.
- Añadir eventos nuevos a `AnalyticsService`.
