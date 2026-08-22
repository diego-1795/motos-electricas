import { test, expect } from '@playwright/test';

test.describe('Encuentra tu moto', () => {
  test('tres pasos → resultados ordenados con puntuación', async ({ page }) => {
    await page.goto('/encuentra-tu-moto');
    await expect(page.locator('h1')).toHaveText(/Encuentra tu moto/);
    const finder = page.locator('[data-finder]');

    // Paso 1: uso. "Continuar" está deshabilitado hasta elegir algo.
    const next = finder.getByRole('button', { name: 'Continuar' });
    await expect(next).toBeDisabled();
    await finder.getByRole('checkbox', { name: 'Ciudad' }).check();
    await expect(next).toBeEnabled();
    await next.click();

    // Paso 2: preferencias
    await expect(finder.getByRole('heading', { name: 'Tus preferencias' })).toBeVisible();
    await finder.getByRole('radio', { name: 'Hasta 5.000 €' }).check();
    await finder.getByRole('radio', { name: '60-100 km' }).check();
    await finder.getByRole('radio', { name: '80 km/h (125cc eq.)' }).check();
    await finder.getByRole('button', { name: 'Continuar' }).click();

    // Paso 3: tipo (opcional) → finalizar
    await expect(finder.getByRole('heading', { name: '¿Tienes un tipo en mente?' })).toBeVisible();
    await finder.locator('[data-finder-finish]').click();

    const results = finder.locator('[data-finder-result]');
    expect(await results.count()).toBeGreaterThanOrEqual(1);
    expect(await results.count()).toBeLessThanOrEqual(4);

    const scores = await results.locator('.bf__score strong').allInnerTexts();
    for (const s of scores) expect(s).toMatch(/^\d{1,3}%$/);
    const nums = scores.map((s) => Number(s.replace('%', '')));
    for (let i = 1; i < nums.length; i++) expect(nums[i]).toBeLessThanOrEqual(nums[i - 1]!);

    await expect(results.first().getByRole('link', { name: 'Ver modelo' })).toHaveAttribute('href', /^\/motos-electricas\//);
    await expect(results.first()).toContainText('Dentro de tu presupuesto');

    // Volver a empezar resetea al paso 1
    await finder.getByRole('button', { name: 'Volver a empezar' }).click();
    await expect(finder.getByRole('heading', { name: '¿Para qué la vas a usar?' })).toBeVisible();
  });
});
