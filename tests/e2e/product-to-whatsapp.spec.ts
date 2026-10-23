import { test, expect } from '@playwright/test';
import { GE, WA_PREFIX, decodeWaHref, hydrated, parsePrice } from './helpers';

test.describe('Ficha de producto → carrito → WhatsApp', () => {
  test('Golden Eagle: Premium S/ 1,500, color cambia la imagen, 2 unidades, drawer, /carrito y wa.me', async ({ page }) => {
    await page.goto(GE);
    await expect(page.locator('h1')).toHaveText('Golden Eagle');

    const cfg = page.locator('[data-configurator]');
    await hydrated(cfg);

    // Versión por defecto Estándar (S/ 1,200) → Premium (S/ 1,500)
    const variants = cfg.locator('input[name="variant"]');
    await expect(variants).toHaveCount(2);
    expect(parsePrice(await cfg.locator('[data-price]').innerText())).toBe(1200);
    await expect(cfg.locator('[data-tier="estandar"] input')).toBeChecked();
    await cfg.locator('input[name="variant"][value="premium"]').check();
    await expect.poll(async () => parsePrice(await cfg.locator('[data-price]').innerText())).toBe(1500);
    await expect(cfg.locator('.cfg__price')).toContainText('Versión Premium');
    await expect(cfg.locator('.hint').first()).toContainText('500 W');

    // Color: la imagen principal (SSR) cambia y la miniatura se marca
    const mainImg = page.locator('[data-product-image] img');
    const srcBefore = await mainImg.getAttribute('src');
    await expect(page.locator('[data-color-thumb="negro"]')).toHaveAttribute('aria-pressed', 'true');
    await cfg.locator('input[name="color"][value="blanco"]').check({ force: true });
    await expect(cfg.locator('legend', { hasText: 'Color' })).toContainText('Blanco');
    await expect.poll(() => mainImg.getAttribute('src')).not.toBe(srcBefore);
    await expect(page.locator('[data-color-thumb="blanco"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-color-thumb="negro"]')).toHaveAttribute('aria-pressed', 'false');

    // Las miniaturas también seleccionan el color
    await page.locator('[data-color-thumb="rojo"]').click();
    await expect(cfg.locator('input[name="color"][value="rojo"]')).toBeChecked();
    await cfg.locator('input[name="color"][value="blanco"]').check({ force: true });

    // Cantidad 2 con el stepper → botón muestra el total
    const qty = cfg.getByRole('spinbutton', { name: 'Unidades' });
    await cfg.getByRole('button', { name: 'Más unidades' }).click();
    await expect(qty).toHaveValue('2');
    await expect(cfg.locator('[data-add-to-cart]')).toContainText('S/ 3,000');
    await cfg.locator('[data-add-to-cart]').click();

    // Drawer con 1 línea: variante + color + cantidad
    const drawer = page.locator('[data-cart-drawer]');
    await expect(drawer).toBeVisible();
    const items = drawer.locator('[data-cart-item]');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Golden Eagle');
    await expect(items.first()).toContainText('Premium');
    await expect(items.first()).toContainText('Blanco');
    await expect(items.first().getByRole('spinbutton', { name: 'Cantidad' })).toHaveValue('2');
    await expect(page.locator('[data-cart-count]')).toHaveText('2');
    expect(parsePrice(await drawer.locator('[data-cart-total]').innerText())).toBe(3000);
    await expect(drawer.locator('[data-cart-request]')).toHaveAttribute('href', new RegExp(`^${WA_PREFIX.replace(/[.?]/g, '\\$&')}`));

    // Escape cierra el drawer
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();

    // Página /carrito
    await page.goto('/carrito');
    const cartPage = page.locator('[data-cart-page]');
    await expect(cartPage.locator('[data-cart-item]')).toHaveCount(1);
    await expect(cartPage.locator('[data-cart-item]').first()).toContainText('Golden Eagle');
    await expect(cartPage.locator('[data-cart-item]').first()).toContainText('Premium · Blanco');
    expect(parsePrice(await cartPage.locator('[data-cart-total]').innerText())).toBe(3000);

    const notes = 'Entrega en Callao';
    await cartPage.getByRole('textbox').fill(notes);
    await page.getByText('Ver mensaje que se enviará').click();
    const preview = page.locator('[data-message-preview]');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('Golden Eagle');
    await expect(preview).toContainText('Variante: Premium');
    await expect(preview).toContainText('Color: Blanco');
    await expect(preview).toContainText('Cantidad: 2');
    await expect(preview).toContainText('Total estimado: S/');
    await expect(preview).toContainText('S/ 3,000');
    await expect(preview).not.toContainText('€');
    await expect(preview).toContainText(notes);

    // Enlace WhatsApp
    const link = cartPage.locator('[data-cart-request]');
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(href!.startsWith(WA_PREFIX)).toBe(true);
    expect(href).not.toContain(' ');
    const decoded = decodeWaHref(href!);
    expect(decoded).toContain('Estoy interesado en realizar el siguiente pedido');
    expect(decoded).toContain('🏍️ Golden Eagle');
    expect(decoded).toContain('Variante: Premium');
    expect(decoded).toContain('Cantidad: 2');
    expect(decoded).toMatch(/Total estimado: S\/[  ]3,000/);
    expect(decoded).toContain(notes);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);

    // Eliminar → estado vacío
    await cartPage.locator('[data-cart-remove]').first().click();
    await expect(cartPage.locator('[data-cart-item]')).toHaveCount(0);
    await expect(page.getByText('Tu solicitud está vacía')).toBeVisible();
    await expect(page.locator('[data-cart-count]')).toHaveCount(0);
    await expect(page.locator('[data-cart-request]')).toHaveCount(0);
  });

  test('"+" en el drawer sube la cantidad y el total; reducir a 0 elimina la línea', async ({ page }) => {
    await page.goto(GE);
    await hydrated(page.locator('[data-configurator]'));
    await page.locator('[data-add-to-cart]').click();
    const drawer = page.locator('[data-cart-drawer]');
    await expect(drawer).toBeVisible();
    const item = drawer.locator('[data-cart-item]').first();
    expect(parsePrice(await drawer.locator('[data-cart-total]').innerText())).toBe(1200);
    await item.getByRole('button', { name: 'Aumentar cantidad' }).click();
    await expect(item.getByRole('spinbutton', { name: 'Cantidad' })).toHaveValue('2');
    await expect.poll(async () => parsePrice(await drawer.locator('[data-cart-total]').innerText())).toBe(2400);
    await item.getByRole('button', { name: 'Reducir cantidad' }).click();
    await item.getByRole('button', { name: 'Reducir cantidad' }).click();
    await expect(drawer.locator('[data-cart-item]')).toHaveCount(0);
    await expect(drawer).toContainText('Tu carrito está vacío');
  });

  test('añadir la misma configuración dos veces agrupa en una línea', async ({ page }) => {
    await page.goto(GE);
    await hydrated(page.locator('[data-configurator]'));
    await page.locator('[data-add-to-cart]').click();
    await expect(page.locator('[data-cart-drawer]')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('[data-add-to-cart]').click();
    const drawer = page.locator('[data-cart-drawer]');
    await expect(drawer.locator('[data-cart-item]')).toHaveCount(1);
    await expect(drawer.locator('[data-cart-item]').first().getByRole('spinbutton', { name: 'Cantidad' })).toHaveValue('2');
  });

  test('el quick add del catálogo añade la versión por defecto (Royal Tiger → Premium S/ 1,400)', async ({ page }) => {
    await page.goto('/productos');
    const card = page.locator('[data-product-card="royal-tiger"]');
    await hydrated(card.locator('[data-quick-add]'));
    await card.locator('[data-quick-add]').click();
    const drawer = page.locator('[data-cart-drawer]');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('[data-cart-item]')).toHaveCount(1);
    await expect(drawer.locator('[data-cart-item]').first()).toContainText('Royal Tiger');
    await expect(drawer.locator('[data-cart-item]').first()).toContainText('Premium');
    expect(parsePrice(await drawer.locator('[data-cart-total]').innerText())).toBe(1400);
  });

  test('el repuesto extra del configurador se añade como segunda línea', async ({ page }) => {
    await page.goto(GE);
    const cfg = page.locator('[data-configurator]');
    await hydrated(cfg);
    const extras = cfg.locator('.cfg__extra input');
    expect(await extras.count()).toBeGreaterThanOrEqual(1);
    const extraName = (await cfg.locator('.cfg__extra').first().locator('span').first().innerText()).trim();
    await extras.first().check();
    await cfg.locator('[data-add-to-cart]').click();
    const drawer = page.locator('[data-cart-drawer]');
    await expect(drawer.locator('[data-cart-item]')).toHaveCount(2);
    await expect(drawer).toContainText(extraName.replace(/\s*\(par\)$/, ''));
  });
});
