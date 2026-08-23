import { test, expect } from '@playwright/test';
import { decodeWaHref, hydrated, parsePrice } from './helpers';

test.describe('Ficha de producto → carrito → WhatsApp', () => {
  test('flujo completo con variante, color, cantidad, notas y enlace wa.me', async ({ page }) => {
    await page.goto('/motos-electricas/odin-1-0');
    await expect(page.locator('h1')).toHaveText('ODIN 1.0');

    const cfg = page.locator('[data-configurator]');
    await hydrated(cfg);

    // Segunda variante y segundo color
    const variants = cfg.locator('input[name="variant"]');
    const colors = cfg.locator('input[name="color"]');
    await expect(variants).toHaveCount(2);
    const basePrice = parsePrice(await cfg.locator('[data-price]').innerText());
    await variants.nth(1).check();
    await expect(variants.nth(1)).toBeChecked();
    const variantName = (await variants.nth(1).locator('xpath=..').innerText()).split('·')[0]!.trim();
    expect(variantName).toContain('72V 50Ah');
    await expect.poll(async () => parsePrice(await cfg.locator('[data-price]').innerText())).toBeGreaterThan(basePrice);

    await colors.nth(1).check({ force: true });
    await expect(colors.nth(1)).toBeChecked();
    const colorName = (await colors.nth(1).locator('xpath=..').innerText()).trim();

    // Cantidad 2 con el stepper
    const qty = cfg.getByRole('spinbutton', { name: 'Unidades' });
    await cfg.getByRole('button', { name: 'Más unidades' }).click();
    await expect(qty).toHaveValue('2');

    await cfg.locator('[data-add-to-cart]').click();

    // Drawer con 1 línea: variante + color
    const drawer = page.locator('[data-cart-drawer]');
    await expect(drawer).toBeVisible();
    const items = drawer.locator('[data-cart-item]');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('ODIN 1.0');
    await expect(items.first()).toContainText(variantName);
    await expect(items.first()).toContainText(colorName);
    await expect(items.first().getByRole('spinbutton', { name: 'Cantidad' })).toHaveValue('2');
    await expect(page.locator('[data-cart-count]')).toHaveText('2');

    // "+" en el drawer → total cambia
    const totalBefore = parsePrice(await drawer.locator('[data-cart-total]').innerText());
    await items.first().getByRole('button', { name: 'Aumentar cantidad' }).click();
    await expect.poll(async () => parsePrice(await drawer.locator('[data-cart-total]').innerText())).toBeGreaterThan(totalBefore);
    await expect(items.first().getByRole('spinbutton', { name: 'Cantidad' })).toHaveValue('3');

    // Escape cierra el drawer
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();

    // Página /carrito
    await page.goto('/carrito');
    // NOTA: se usa `main` y no `[data-cart-page]` por el bug de hidratación descrito en hydration.spec.ts
    const cartPage = page.locator('main');
    await expect(cartPage.locator('[data-cart-item]')).toHaveCount(1);
    await expect(cartPage.locator('[data-cart-item]').first()).toContainText('ODIN 1.0');

    const notes = 'Entrega en Lima';
    await cartPage.getByRole('textbox').fill(notes);
    await page.getByText('Ver mensaje que se enviará').click();
    const preview = page.locator('[data-message-preview]');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('ODIN 1.0');
    await expect(preview).toContainText(variantName);
    await expect(preview).toContainText('Cantidad: 3');
    await expect(preview).toContainText('Total estimado: S/');
    await expect(preview).not.toContainText('€');
    await expect(preview).toContainText(notes);
    const unit = parsePrice(await cartPage.locator('[data-cart-item] .muted', { hasText: '/ ud.' }).innerText());
    expect(parsePrice(await cartPage.locator('[data-cart-total]').innerText())).toBe(3 * unit);

    // Enlace WhatsApp
    const link = cartPage.locator('[data-cart-request]');
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(href!.startsWith('https://wa.me/51987654321?text=')).toBe(true);
    expect(href).not.toContain(' ');
    const decoded = decodeWaHref(href!);
    expect(decoded).toContain('Estoy interesado en realizar el siguiente pedido');
    expect(decoded).toContain('ODIN 1.0');
    expect(decoded).toContain('Cantidad: 3');
    expect(decoded).toContain('Total estimado: S/');
    expect(decoded).not.toContain('€');
    expect(decoded).toContain(notes);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);

    // Eliminar → estado vacío
    await cartPage.locator('[data-cart-remove]').first().click();
    await expect(cartPage.locator('[data-cart-item]')).toHaveCount(0);
    await expect(page.getByText('Tu solicitud está vacía')).toBeVisible();
    await expect(page.locator('[data-cart-count]')).toHaveCount(0);
  });

  test('decrementar a 0 en el drawer elimina la línea', async ({ page }) => {
    await page.goto('/motos-electricas/odin-1-0');
    await hydrated(page.locator('[data-configurator]'));
    await page.locator('[data-add-to-cart]').click();
    const drawer = page.locator('[data-cart-drawer]');
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: 'Reducir cantidad' }).click();
    await expect(drawer.locator('[data-cart-item]')).toHaveCount(0);
    await expect(drawer).toContainText('Tu carrito está vacío');
  });

  test('el quick add del catálogo añade la variante por defecto', async ({ page }) => {
    await page.goto('/motos-electricas');
    const card = page.locator('[data-product-card="odin-1-0"]');
    await hydrated(card.locator('[data-quick-add]'));
    await card.locator('[data-quick-add]').click();
    const drawer = page.locator('[data-cart-drawer]');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('[data-cart-item]')).toHaveCount(1);
    await expect(drawer.locator('[data-cart-item]').first()).toContainText('ODIN 1.0');
  });
});
