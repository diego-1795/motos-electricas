import { test, expect } from '@playwright/test';
import { CART_KEY, GE, addGoldenEagle, readStorage } from './helpers';

interface StoredCart {
  items: { key: string; slug: string; kind: string; quantity: number }[];
  notes: string;
}

test.describe('Persistencia del carrito', () => {
  test('el carrito sobrevive a recarga y navegación vía raiden:cart:v1', async ({ page }) => {
    await addGoldenEagle(page, 2);
    await expect(page.locator('[data-cart-count]')).toHaveText('2');

    const stored = await readStorage<StoredCart>(page, CART_KEY);
    expect(stored?.items).toHaveLength(1);
    expect(stored?.items[0]).toMatchObject({ slug: 'golden-eagle', kind: 'product', quantity: 2 });
    expect(stored?.items[0]!.key).toBe('product:golden-eagle:estandar:negro');

    await page.reload();
    await expect(page.locator('[data-cart-count]')).toHaveText('2');
    await expect(page.locator('[data-cart-drawer]')).toBeHidden(); // el estado "abierto" no se persiste
    // Hidratación: el botón anuncia el número real tras recargar
    await expect(page.locator('[data-cart-button]')).toHaveAttribute('aria-label', 'Abrir carrito, 2 artículos');

    await page.goto('/carrito');
    const cartPage = page.locator('[data-cart-page]');
    await expect(cartPage).toBeVisible();
    await expect(cartPage).toHaveClass(/\bcp\b/);
    await expect(cartPage).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.cp__empty')).toHaveCount(0);
    await expect(cartPage.locator('[data-cart-item]')).toHaveCount(1);
    await cartPage.getByRole('textbox').fill('Nota persistente');
    await expect.poll(async () => (await readStorage<StoredCart>(page, CART_KEY))?.notes).toBe('Nota persistente');
    await page.reload();
    await expect(page.locator('[data-cart-page]').getByRole('textbox')).toHaveValue('Nota persistente');
  });

  test('un repuesto y una bicimoto conviven en el carrito persistido con claves distintas', async ({ page }) => {
    await addGoldenEagle(page);
    await page.keyboard.press('Escape');
    await page.goto('/repuestos/motor-350w');
    const add = page.locator('[data-quick-add="motor-350w"]').first();
    await expect(add.locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr', /.*/);
    await add.click();
    await expect(page.locator('[data-cart-count]')).toHaveText('2');
    const stored = await readStorage<StoredCart>(page, CART_KEY);
    expect(stored?.items.map((i) => i.key).sort()).toEqual(['accessory:motor-350w', 'product:golden-eagle:estandar:negro']);
  });

  test('un valor corrupto en localStorage no rompe la página y se sanea', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(
      (k) => localStorage.setItem(k, '{"items":[{"slug":1},{"kind":"product","slug":"x","name":"X","unitPrice":{"amount":100},"quantity":999}],"notes":5}'),
      CART_KEY,
    );
    await page.goto('/carrito');
    await expect(page.locator('[data-cart-page] [data-cart-item]')).toHaveCount(1);
    await expect(page.locator('[data-cart-page]').getByRole('spinbutton', { name: 'Cantidad' })).toHaveValue('10');

    await page.evaluate((k) => localStorage.setItem(k, 'not json'), CART_KEY);
    await page.goto('/carrito');
    await expect(page.getByText('Tu solicitud está vacía')).toBeVisible();
    await page.goto(GE);
    await expect(page.locator('[data-cart-count]')).toHaveCount(0);
  });
});
