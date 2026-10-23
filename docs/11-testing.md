# 11 — Testing

La lógica de negocio de Raiden (carrito, precios, mensaje de WhatsApp, scoring del finder, SEO) son funciones puras en `src/domain/`, `src/services/` y `src/lib/seo/`: se prueban de forma unitaria, rápida y sin DOM. El flujo crítico de negocio (catálogo → WhatsApp) se prueba extremo a extremo con Playwright en viewport móvil. Accesibilidad y rendimiento se verifican en CI con axe-core y Lighthouse CI. Ver [01-architecture](./01-architecture.md), [09-performance](./09-performance.md), [12-accessibility](./12-accessibility.md) y [14-devops](./14-devops.md).

## 1. Pirámide

| Nivel | Herramienta | Cobertura | Velocidad | Cuándo |
|---|---|---|---|---|
| Unitario | Vitest 4 | Dominio, servicios, builders SEO, validadores | < 5 s | Cada commit (pre-push) y CI |
| Componente | Vitest + `@testing-library/preact` (opcional) | Islas con lógica de interacción (QuantityStepper, Finder) | < 10 s | CI |
| E2E | Playwright 1.62 | Flujo crítico, navegación, enlaces wa.me | 1–3 min | CI en PR y pre-release |
| Accesibilidad | axe-core dentro de Playwright | Todas las plantillas | incluido en E2E | CI |
| Rendimiento | Lighthouse CI | 5 URLs representativas | 2–4 min | CI en PR |
| Contenido | Test de esquema de JSON del catálogo | `src/content/**/*.json` | < 2 s | CI |

Proporción objetivo: ~70 % unitario, ~20 % componente/contenido, ~10 % E2E.

## 2. Unidades a cubrir (Vitest)

| Módulo | Casos obligatorios |
|---|---|
| `WhatsAppMessageBuilder` | Mensaje con 1 bicimoto; bicimoto + repuestos; varias cantidades; notas vacías/largas; total formateado `S/ 1,650`; URL `wa.me/<num>?text=` con `encodeURIComponent`; truncado a 1.800 caracteres; sin número hardcodeado (lee `SITE`) |
| Reducer del carrito (`CartService`) | `add` nuevo ítem; `add` del mismo ítem suma cantidad; `setQuantity` 0 elimina; máximo 10; `remove`; `clear`; variante/color distintos son ítems distintos; hidratación con estado inválido → carrito vacío; versión de esquema distinta → reinicio |
| `pricing.ts` | Precio base de variante; suplemento de color; repuestos; total por cantidad; redondeo a céntimos; formato `S/ 1,200` (coma de miles, punto decimal); precio nunca negativo |
| Scoring del finder (`RecommendationService`) | Cada respuesta suma el peso esperado; empate → orden por precio ascendente; sin respuestas → lista por popularidad; nunca recomienda productos sin stock; devuelve 3 resultados máximo |
| Builders SEO | `buildMeta`: canonical absoluta, title truncado a 60, description a 155, `noindex`; JSON-LD `Product` con `offers.priceCurrency = 'PEN'` y `availability` correcta según stock; `BreadcrumbList` con posiciones consecutivas; `FAQPage` vacío → no se emite; `Article` con fechas ISO |
| Validadores (`validation.ts`) | `sanitizeNotes` elimina control chars, recorta a 300, rechaza URLs; `quantity` fuera de rango; ids inexistentes; enums del finder; `PUBLIC_WHATSAPP_NUMBER` con formato inválido lanza error |
| Comparación (`compare.ts`) | Máximo 3 productos; diferencias resaltadas; unidades homogéneas (km, kW, kg) |
| Esquema del catálogo | Todos los JSON tienen `slug` único, `category` válida, al menos una variante con precio > 0, imágenes existentes en `src/assets/` |

## 3. Ejemplos de tests

