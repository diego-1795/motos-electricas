import { test, expect } from '@playwright/test';
import { GE, TITAN, hydrated } from './helpers';

/**
 * Ficha técnica por versión: al cambiar Estándar ↔ Premium en el configurador,
 * los tiles y la tabla muestran los datos de esa versión (autonomía, potencia, batería…).
 */
test.describe('Ficha técnica por versión', () => {
  test('Golden Eagle: Estándar por defecto; al elegir Premium cambian tiles, tabla y aviso', async ({ page }) => {
    await page.goto(GE);
    const cfg = page.locator('[data-configurator]');
    await hydrated(cfg);

    const tiles = page.locator('.spec-grid');
    const table = page.locator('.ptabs__table');
    const est = (root = tiles) => root.locator('[data-spec-variant="estandar"]');
    const prem = (root = tiles) => root.locator('[data-spec-variant="premium"]');

    // Por defecto: Estándar visible, Premium oculta; etiquetas de versión ocultas (hay JS)
    await expect(est().first()).toBeVisible();
    await expect(prem().first()).toBeHidden();
    await expect(est().first()).toHaveText(/30-35 km/);
    await expect(tiles.locator('.spec-variant__tier').first()).toBeHidden();
    await expect(page.locator('[data-variant-name]')).toHaveText('Estándar');
    await expect(est(table).first()).toBeVisible();
    await expect(prem(table).first()).toBeHidden();

    // Cambiar a Premium
    await cfg.locator('input[name="variant"][value="premium"]').check();
    await expect(prem().first()).toBeVisible();
    await expect(est().first()).toBeHidden();
    await expect(prem().first()).toHaveText(/40-50 km/);
    await expect(tiles.locator('.spec-tile', { hasText: 'Potencia' }).locator('[data-spec-variant="premium"]')).toHaveText(/500 W/);
    await expect(page.locator('[data-variant-name]')).toHaveText('Premium');
    await expect(prem(table).first()).toBeVisible();
    await expect(est(table).first()).toBeHidden();
    // La fila "Batería extraíble" difiere entre versiones en Golden Eagle (Sí/No)
    const removable = table.locator('tr', { hasText: 'Batería extraíble' });
    await expect(removable.locator('[data-spec-variant="premium"]')).toHaveText(/No/);
    await expect(removable.locator('[data-spec-variant="estandar"]')).toBeHidden();

    // Los valores comunes siguen siendo una sola celda (velocidad)
    await expect(tiles.locator('.spec-tile', { hasText: 'Velocidad' }).locator('[data-spec-variant]')).toHaveCount(0);

    // Y vuelta a Estándar
    await cfg.locator('input[name="variant"][value="estandar"]').check();
    await expect(est().first()).toBeVisible();
    await expect(prem().first()).toBeHidden();
  });

  test('Titan Rhino: una sola versión, sin valores por versión ni aviso', async ({ page }) => {
    await page.goto(TITAN);
    await hydrated(page.locator('[data-configurator]'));
    await expect(page.locator('[data-spec-variant]')).toHaveCount(0);
    await expect(page.locator('[data-variant-name]')).toHaveCount(0);
    await expect(page.locator('.spec-grid')).toContainText('800 W');
  });
});
