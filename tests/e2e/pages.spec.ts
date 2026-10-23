import { test, expect } from '@playwright/test';
import { WA_PREFIX } from './helpers';

test.describe('Páginas institucionales', () => {
  test('/nosotros: H1 y textos del cliente (EG Motors, distribuidor oficial, Callao)', async ({ page }) => {
    await page.goto('/nosotros');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('Descubre tu instinto');
    const main = page.locator('main');
    await expect(main).toContainText('EG Motors SAC');
    await expect(main).toContainText(/empresa peruana/i);
    await expect(main).toContainText('RAIDERS');
    await expect(main).toContainText('Callao');
    await expect(main).toContainText(/RUC \d{11}/);
    await expect(page).toHaveTitle(/distribuidor oficial/i);
    expect(await main.locator('h2').count()).toBeGreaterThanOrEqual(2);
    const wa = main.locator('[data-wa-source]').first();
    expect((await wa.getAttribute('href'))!.startsWith(WA_PREFIX)).toBe(true);
    await expect(page.locator('.header__link[href="/nosotros"], .mobile-nav a[href="/nosotros"]').first()).toHaveAttribute('aria-current', 'page');
  });

  test('/servicio-tecnico: H1, texto del cliente y CTA de soporte con mensaje prellenado', async ({ page }) => {
    await page.goto('/servicio-tecnico');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('Soporte técnico especializado');
    const main = page.locator('main');
    await expect(main).toContainText('Callao');
    await expect(main).toContainText(/motor|batería|frenos/i);
    const cta = main.locator('[data-wa-source="support"]');
    expect(await cta.count()).toBeGreaterThanOrEqual(1);
    const href = (await cta.first().getAttribute('href'))!;
    expect(href.startsWith(WA_PREFIX)).toBe(true);
    const decoded = decodeURIComponent(href.split('text=')[1]!);
    expect(decoded).toContain('soporte técnico');
    expect(decoded).toContain('Modelo: ___');
    await expect(cta.first()).toHaveAttribute('target', '_blank');
    await expect(cta.first()).toHaveAttribute('rel', /noopener/);
  });

  test('el botón flotante de WhatsApp es accesible y apunta al número del sitio', async ({ page }) => {
    await page.goto('/contacto');
    const fab = page.locator('[data-wa-source="floating"]');
    await expect(fab).toHaveCount(1);
    await expect(fab).toBeVisible();
    expect((await fab.getAttribute('href'))!.startsWith(WA_PREFIX)).toBe(true);
    await expect(fab).toHaveAccessibleName(/WhatsApp/);
  });

  test('404 para rutas inexistentes con enlace de vuelta', async ({ page }) => {
    const res = await page.goto('/esta-ruta-no-existe');
    expect(res?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main a[href="/"], main a[href="/productos"]').first()).toBeVisible();
  });
});
