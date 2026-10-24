import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Result } from 'axe-core';
import { GE, MOTOR, TITAN, addGoldenEagle, hydrated } from './helpers';

const PAGES = ['/', '/productos', '/bicimotos', '/trimotos', GE, TITAN, '/repuestos', MOTOR, '/contacto', '/nosotros', '/servicio-tecnico', '/encuentra-tu-moto', '/comparar', '/carrito'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag22aa'];
const BLOCKING = new Set(['serious', 'critical']);

/**
 * BUGS CONOCIDOS (impacto serious) excluidos del gate para que la suite detecte regresiones nuevas.
 * Los tests `fixme` del final los mantienen visibles; al corregirlos, vaciar la lista y quitar el fixme.
 *  - target-size: src/components/home/HeroSlider.astro:262 `.hs__dot{width:.625rem;height:.625rem}` → los puntos
 *    del carrusel miden 10×10 px (WCAG 2.2 2.5.8 exige 24×24 o separación de 24 px; el gap es de 12 px).
 *    Fix: área de toque de 24 px (p. ej. `.hs__dot{position:relative} .hs__dot::before{content:'';position:absolute;inset:-7px}`
 *    o `min-width:1.5rem;min-height:1.5rem` con el punto pintado en `::after`).
 *  - color-contrast: src/pages/repuestos/index.astro:42 los enlaces del índice de tipos usan `.badge`
 *    (src/styles/components.css:122 `color:var(--fg-muted)` #6b6f76 sobre `--bg-sunken` #efefec = 4,38:1 < 4,5:1 a 12 px).
 *    Fix: `.rp__jump a{color:var(--fg)}` o subir `--fg-muted` a n-600.
 */
const KNOWN: { id: string; target: RegExp }[] = [];

function split(violations: Result[]) {
  const known: string[] = [];
  const blocking: { id: string; impact?: string; help: string; nodes: string[] }[] = [];
  const others: string[] = [];
  for (const v of violations) {
    const nodes = v.nodes.map((n) => n.target.join(' '));
    const unknownNodes = nodes.filter((t) => !KNOWN.some((k) => k.id === v.id && k.target.test(t)));
    known.push(...nodes.filter((t) => !unknownNodes.includes(t)).map((t) => `${v.id}: ${t}`));
    if (!unknownNodes.length) continue;
    if (BLOCKING.has(v.impact ?? '')) blocking.push({ id: v.id, impact: v.impact ?? undefined, help: v.help, nodes: unknownNodes.slice(0, 6) });
    else others.push(`${v.id} (${v.impact}): ${v.help} → ${unknownNodes.slice(0, 3).join(' | ')}`);
  }
  return { known, blocking, others };
}

/**
 * Espera a que terminen las animaciones CSS en curso (toast `fade`, drawer): axe mide colores con la opacidad animada.
 * Las animaciones infinitas (halo del WhatsApp flotante) son decorativas y nunca terminan: se ignoran.
 */
async function settleAnimations(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

async function audit(page: Page, label: string) {
  await settleAnimations(page);
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

test('axe en el drawer del carrito abierto y en /carrito con ítems', async ({ page }) => {
  await addGoldenEagle(page);
  await audit(page, 'drawer');
  await page.keyboard.press('Escape');
  await page.goto('/carrito');
  await expect(page.locator('[data-cart-item]').first()).toBeVisible();
  await audit(page, '/carrito (con ítems)');
});

test('axe con el desplegable Productos abierto y el buscador abierto', async ({ page, isMobile }) => {
  await page.goto('/');
  if (!isMobile) {
    // Apertura por teclado (el clic con puntero fino tiene el bug descrito en header.spec.ts)
    await page.locator('[data-dropdown-btn]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-dropdown-panel]')).toBeVisible();
    await audit(page, 'dropdown');
    await page.keyboard.press('Escape');
  } else {
    await page.locator('[data-menu-toggle]').click();
    await expect(page.locator('#mobile-nav')).toBeVisible();
    await audit(page, 'menú móvil');
    await page.keyboard.press('Escape');
  }
  await page.locator('[data-search-open]').first().click();
  await expect(page.locator('dialog[data-search]')).toHaveAttribute('open', '');
  await audit(page, 'buscador');
});

test('axe en el finder con resultados y en el comparador con 2 modelos', async ({ page }) => {
  await page.goto('/encuentra-tu-moto');
  const finder = page.locator('[data-finder]');
  await hydrated(finder);
  await finder.getByRole('checkbox', { name: 'Ciudad' }).check();
  await finder.getByRole('button', { name: 'Continuar' }).click();
  await finder.getByRole('button', { name: 'Continuar' }).click();
  await finder.locator('[data-finder-finish]').click();
  await expect(finder.locator('[data-finder-result]').first()).toBeVisible();
  await audit(page, 'finder resultados');

  await page.goto('/productos');
  for (const slug of ['golden-eagle', 'royal-tiger']) {
    const t = page.locator(`[data-compare-toggle="${slug}"]`);
    await hydrated(t);
    await t.click();
    await expect(t).toHaveAttribute('aria-pressed', 'true');
  }
  await page.goto('/comparar');
  await expect(page.locator('[data-compare-table] table')).toBeVisible();
  await audit(page, '/comparar (2 modelos)');
});

test('contraste de color: sin violaciones en la ficha de producto', async ({ page }) => {
  await page.goto(GE);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations.filter((v) => v.id === 'color-contrast')).toEqual([]);
});

test('BUG HeroSlider: los puntos del carrusel cumplen el tamaño mínimo de 24 px (target-size)', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations.filter((v) => v.id === 'target-size')).toEqual([]);
});

test('BUG /repuestos: el índice de tipos (.rp__jump .badge) cumple contraste 4,5:1', async ({ page }) => {
  await page.goto('/repuestos');
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations.filter((v) => v.id === 'color-contrast')).toEqual([]);
});
