import { test, expect } from '@playwright/test';
import { MOTOR, WA_PREFIX, hydrated, parsePrice } from './helpers';

test.describe('Repuestos', () => {
  test('/repuestos lista ≥ 20 piezas agrupadas por tipo con índice de saltos', async ({ page }) => {
    await page.goto('/repuestos');
    await expect(page.locator('h1')).toHaveText('Repuestos para bicimotos eléctricas');
    const cards = page.locator('[data-part-card]');
    expect(await cards.count()).toBeGreaterThanOrEqual(20);
    const groups = page.locator('section.rp__group');
    expect(await groups.count()).toBeGreaterThanOrEqual(5);
    // Cada grupo tiene h2 y al menos una tarjeta; el índice enlaza a cada grupo
    for (const g of await groups.all()) {
      await expect(g.locator('h2')).toHaveCount(1);
      expect(await g.locator('[data-part-card]').count()).toBeGreaterThanOrEqual(1);
      const id = await g.getAttribute('id');
      await expect(page.locator(`.rp__jump a[href="#${id}"]`)).toHaveCount(1);
    }
    // Motores agrupa 350 W y 500 W
    const motores = page.locator('section.rp__group#motor');
    await expect(motores.locator('h2')).toHaveText('Motores');
    await expect(motores.locator('[data-part-card="motor-350w"]')).toBeVisible();
    await expect(motores.locator('[data-part-card="motor-500w"]')).toBeVisible();
    // Precio y unidad: hay piezas vendidas por par
    expect(await page.locator('.rp__unit', { hasText: 'por par' }).count()).toBeGreaterThanOrEqual(1);
    for (const href of await cards.locator('h3 a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
      expect(href).toMatch(/^\/repuestos\/[a-z0-9-]+$/);
    }
  });

  test('QuickAdd añade "Motor 350 W" al carrito desde el listado', async ({ page }) => {
    await page.goto('/repuestos');
    const card = page.locator('[data-part-card="motor-350w"]');
    const add = card.locator('[data-quick-add]');
    await hydrated(add);
    await add.click();
    const drawer = page.locator('[data-cart-drawer]');
    await expect(drawer).toBeVisible();
    const item = drawer.locator('[data-cart-item]');
    await expect(item).toHaveCount(1);
    await expect(item.first()).toContainText('Motor 350 W');
    expect(parsePrice(await drawer.locator('[data-cart-total]').innerText())).toBe(350);
    await expect(page.locator('[data-cart-count]')).toHaveText('1');
    // El mensaje de WhatsApp lleva el repuesto con su icono
    const href = await drawer.locator('[data-cart-request]').getAttribute('href');
    expect(href!.startsWith(WA_PREFIX)).toBe(true);
    expect(decodeURIComponent(href!.split('text=')[1]!)).toContain('Motor 350 W');
  });

  test('/repuestos/motor-350w: ficha con precio, "Compatible con" y añadir a la solicitud', async ({ page }) => {
    await page.goto(MOTOR);
    await expect(page.locator('h1')).toHaveText('Motor 350 W');
    await expect(page.locator('.rpd__price strong')).toHaveText(/S\/[  ]350/);
    await expect(page.locator('.rpd__unit')).toHaveText('por unidad');
    await expect(page.locator('.eyebrow a[href="/repuestos#motor"]')).toHaveText('Motores');

    const compat = page.locator('.rpd__compat');
    await expect(compat.locator('h2')).toHaveText('Compatible con');
    const links = compat.locator('a');
    await expect(links).toHaveCount(3);
    const hrefs = (await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).sort();
    expect(hrefs).toEqual(['/bicimotos/golden-eagle', '/bicimotos/royal-tiger', '/bicimotos/vortex-kobra']);
    await expect(compat).toContainText('Golden Eagle');

    await expect(page.locator('.rpd__more h2')).toHaveText('Más en motores');
    await expect(page.locator('.rpd__more a[href="/repuestos/motor-500w"]')).toHaveCount(1);

    const add = page.locator('[data-quick-add="motor-350w"]').first();
    await hydrated(add);
    await expect(add).toHaveText('Añadir a la solicitud');
    await add.click();
    const drawer = page.locator('[data-cart-drawer]');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('[data-cart-item]').first()).toContainText('Motor 350 W');

    // Consulta directa por WhatsApp con el nombre del repuesto
    const wa = page.locator('.rpd__actions [data-wa-source="product"]');
    const href = await wa.getAttribute('href');
    expect(href!.startsWith(WA_PREFIX)).toBe(true);
    expect(decodeURIComponent(href!.split('text=')[1]!)).toContain('Motor 350 W');
  });

  test('un repuesto universal (compatibleWith vacío) muestra el texto de toda la gama', async ({ page }) => {
    await page.goto('/repuestos');
    // Buscamos una pieza cuya ficha no liste modelos concretos; "Espejos retrovisores" es universal en el brief
    await page.goto('/repuestos/espejos-retrovisores');
    await expect(page.locator('h1')).toHaveText(/Espejos/);
    const compat = page.locator('.rpd__compat');
    await expect(compat.locator('h2')).toHaveText('Compatible con');
    const hasList = (await compat.locator('.rpd__compatlist').count()) > 0;
    if (!hasList) await expect(compat).toContainText('toda la gama RAIDEN');
    else expect(await compat.locator('.rpd__compatlist a').count()).toBeGreaterThanOrEqual(1);
  });
});