```ts
// tests/unit/services/WhatsAppMessageBuilder.test.ts
import { describe, it, expect } from 'vitest';
import { buildMessage, buildWhatsAppUrl } from '@/services/WhatsAppMessageBuilder';
import { cartGoldenEaglePremiumWithBattery } from '../../fixtures/carts';

describe('WhatsAppMessageBuilder', () => {
  it('incluye bicimoto, variante, color, repuestos y total', () => {
    const msg = buildMessage(cartGoldenEaglePremiumWithBattery, '');
    expect(msg).toContain('🏍️ Golden Eagle');
    expect(msg).toContain('Variante: Premium');
    expect(msg).toContain('🔋 Batería Chilwee 48V 20Ah');
    expect(msg).toContain('💰 Total estimado: S/ 1,650');
    expect(msg).not.toContain('Notas:');
  });

  it('genera una URL wa.me codificada y limitada', () => {
    const url = buildWhatsAppUrl(cartGoldenEaglePremiumWithBattery, 'a'.repeat(5000));
    expect(url.startsWith('https://wa.me/51989853431?text=')).toBe(true);
    expect(url).not.toContain(' ');
    expect(decodeURIComponent(url.split('text=')[1]).length).toBeLessThanOrEqual(1800);
  });
});
```

```ts
// tests/unit/domain/cart.test.ts
it('sumar el mismo ítem incrementa la cantidad hasta el máximo', () => {
  let cart = emptyCart();
  for (let i = 0; i < 12; i++) cart = cartReducer(cart, { type: 'add', item: goldenEagleBlack });
  expect(cart.items).toHaveLength(1);
  expect(cart.items[0].quantity).toBe(10);
});
```

## 4. E2E con Playwright

Proyecto principal: `Mobile Chrome` (Pixel 7, 412×915). Secundario: `Desktop Chrome` 1280×800 solo para el flujo crítico. El servidor es `astro preview` sobre `dist/` (build real, no dev).

Flujo crítico `tests/e2e/critical-flow.spec.ts`, paso a paso:

1. Abrir `/productos`; comprobar H1 y que existen 4 `ProductCard` de modelos (Golden Eagle, Royal Tiger, Vortex Kobra, Titan Rhino).
2. Aplicar filtro de categoría "Bicimotos" (enlace, no JS); la URL pasa a `/bicimotos`.
3. Pulsar la tarjeta "Golden Eagle"; URL `/bicimotos/golden-eagle`; H1 "Golden Eagle"; precio visible.
4. Seleccionar la versión "Premium" y el color "Negro" (botones con `aria-pressed`).
5. Pulsar "Añadir a la solicitud"; aparece Toast (`role="status"`) y el contador de la cabecera muestra 1.
6. Abrir el drawer; el foco está dentro; `Escape` lo cierra y devuelve el foco al botón.
7. Ir a `/carrito`; incrementar cantidad a 2 con QuantityStepper; total actualizado.
8. Añadir el repuesto "Batería Chilwee 48V 20Ah" desde `/repuestos`; aparece como segunda línea.
9. Eliminar la línea del repuesto; queda una línea.
10. Escribir notas "Entrega en Lima"; el botón "Enviar pedido por WhatsApp" tiene `href` que empieza por `https://wa.me/` y contiene `Golden%20Eagle`, `Cantidad%3A%202` y `Entrega%20en%20Lima`.
11. Recargar la página; el carrito persiste (localStorage `raiden:cart:v1`).
12. Vaciar el carrito; estado vacío con enlace al catálogo.

Otros specs: `navigation.spec.ts` (menú móvil, breadcrumbs, 404), `compare.spec.ts` (añadir 2 productos, tabla, máximo 3), `finder.spec.ts` (4 preguntas → 3 resultados), `seo.spec.ts` (title, canonical, JSON-LD válido por plantilla).

Ejemplo:

```ts
test('el enlace de WhatsApp contiene el pedido', async ({ page }) => {
  await page.goto('/bicimotos/golden-eagle');
  await page.getByRole('button', { name: 'Negro' }).click();
  await page.getByRole('button', { name: 'Añadir a la solicitud' }).click();
  await page.goto('/carrito');
  const href = await page.getByRole('link', { name: /WhatsApp/ }).getAttribute('href');
  expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
  expect(decodeURIComponent(href!)).toContain('Golden Eagle');
});
```

## 5. axe-core en E2E

`@axe-core/playwright` en `tests/e2e/a11y.spec.ts`: recorre `/`, categoría, producto, `/carrito` (con ítems), `/comparar`, `/encuentra-tu-moto`, `/blog/[primer-slug]`, `/faq`, con el drawer abierto y cerrado. Estándar `wcag2a`, `wcag2aa`, `wcag22aa`. Cualquier violación `serious`/`critical` falla el test; `moderate` se reporta. Criterios en [12-accessibility](./12-accessibility.md).

## 6. Lighthouse CI

Configuración y presupuestos en [09-performance](./09-performance.md). Se ejecuta en CI tras el build, sobre `dist/`, con 3 pasadas. Aserciones `error` bloquean el PR.

