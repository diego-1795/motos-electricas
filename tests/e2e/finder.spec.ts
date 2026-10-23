import { test, expect } from '@playwright/test';
import { hydrated } from './helpers';

test.describe('Encuentra tu bicimoto', () => {
  test('tres pasos (uso → km/día + presupuesto → carga) → resultados ordenados con puntuación', async ({ page }) => {
    await page.goto('/encuentra-tu-moto');
    await expect(page.locator('h1')).toHaveText('Encuentra tu bicimoto');
    const finder = page.locator('[data-finder]');
    await hydrated(finder);
    await expect(finder.locator('.bf__progress li')).toHaveText(['Uso', 'Distancia y presupuesto', 'Carga']);

    // Paso 1: uso. "Continuar" está deshabilitado hasta elegir algo.
    await expect(finder.getByRole('heading', { name: '¿Para qué la usarás?' })).toBeVisible();
    const next = finder.getByRole('button', { name: 'Continuar' });
    await expect(next).toBeDisabled();
    await finder.getByRole('checkbox', { name: 'Ciudad' }).check();
    await expect(next).toBeEnabled();
    await next.click();

    // Paso 2: distancia diaria y presupuesto
    await expect(finder.getByRole('heading', { name: 'Distancia y presupuesto' })).toBeVisible();
    await expect(finder.locator('.bf__progress [aria-current="step"]')).toHaveText('Distancia y presupuesto');
    await finder.getByRole('radio', { name: '15-30 km' }).check();
    await finder.getByRole('radio', { name: 'Hasta S/ 1,500' }).check();
    await finder.getByRole('button', { name: 'Continuar' }).click();

    // Paso 3: carga → finalizar
    await expect(finder.getByRole('heading', { name: '¿Llevarás carga?' })).toBeVisible();
    await finder.getByRole('radio', { name: /^No, solo yo/ }).check();
    await finder.locator('[data-finder-finish]').click();

    const results = finder.locator('[data-finder-result]');
    expect(await results.count()).toBeGreaterThanOrEqual(1);
    expect(await results.count()).toBeLessThanOrEqual(4);

    const scores = await results.locator('.bf__score strong').allInnerTexts();
    for (const s of scores) expect(s).toMatch(/^\d{1,3}%$/);
    const nums = scores.map((s) => Number(s.replace('%', '')));
    for (let i = 1; i < nums.length; i++) expect(nums[i]).toBeLessThanOrEqual(nums[i - 1]!);

    // Las bicimotos que encajan en presupuesto y uso van primero y enlazan a su ruta real
    const first = results.first();
    await expect(first.getByRole('link', { name: 'Ver modelo' })).toHaveAttribute('href', /^\/bicimotos\/(golden-eagle|royal-tiger|vortex-kobra)$/);
    await expect(first).toContainText('Dentro de tu presupuesto');
    await expect(first).toContainText('Ideal para ciudad');
    await expect(first.locator('.specs-inline')).toContainText(/\d{3} W/);
    await expect(first.locator('.specs-inline')).toContainText('25 km/h');
    await expect(first).toContainText(/Desde S\/[  ]1,[24]00/);
    // Al preferir bicimotos, la trimoto (si aparece) va la última
    const hrefs = await results.getByRole('link', { name: 'Ver modelo' }).evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    const titanIdx = hrefs.indexOf('/trimotos/titan-rhino');
    if (titanIdx !== -1) expect(titanIdx).toBe(hrefs.length - 1);

    // Volver a empezar resetea al paso 1
    await finder.getByRole('button', { name: 'Volver a empezar' }).click();
    await expect(finder.getByRole('heading', { name: '¿Para qué la usarás?' })).toBeVisible();
    await expect(finder.getByRole('checkbox', { name: 'Ciudad' })).not.toBeChecked();
  });

  test('carga pesada recomienda la trimoto en primer lugar', async ({ page }) => {
    await page.goto('/encuentra-tu-moto');
    const finder = page.locator('[data-finder]');
    await hydrated(finder);
    await finder.getByRole('checkbox', { name: 'Reparto' }).check();
    await finder.getByRole('button', { name: 'Continuar' }).click();
    await finder.getByRole('radio', { name: 'Sin límite' }).check();
    await finder.getByRole('button', { name: 'Continuar' }).click();
    await finder.getByRole('radio', { name: /^Sí, mercadería/ }).check();
    await finder.locator('[data-finder-finish]').click();
    const first = finder.locator('[data-finder-result]').first();
    await expect(first).toContainText('Titan Rhino');
    await expect(first.getByRole('link', { name: 'Ver modelo' })).toHaveAttribute('href', '/trimotos/titan-rhino');
    await expect(first.locator('.bf__score strong')).toHaveText('100%');
    // "Atrás" funciona desde el paso 2
    await finder.getByRole('button', { name: 'Volver a empezar' }).click();
    await finder.getByRole('checkbox', { name: 'Ocio' }).check();
    await finder.getByRole('button', { name: 'Continuar' }).click();
    await finder.getByRole('button', { name: 'Atrás' }).click();
    await expect(finder.getByRole('checkbox', { name: 'Ocio' })).toBeChecked();
  });
});
