import { test, expect, type Page } from '@playwright/test';
import { parsePrice } from './helpers';

const visibleItems = (page: Page) => page.locator('[data-catalog] [data-item]:not([hidden])');

/** En móvil el script cierra el <details> de filtros: lo abrimos si hace falta. */
async function openFilters(page: Page) {
  const details = page.locator('[data-filters] details');
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) {
    await details.locator('summary').click();
  }
  await expect(page.locator('#f-velocidad')).toBeVisible();
}

test.describe('Catálogo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/motos-electricas');
  });

  test('renderiza al menos 5 tarjetas con H1', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText(/Catálogo/);
    expect(await page.locator('[data-product-card]').count()).toBeGreaterThanOrEqual(5);
    await expect(page.locator('[data-count]')).toHaveText(/^\d+ modelos$/);
  });

  test('filtro de velocidad mínima reduce resultados y actualiza la URL', async ({ page }) => {
    const total = await visibleItems(page).count();
    await openFilters(page);

    await page.locator('#f-velocidad').fill('80');
    await expect(page.locator('[data-out="velocidad"]')).toHaveText('80 km/h');

    const after = visibleItems(page);
    await expect.poll(() => after.count()).toBeLessThan(total);
    expect(await after.count()).toBeGreaterThanOrEqual(1);
    for (const v of await after.evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.velocidad)))) {
      expect(v).toBeGreaterThanOrEqual(80);
    }
    await expect(page.locator('[data-count]')).toHaveText(`${await after.count()} modelos`);
    await expect(page).toHaveURL(/[?&]velocidad=80/);
  });

  test('ordenar por precio ascendente reordena las tarjetas y actualiza la URL', async ({ page }) => {
    await page.locator('[data-sort]').selectOption('precio-asc');
    await expect(page).toHaveURL(/[?&]orden=precio-asc/);

    const items = visibleItems(page);
    const prices = await items.evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.precio)));
    expect(prices.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < prices.length; i++) expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]!);

    // El precio visible en tarjeta coincide con el orden
    const first = parsePrice(await items.nth(0).locator('[data-product-card] .pc__price strong').innerText());
    const second = parsePrice(await items.nth(1).locator('[data-product-card] .pc__price strong').innerText());
    expect(first).toBeLessThanOrEqual(second);
  });

  test('los filtros se restauran desde la query string', async ({ page }) => {
    await page.goto('/motos-electricas?velocidad=80&orden=precio-desc');
    await expect(page.locator('#f-velocidad')).toHaveValue('80');
    await expect(page.locator('[data-sort]')).toHaveValue('precio-desc');
    const prices = await visibleItems(page).evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.precio)));
    for (let i = 1; i < prices.length; i++) expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]!);
  });

  test('un filtro imposible oculta todas las tarjetas y "Quitar filtros" las restaura', async ({ page }) => {
    await openFilters(page);
    await page.locator('#f-precio').fill('500');
    await expect(visibleItems(page)).toHaveCount(0);
    await expect(page.locator('[data-empty]')).not.toHaveAttribute('hidden', /.*/);
    await expect(page.locator('[data-count]')).toHaveText('0 modelos');
    await page.locator('[data-reset]').click();
    await expect(page.locator('[data-empty]')).toHaveAttribute('hidden', '');
    expect(await visibleItems(page).count()).toBeGreaterThanOrEqual(5);
  });

  /**
   * BUG src/components/catalog/CatalogView.astro:285 — `.results__empty{display:flex}` (estilo scoped)
   * pisa el `display:none` del atributo `hidden` del UA, así que "No hay modelos con esos filtros"
   * se ve SIEMPRE, incluso sin filtros. Fix: añadir `.results__empty[hidden]{display:none}`.
   */
  test('el mensaje de "sin resultados" solo se ve cuando no hay modelos', async ({ page }) => {
    await expect(page.locator('[data-empty]')).toBeHidden();
    await openFilters(page);
    await page.locator('#f-precio').fill('500');
    await expect(page.locator('[data-empty]')).toBeVisible();
    await page.locator('[data-reset]').click();
    await expect(page.locator('[data-empty]')).toBeHidden();
  });
});
