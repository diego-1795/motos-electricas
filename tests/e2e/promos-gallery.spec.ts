import { test, expect } from '@playwright/test';
import { hydrated, parsePrice } from './helpers';

const EG = '/promociones/golden-eagle-eg-motors';

/** ADR-017: promociones (edición EG Motors) separadas del catálogo RAIDEN; logos de pago. Galería de clientes en cuadrícula (2026-11-04). */
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
    // Entrada propia de nivel superior en la cabecera (no dentro del desplegable Productos)
    await expect(page.locator('.header__link[href="/promociones"]')).toHaveCount(1);
    await expect(page.locator('[data-dropdown-panel] a[href="/promociones"]')).toHaveCount(0);
  });
});

test.describe('Portada: galería de clientes y pie', () => {
  test('galería de 6 fotos pequeñas en cuadrícula, todas visibles a la vez: 1 fila en escritorio, 3+3 en móvil', async ({ page, isMobile }) => {
    await page.goto('/');
    const gallery = page.locator('[data-gallery]');
    await gallery.scrollIntoViewIfNeeded();
    const items = gallery.locator('[data-gallery-item]');
    await expect(items).toHaveCount(6);
    // Cuadrícula estática: sin flechas ni contador, sin pista con scroll
    await expect(gallery.locator('button')).toHaveCount(0);
    await expect(gallery.locator('[data-current]')).toHaveCount(0);
    // Las 6 imágenes tienen nombre accesible real (no decorativas)
    for (const img of await items.locator('img').all()) {
      await expect(img).toBeVisible();
      expect((await img.getAttribute('alt')) ?? '').toMatch(/cliente/i);
    }
    const boxes = await items.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) })));
    const rows = new Set(boxes.map((b) => b.top)).size;
    expect(rows).toBe(isMobile ? 2 : 1);
    for (const b of boxes) {
      // Fotos verticales (3:4) y pequeñas (≤ 320 px de ancho)
      expect(b.height).toBeGreaterThan(b.width);
      expect(b.width).toBeLessThanOrEqual(320);
    }
    // Toda la cuadrícula cabe en una vista
    const g = (await gallery.boundingBox())!;
    expect(g.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  });

  test('el pie muestra los logos de Visa, Mastercard y American Express', async ({ page }) => {
    await page.goto('/');
    const logos = page.locator('footer .paylogos [role="img"]');
    await expect(logos).toHaveCount(3);
    expect(await logos.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Visa', 'Mastercard', 'American Express']);
  });

  test('el logo del pie va en blanco sobre el fondo oscuro, sin placa; el de la cabecera sigue azul', async ({ page }) => {
    await page.goto('/');
    const footerLogo = page.locator('footer .logo img');
    await expect(footerLogo).toHaveCount(1);
    await expect(page.locator('footer .footer__logo-tile')).toHaveCount(0);
    await expect(footerLogo).toHaveAttribute('alt', 'Raiden');
    expect(await footerLogo.evaluate((el) => getComputedStyle(el).filter)).toMatch(/invert\(1\)/);
    // El logo invertido va directamente sobre el pie: ningún ancestro entre el pie y la imagen pinta un fondo blanco
    const whiteAncestors = await footerLogo.evaluate((el) => {
      let n = el.parentElement;
      let count = 0;
      while (n && n.tagName !== 'FOOTER') {
        const bg = getComputedStyle(n).backgroundColor;
        if (bg === 'rgb(255, 255, 255)') count++;
        n = n.parentElement;
      }
      return count;
    });
    expect(whiteAncestors).toBe(0);
    const headerLogo = page.locator('header .logo img');
    expect(await headerLogo.evaluate((el) => getComputedStyle(el).filter)).toBe('none');
  });
});
