import { test, expect } from '@playwright/test';

/**
 * El origen del canonical depende de PUBLIC_SITE_URL en el momento del build
 * (dist/ puede reconstruirse fuera de esta suite), así que se valida la forma:
 * https + host del sitio + ruta exacta sin barra final.
 */
const PAGES = ['/', '/motos-electricas', '/motos-electricas/odin-1-0', '/comparar', '/encuentra-tu-moto', '/carrito'];
const ORIGIN = /^https:\/\/voltia\.[a-z.]+$/;

test.describe('SEO', () => {
  // Las metaetiquetas no dependen del viewport: basta con un proyecto.
  test.skip(({ isMobile }) => !!isMobile, 'solo desktop');

  for (const path of PAGES) {
    test(`${path}: un H1, canonical, description, title con marca`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical, 'canonical').toBeTruthy();
      const u = new URL(canonical!);
      expect(u.origin).toMatch(ORIGIN);
      expect(canonical).toBe(path === '/' ? u.origin : `${u.origin}${path}`);
      expect(canonical!.endsWith('/')).toBe(false);
      const desc = await page.locator('meta[name="description"]').getAttribute('content');
      expect(desc, 'meta description').toBeTruthy();
      expect(desc!.length).toBeGreaterThanOrEqual(50);
      expect(desc!.length).toBeLessThanOrEqual(160);
      await expect(page).toHaveTitle(/Voltia/);
      expect((await page.title()).match(/Voltia/g)?.length).toBe(1);
      await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    });
  }

  test('la ficha de producto incluye JSON-LD Product válido', async ({ page }) => {
    await page.goto('/motos-electricas/odin-1-0');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const schemas = blocks.flatMap((b) => {
      const parsed = JSON.parse(b);
      return Array.isArray(parsed) ? parsed : [parsed];
    });
    const product = schemas.find((s) => s['@type'] === 'Product');
    expect(product).toBeTruthy();
    expect(product.name).toBe('ODIN 1.0');
    expect(product.offers.priceCurrency).toBe('EUR');
    expect(product.offers.lowPrice).toBe('4999.00');
    expect(product.offers.availability).toBe('https://schema.org/InStock');
    expect(schemas.some((s) => s['@type'] === 'BreadcrumbList')).toBe(true);
  });

  test('/carrito es noindex', async ({ page }) => {
    await page.goto('/carrito');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('sitemap-index.xml existe y enlaza un sitemap', async ({ request }) => {
    const res = await request.get('/sitemap-index.xml');
    expect(res.ok()).toBe(true);
    const body = await res.text();
    expect(body).toContain('<sitemapindex');
    expect(body).toMatch(/sitemap-\d+\.xml/);
    const sm = await request.get('/sitemap-0.xml');
    expect(sm.ok()).toBe(true);
    const smBody = await sm.text();
    expect(smBody).toContain('/motos-electricas/odin-1-0');
    expect(smBody).not.toContain('/carrito');
    expect(smBody).not.toContain('/comparar');
  });
});
