# 23 — Guía de edición del catálogo (git como CMS)

Cómo añadir o modificar productos, accesorios, precios y contenido **sin panel de administración**. Esta es la operativa oficial del MVP; el panel llegará después (ver [17-admin-panel](./17-admin-panel.md)). Toda edición pasa por git: queda versionada, revisada y validada en CI.

## 1. Dónde vive cada cosa

| Contenido | Carpeta | Formato |
|---|---|---|
| Productos (motos, scooters…) | `src/content/products/` | 1 JSON por modelo, nombre de fichero = slug |
| Accesorios | `src/content/accessories/` | 1 JSON por accesorio |
| Categorías | `src/content/categories/` | 1 JSON por categoría (no añadir nuevas sin tocar dominio) |
| Artículos del blog | `src/content/blog/` | Markdown con frontmatter |
| FAQ generales | `src/content/faqs/` | 1 JSON por grupo |
| Imágenes | `src/assets/products|accessories|categories/` | SVG/JPG/AVIF/WebP |
| Marca, WhatsApp, textos globales | `src/config/site.ts` | TypeScript |

## 2. Cambiar un precio

1. Abrir `src/content/products/<slug>.json`.
2. Buscar `variants[].price.amount`: es el precio en **céntimos de sol** (S/ 11,990 → `1199000`). `currency` siempre `"PEN"`.
3. Guardar, commit y push. Nada más: el precio "Desde", el configurador, el comparador y el mensaje de WhatsApp se recalculan solos.

## 3. Añadir un producto nuevo

1. Copiar el JSON de un modelo parecido y renombrarlo al nuevo slug (`kebab-case`, p. ej. `storm-x2.json`; el campo `slug` debe coincidir).
2. Rellenar: `id` único, nombre, subtítulo, claim, descripción, `category` (una existente), specs completas, 2+ variantes (exactamente **una** con `isDefault: true`), colores, `accessories` y `related` (slugs existentes), `useCases`, highlights, `technology` (6 bloques), 4 FAQs, `featured` (orden en "Recomendados"), `publishedAt`.
3. Añadir 3 imágenes en `src/assets/products/` como `<slug>-1/-2/-3` y referenciarlas como `~/assets/products/<slug>-1.jpg` con `width`/`height` reales.
4. Ejecutar:

```bash
npm run validate:content && npm run build
```

5. Commit y push. La CI repite la validación; un JSON inválido **bloquea el merge**.

Notas:
- `isHero: true` solo puede tenerlo **un** producto (el del hero de la portada).
- `specs.battery.capacityKwh` debe ser V·Ah/1000 (el validador lo comprueba).
- Licencias: `sin-licencia`, `B-I`, `B-IIa`, `B-IIb`, `B-IIc` (MTC). Ante la duda, confirmar con el asesor legal antes de publicar.

## 4. Fotos reales (sustituir placeholders)

Exportar JPG ≥ 1600 px de ancho (fondo limpio, moto lateral) a `src/assets/products/`, actualizar `images[].src` y dimensiones. Astro genera AVIF/WebP y srcset en el build; no hay que optimizar a mano.

## 5. Retirar un producto

- Temporalmente sin stock → `variants[].availability: "agotado"` (la web lo muestra, deshabilita compra).
- Retirada definitiva → borrar el JSON **y** limpiar su slug de `related`, `accessories.compatibleWith` y `relatedProducts` del blog (el validador lista los rotos).

## 6. Qué valida la CI

`npm run validate:content` (rápido, sin build): JSON parseable, slugs = nombre de fichero, referencias cruzadas existentes, imágenes presentes, moneda PEN y precios enteros, una sola variante default, un solo hero, coherencia de batería, licencia vs. velocidad, y ausencia de referencias a España/EUR en el blog. Después `astro build` valida los esquemas zod completos ([content.config.ts](../src/content.config.ts)).

## 7. Futuro: Supabase

El esquema SQL equivalente ya existe en `supabase/migrations/00000000000001_initial_schema.sql` (validado con el parser de PostgreSQL). Cuando el catálogo crezca, la migración descrita en [20-migration](./20-migration.md) sustituye esta carpeta por tablas sin tocar la UI (misma interfaz `Repositories`).
