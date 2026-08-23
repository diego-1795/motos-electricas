import { test, expect } from '@playwright/test';
import { CART_KEY, hydrated, readStorage } from './helpers';

interface StoredCart {
  items: { key: string; slug: string; quantity: number }[];
  notes: string;
}

test.describe('Persistencia del carrito', () => {
  test('el carrito sobrevive a recarga y navegación vía raiden:cart:v1', async ({ page }) => {
    await page.goto('/motos-electricas/odin-1-0');
    await hydrated(page.locator('[data-configurator]'));
    await page.getByRole('button', { name: 'Más unidades' }).click();
    await page.locator('[data-add-to-cart]').click();
    await expect(page.locator('[data-cart-drawer]')).toBeVisible();
    await expect(page.locator('[data-cart-count]')).toHaveText('2');

    const stored = await readStorage<StoredCart>(page, CART_KEY);
    expect(stored?.items).toHaveLength(1);
    expect(stored?.items[0]).toMatchObject({ slug: 'odin-1-0', quantity: 2 });
    expect(stored?.items[0]!.key).toMatch(/^product:odin-1-0:/);

    await page.reload();
    await expect(page.locator('[data-cart-count]')).toHaveText('2');
    await expect(page.locator('[data-cart-drawer]')).toBeHidden(); // el estado "abierto" no se persiste

    await page.goto('/carrito');
    await expect(page.locator('main [data-cart-item]')).toHaveCount(1);
    await page.locator('main').getByRole('textbox').fill('Nota persistente');
    await expect.poll(async () => (await readStorage<StoredCart>(page, CART_KEY))?.notes).toBe('Nota persistente');
    await page.reload();
    await expect(page.locator('main').getByRole('textbox')).toHaveValue('Nota persistente');
  });

  test('un valor corrupto en localStorage no rompe la página y se sanea', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((k) => localStorage.setItem(k, '{"items":[{"slug":1},{"kind":"product","slug":"x","name":"X","unitPrice":{"amount":100},"quantity":999}],"notes":5}'), CART_KEY);
    await page.goto('/carrito');
    await expect(page.locator('main [data-cart-item]')).toHaveCount(1);
    await expect(page.locator('main').getByRole('spinbutton', { name: 'Cantidad' })).toHaveValue('10');

    await page.evaluate((k) => localStorage.setItem(k, 'not json'), CART_KEY);
    await page.goto('/carrito');
    await expect(page.getByText('Tu solicitud está vacía')).toBeVisible();
  });
});
