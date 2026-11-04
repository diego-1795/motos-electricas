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
    await expect(page.locator('#panel-ficha [data-variant-name]')).toHaveText('Estándar');
    await expect(est(table).first()).toBeVisible();
    await expect(prem(table).first()).toBeHidden();

    // Cambiar a Premium
    await cfg.locator('input[name="variant"][value="premium"]').check();
    await expect(prem().first()).toBeVisible();
    await expect(est().first()).toBeHidden();
    await expect(prem().first()).toHaveText(/40-50 km/);
    await expect(tiles.locator('.spec-tile', { hasText: 'Potencia' }).locator('[data-spec-variant="premium"]')).toHaveText(/500 W/);
    await expect(page.locator('#panel-ficha [data-variant-name]')).toHaveText('Premium');
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

  test('Golden Eagle: la pestaña Especificaciones también sigue a la versión (motor, batería, autonomía)', async ({ page }) => {
    await page.goto(GE);
    const cfg = page.locator('[data-configurator]');
    await hydrated(cfg);
    await page.getByRole('tab', { name: 'Especificaciones' }).click();
    const panel = page.locator('#panel-especificaciones');
    await expect(panel).toBeVisible();
    // Una sola lista: primero las líneas de la versión elegida (motor, batería, autonomía), después las comunes
    const est = panel.locator('li[data-spec-variant="estandar"]');
    const prem = panel.locator('li[data-spec-variant="premium"]');
    await expect(est).toHaveCount(3);
    await expect(prem).toHaveCount(3);
    await expect(est.first()).toBeVisible();
    await expect(prem.first()).toBeHidden();
    await expect(est.first()).toContainText('350 W');
    await expect(est.nth(1)).toContainText('48V 12Ah');
    await expect(panel.locator('[data-variant-name]')).toHaveText('Estándar');
    // Las comunes se muestran una sola vez, sin duplicar el motor
    await expect(panel.locator('li:not([data-spec-variant])', { hasText: 'Motor sin escobillas' })).toHaveCount(0);
    await expect(panel.locator('li:not([data-spec-variant])', { hasText: 'Pantalla LCD' })).toHaveCount(1);
    // Sin recuadro: las líneas de versión están en la misma lista que las comunes
    await expect(panel.locator('ul.ptabs__features')).toHaveCount(1);

    await cfg.locator('input[name="variant"][value="premium"]').check();
    await expect(prem.first()).toBeVisible();
    await expect(est.first()).toBeHidden();
    await expect(prem.first()).toContainText('500 W');
    await expect(prem.nth(1)).toContainText('48V 20Ah');
    await expect(panel.locator('[data-variant-name]')).toHaveText('Premium');
  });

  test('Titan Rhino: una sola versión, sin valores por versión ni aviso', async ({ page }) => {
    await page.goto(TITAN);
    await hydrated(page.locator('[data-configurator]'));
    await expect(page.locator('[data-spec-variant]')).toHaveCount(0);
    await expect(page.locator('[data-variant-name]')).toHaveCount(0);
    await expect(page.locator('.spec-grid')).toContainText('800 W');
  });

  // Petición del cliente (2026-11-04): "Asientos" en vez de "Plazas", sin fila de licencia y garantía de 6 meses en motor y batería
  for (const path of [GE, TITAN, '/promociones/golden-eagle-eg-motors']) {
    test(`${path}: la tabla rotula "Asientos", no muestra "Licencia" y da 6 meses de garantía en motor y batería`, async ({ page }) => {
      await page.goto(path);
      const table = page.locator('.ptabs__table');
      await expect(table).toBeAttached();
      await expect(table.locator('th', { hasText: /^Asientos$/ })).toHaveCount(1);
      await expect(table.locator('th', { hasText: /^Plazas$/ })).toHaveCount(0);
      await expect(table.locator('th', { hasText: /Licencia/ })).toHaveCount(0);
      await expect(table).not.toContainText('Licencia');
      await expect(table).not.toContainText('12 meses');
      const warranty = table.locator('tr', { hasText: 'Garantía' });
      await expect(warranty).toHaveCount(1);
      await expect(warranty).toContainText('6 meses (motor y batería)');
      // El bloque "Garantía y servicio técnico" lee specs.warrantyMonths
      await expect(page.locator('.pdp__warranty')).toContainText(/6 meses/);
      await expect(page.locator('.pdp__warranty')).not.toContainText('12 meses');
    });
  }
});
