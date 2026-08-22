import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Result } from 'axe-core';
import { hydrated } from './helpers';

const PAGES = ['/', '/motos-electricas', '/motos-electricas/odin-1-0', '/comparar', '/carrito', '/encuentra-tu-moto'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag22aa'];
const BLOCKING = new Set(['serious', 'critical']);

/**
 * BUGS CONOCIDOS (color-contrast, impacto serious). Se excluyen del gate para que
 * la suite detecte regresiones nuevas; el test `fixme` de abajo los mantiene visibles.
 *  - src/styles/components.css:104 `.badge--stock{color:var(--success)}` → #1f8f5f sobre fondo claro ≈ 3,9:1 (< 4,5:1).
 *  - src/styles/components.css:109 `.badge--order{color:var(--warning)}` → #b7791f sobre fondo claro ≈ 3,0:1.
 *  - src/styles/components.css:200 `.choice:has(input:checked){color:var(--bg)}` no cubre `.muted` interno (precio
 *    de la variante en ProductConfigurator) → gris --fg-muted sobre fondo oscuro.
 *  - src/islands/BikeFinder.tsx (estilo .bf__progress) `color:var(--fg-subtle)` (#9b9b96) sobre fondo claro ≈ 2,6:1.
 */
const KNOWN_CONTRAST: RegExp[] = [];

function split(violations: Result[]) {
  const known: string[] = [];
  const blocking: { id: string; impact?: string; help: string; nodes: string[] }[] = [];
  const others: string[] = [];
  for (const v of violations) {
    const nodes = v.nodes.map((n) => n.target.join(' '));
    const unknownNodes = v.id === 'color-contrast' ? nodes.filter((t) => !KNOWN_CONTRAST.some((re) => re.test(t))) : nodes;
    known.push(...nodes.filter((t) => !unknownNodes.includes(t)).map((t) => `${v.id}: ${t}`));
    if (!unknownNodes.length) continue;
    if (BLOCKING.has(v.impact ?? '')) blocking.push({ id: v.id, impact: v.impact ?? undefined, help: v.help, nodes: unknownNodes.slice(0, 6) });
    else others.push(`${v.id} (${v.impact}): ${v.help} → ${unknownNodes.slice(0, 3).join(' | ')}`);
  }
  return { known, blocking, others };
}

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const { known, blocking, others } = split(results.violations);
  if (others.length) console.log(`[axe ${label}] no bloqueantes:\n  - ${others.join('\n  - ')}`);
  if (known.length) console.log(`[axe ${label}] bugs conocidos (excluidos):\n  - ${known.join('\n  - ')}`);
  expect(blocking, 'violaciones serious/critical').toEqual([]);
  return results.violations;
}

for (const path of PAGES) {
  test(`axe sin violaciones serious/critical en ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await audit(page, path);
  });
}

test('axe en el drawer del carrito abierto con un ítem y en /carrito con ítems', async ({ page }) => {
  await page.goto('/motos-electricas/odin-1-0');
  await hydrated(page.locator('[data-configurator]'));
  await page.locator('[data-add-to-cart]').click();
  await expect(page.locator('[data-cart-drawer]')).toBeVisible();
  await audit(page, 'drawer');
  await page.keyboard.press('Escape');
  await page.goto('/carrito');
  await expect(page.locator('[data-cart-item]').first()).toBeVisible();
  await audit(page, '/carrito (con ítems)');
});

test('contraste de color: badge en stock, precio de variante seleccionada y progreso del finder', async ({ page }) => {
  // Ver comentario en KNOWN_CONTRAST. Cuando se corrijan los estilos, vaciar la lista y quitar el fixme.
  await page.goto('/motos-electricas/odin-1-0');
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations.filter((v) => v.id === 'color-contrast')).toEqual([]);
});