## 7. Estructura de carpetas

```
tests/
  unit/
    domain/        cart.test.ts, pricing.test.ts, compare.test.ts, validation.test.ts
    services/      WhatsAppMessageBuilder.test.ts, RecommendationService.test.ts
    seo/           meta.test.ts, jsonld.test.ts
    content/       catalog-schema.test.ts
  e2e/
    critical-flow.spec.ts, navigation.spec.ts, compare.spec.ts, finder.spec.ts,
    seo.spec.ts, a11y.spec.ts
  fixtures/
    products.json, parts.json, carts.ts, finder-answers.json
  setup/
    vitest.setup.ts
vitest.config.ts
playwright.config.ts
lighthouserc.cjs
```

Alias `@/` → `src/` compartido entre Astro, Vitest y Playwright.

## 8. Scripts npm propuestos (no ejecutados)

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:a11y": "playwright test tests/e2e/a11y.spec.ts",
  "lhci": "lhci autorun",
  "check": "astro check && tsc --noEmit",
  "ci": "npm run check && npm run test && npm run build && npm run test:e2e && npm run lhci"
}
```

Dependencias de desarrollo a añadir cuando se implemente: `@axe-core/playwright`, `@lhci/cli`, `@vitest/coverage-v8`, opcionalmente `@testing-library/preact`.

## 9. Datos de prueba

- `tests/fixtures/products.json`: 4 productos (los modelos RAIDEN o equivalentes de prueba), con variantes `estandar`/`premium`, colores, disponibilidad variada (`en-stock`, `bajo-pedido`, `agotado`) e imágenes apuntando a un placeholder de `src/assets/test/`.
- `tests/fixtures/carts.ts`: `emptyCart`, `cartGoldenEaglePremium`, `cartGoldenEaglePremiumWithBattery`, `cartMaxQuantity`, `cartInvalidPersisted` (ids inexistentes, cantidad -1, versión antigua).
- `tests/fixtures/finder-answers.json`: combinaciones de respuestas con el resultado esperado.
- Los tests unitarios inyectan un `ProductRepository` en memoria construido a partir de las fixtures; nunca leen `src/content/` directamente salvo el test de esquema.
- `PUBLIC_WHATSAPP_NUMBER=51989853431` y `PUBLIC_SITE_URL=https://raiden.test` en `vitest.setup.ts` y en el job de CI.

## 10. CI en GitHub Actions

Workflow `ci.yml` en cada PR y push a `main` (detalle en [14-devops](./14-devops.md)):

1. `actions/checkout` y `actions/setup-node` (Node 22, caché npm), fijadas por SHA.
2. `npm ci` con `ignore-scripts`.
3. `npm run check` (tipos + `astro check`).
4. `npm run test` con cobertura; subida del informe como artefacto.
5. `npm run build` con las variables `PUBLIC_*` de prueba.
6. `npx playwright install --with-deps chromium` y `npm run test:e2e` contra `astro preview`; trazas y vídeo solo en fallo.
7. `npm run lhci`.
8. `npm audit --audit-level=high`.

Tiempo objetivo del pipeline completo: < 8 minutos. El despliegue a Cloudflare Pages solo se lanza si el workflow es verde.

## 11. Criterios de cobertura

- `src/domain/`, `src/services/`, `src/lib/seo/`: 90 % líneas y ramas (umbral en `vitest.config.ts`, bloqueante).
- `src/islands/`: 70 % (lógica; el render se cubre por E2E).
- `src/components/*.astro`, `src/pages/`: sin umbral unitario; cubiertos por E2E, axe y LHCI.
- Ninguna función exportada de `domain/` o `services/` sin al menos un test.

## 12. Definición de hecho

Una tarea está terminada cuando:

- [ ] Tipos y `astro check` sin errores.
- [ ] Tests unitarios nuevos para toda lógica añadida; umbrales de cobertura respetados.
- [ ] Flujo E2E afectado actualizado y en verde en móvil.
- [ ] axe sin violaciones `serious`/`critical` en las plantillas tocadas.
- [ ] Lighthouse CI dentro de presupuesto.
- [ ] Sin nuevas dependencias sin aprobación ([10-security](./10-security.md)).
- [ ] Documentación de `/docs` actualizada si cambia una decisión.
- [ ] PR revisada por al menos un agente/persona distinta del autor.
