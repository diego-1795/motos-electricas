import { test, expect } from '@playwright/test';
import { hydrated, parsePrice } from './helpers';

const EG = '/promociones/golden-eagle-eg-motors';

/** ADR-017: promociones (edición EG Motors) separadas del catálogo RAIDEN; galería de clientes 1 a 1; logos de pago. */
test.describe('Promociones (edición EG Motors)', () => {
  test('/promociones lista solo la Golden Eagle EG Motors y enlaza a su ficha', async ({ page }) => {
    await page.goto('/promociones');
    await expect(page.locator('h1')).toContainText('Promociones');
    const cards = page.locator('[data-product-card]');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAttribute('data-product-card', 'golden-eagle-eg-motors');
    expect(parsePrice(await cards.first().locator('.pc__price strong').innerText())).toBe(1100);
    await cards.first().locator('.pc__name a').click();
    await expect(page).toHaveURL(new RegExp(`${EG}$`));
  });

  test('la ficha EG Motors: marca EG Motors, Estándar S/ 1,100 por defecto y Premium S/ 1,400 (la Premium siempre es la cara)', async ({ page }) => {
    await page.goto(EG);
    await expect(page.locator('h1')).toHaveText(/Golden Eagle EG Motors/i);
    await expect(page.locator('.pdp__meta')).toContainText('EG Motors');
    const cfg = page.locator('[data-configurator]');
    await hydrated(cfg);
    await expect(cfg.locator('input[name="variant"][value="estandar"]')).toBeChecked();
    expect(parsePrice(await cfg.locator('[data-price]').innerText())).toBe(1100);
    await cfg.locator('input[name="variant"][value="premium"]').check();
    await expect.poll(async () => parsePrice(await cfg.locator('[data-price]').innerText())).toBe(1400);
  });

  test('el catálogo RAIDEN (/productos, comparador, portada) no incluye la promoción; el menú sí enlaza a /promociones', async ({ page }) => {
    await page.goto('/productos');
    await expect(page.locator('[data-product-card]')).toHaveCount(4);
    await expect(page.locator('[data-product-card="golden-eagle-eg-motors"]')).toHaveCount(0);
    await page.goto('/comparar');
    await expect(page.locator('[data-product-card="golden-eagle-eg-motors"]')).toHaveCount(0);
    await page.goto('/');
    await expect(page.locator('.recent [data-product-card="golden-eagle-eg-motors"]')).toHaveCount(0);
    await expect(page.locator('.cats__tile[href="/promociones"]')).toHaveCount(1);
  });
});

test.describe('Portada: galería de clientes y logos de pago', () => {
  test('galería de 6 fotos, una a la vez, con flechas y contador', async ({ page }) => {
    await page.goto('/');
    const gallery = page.locator('[data-gallery]');
    await gallery.scrollIntoViewIfNeeded();
    await expect(gallery.locator('[data-gallery-slide]')).toHaveCount(6);
    await expect(gallery.locator('[data-current]')).toHaveText('1');
    await gallery.locator('[data-gallery-next]').click();
    await expect(gallery.locator('[data-current]')).toHaveText('2');
    await expect(gallery.locator('[data-gallery-slide]').nth(1)).toHaveAttribute('aria-current', 'true');
    await gallery.locator('[data-gallery-prev]').click();
    await gallery.locator('[data-gallery-prev]').click();
    // Da la vuelta: de la 1 a la 6
    await expect(gallery.locator('[data-current]')).toHaveText('6');
  });

  test('el pie muestra los logos de Visa, Mastercard y American Express', async ({ page }) => {
    await page.goto('/');
    const logos = page.locator('footer .paylogos [role="img"]');
    await expect(logos).toHaveCount(3);
    expect(await logos.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Visa', 'Mastercard', 'American Express']);
  });
});
