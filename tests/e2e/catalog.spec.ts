import { test, expect, type Page } from '@playwright/test';
import { openFilters, parsePrice } from './helpers';

const visibleItems = (page: Page) => page.locator('[data-catalog] [data-item]:not([hidden])');
const pricesOf = (page: Page) => visibleItems(page).evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.precio)));
const premiumBox = (page: Page) => page.locator('[data-filters] input[name="etiqueta"][value="premium"]');

test.describe('Catálogo /productos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/productos');
  });

  test('renderiza los 4 modelos reales con H1 y contador', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Todos los productos');
    const cards = page.locator('[data-product-card]');
    await expect(cards).toHaveCount(4);
    const slugs = await cards.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.productCard).sort());
    expect(slugs).toEqual(['golden-eagle', 'royal-tiger', 'titan-rhino', 'vortex-kobra']);
    await expect(page.locator('[data-count]')).toHaveText('4 modelos');
    await expect(page.locator('[data-count-inline]')).toHaveText('4');
    // Cada tarjeta enlaza a su ruta de categoría real
    for (const href of await cards.locator('.pc__name a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
      expect(href).toMatch(/^\/(bicimotos|trimotos)\/[a-z-]+$/);
    }
  });

  test('las tarjetas muestran versiones (Estándar/Premium) y "Desde S/"', async ({ page }) => {
    const ge = page.locator('[data-product-card="golden-eagle"]');
    await expect(ge.locator('.pc__tiers')).toHaveText('Estándar · Premium');
    expect(parsePrice(await ge.locator('.pc__price strong').innerText())).toBe(1200);
    const titan = page.locator('[data-product-card="titan-rhino"]');
    await expect(titan.locator('.pc__tiers')).toHaveText('Estándar');
    expect(parsePrice(await titan.locator('.pc__price strong').innerText())).toBe(2700);
    await expect(page.locator('[data-item][data-slug="titan-rhino"]')).toHaveAttribute('data-tipo', 'trimotos');
  });

  test('filtro etiqueta Premium deja las 3 bicimotos y sincroniza la URL', async ({ page }) => {
    await openFilters(page, premiumBox(page));
    await premiumBox(page).check();
    await expect(visibleItems(page)).toHaveCount(3);
    const slugs = await visibleItems(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.slug).sort());
    expect(slugs).toEqual(['golden-eagle', 'royal-tiger', 'vortex-kobra']);
    await expect(page.locator('[data-item][data-slug="titan-rhino"]')).toBeHidden();
    await expect(page.locator('[data-count]')).toHaveText('3 modelos');
    await expect(page).toHaveURL(/[?&]etiqueta=premium/);

    await premiumBox(page).uncheck();
    await expect(visibleItems(page)).toHaveCount(4);
    await expect(page).not.toHaveURL(/etiqueta=/);
  });

  test('filtro de categoría: trimotos → solo Titan Rhino', async ({ page }) => {
    const tipo = page.locator('#f-tipo');
    await openFilters(page, tipo);
    await tipo.selectOption('trimotos');
    await expect(visibleItems(page)).toHaveCount(1);
    await expect(visibleItems(page).first()).toHaveAttribute('data-slug', 'titan-rhino');
    await expect(page).toHaveURL(/[?&]tipo=trimotos/);
  });

  test('ordenar por precio ascendente reordena las tarjetas y actualiza la URL', async ({ page }) => {
    await page.locator('[data-sort]').selectOption('precio-asc');
    await expect(page).toHaveURL(/[?&]orden=precio-asc/);
    const prices = await pricesOf(page);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(prices[0]).toBe(1200);
    expect(prices[prices.length - 1]).toBe(2700);
    // El precio visible coincide con el orden de las tarjetas
    const items = visibleItems(page);
    const first = parsePrice(await items.nth(0).locator('.pc__price strong').innerText());
    const last = parsePrice(await items.nth(3).locator('.pc__price strong').innerText());
    expect(first).toBeLessThanOrEqual(last);
  });

  test('los filtros se restauran desde la query string', async ({ page }) => {
    await page.goto('/productos?etiqueta=premium&orden=precio-desc');
    await expect(premiumBox(page)).toBeChecked();
    await expect(page.locator('[data-sort]')).toHaveValue('precio-desc');
    await expect(visibleItems(page)).toHaveCount(3);
    const prices = await pricesOf(page);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });

  test('un filtro imposible oculta todo y "Quitar filtros" restaura', async ({ page }) => {
    const price = page.locator('#f-precio');
    await openFilters(page, price);
    await expect(price).toHaveAttribute('min', '500');
    await price.fill('500');
    await expect(page.locator('[data-out="precio"]')).toHaveText('S/ 500');
    await expect(visibleItems(page)).toHaveCount(0);
    const empty = page.locator('[data-empty]');
    await expect(empty).toBeVisible();
    await expect(page.locator('[data-count]')).toHaveText('0 modelos');
    await expect(page).toHaveURL(/[?&]precio=500/);
    await page.locator('[data-reset]').click();
    await expect(empty).toBeHidden();
    await expect(visibleItems(page)).toHaveCount(4);
    await expect(page).not.toHaveURL(/precio=/);
  });

  test('el mensaje de "sin resultados" no se ve con el catálogo completo', async ({ page }) => {
    await expect(page.locator('[data-empty]')).toBeHidden();
  });
});

test.describe('Páginas de categoría', () => {
  test('/bicimotos lista 3 modelos sin selector de categoría', async ({ page }) => {
    await page.goto('/bicimotos');
    await expect(page.locator('h1')).toHaveText('Bicimotos eléctricas en Lima, Perú');
    await expect(page.locator('[data-product-card]')).toHaveCount(3);
    await expect(page.locator('#f-tipo')).toHaveCount(0);
    const tipos = await page.locator('[data-item]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.tipo));
    expect(new Set(tipos)).toEqual(new Set(['bicimotos']));
  });

  test('/trimotos lista 1 modelo', async ({ page }) => {
    await page.goto('/trimotos');
    await expect(page.locator('h1')).toHaveText('Trimotos eléctricas de carga en Perú');
    await expect(page.locator('[data-product-card]')).toHaveCount(1);
    await expect(page.locator('[data-product-card="titan-rhino"]')).toBeVisible();
  });

  test('las rutas antiguas ya no existen', async ({ request }) => {
    for (const path of ['/motos-electricas', '/motos-electricas/odin-1-0', '/accesorios']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(404);
    }
  });
});
