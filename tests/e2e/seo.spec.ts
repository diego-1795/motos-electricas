import { test, expect, type Page } from '@playwright/test';
import { GE, MOTOR, TITAN } from './helpers';

/**
 * El origen del canonical depende de PUBLIC_SITE_URL en el momento del build
 * (dist/ puede reconstruirse fuera de esta suite), así que se valida la forma:
 * https + host del sitio + ruta exacta sin barra final.
 */
const PAGES = ['/', '/productos', '/bicimotos', '/trimotos', GE, TITAN, '/repuestos', MOTOR, '/contacto', '/nosotros', '/servicio-tecnico', '/comparar', '/encuentra-tu-moto', '/carrito', '/blog', '/faq'];
const ORIGIN = /^https:\/\/raiden\.[a-z.]+$/;

async function jsonLd(page: Page) {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((b) => {
    const parsed = JSON.parse(b);
    return Array.isArray(parsed) ? parsed : [parsed];
  }) as Record<string, any>[];
}

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
      await expect(page).toHaveTitle(/Raiden/i);
      await expect(page.locator('html')).toHaveAttribute('lang', 'es');
      await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'es_PE');
      // Las páginas utilitarias (carrito, comparador) no llevan datos estructurados
      if (!['/carrito', '/comparar'].includes(path)) {
        expect(await page.locator('script[type="application/ld+json"]').count()).toBeGreaterThanOrEqual(1);
      }
    });
  }

  /**
   * BUG src/lib/seo/meta.ts:14 — `buildTitle` comprueba la marca con `includes(site.name)` (sensible a
   * mayúsculas). Los títulos del cliente escriben "RAIDEN" y el builder añade " · Raiden", así que la marca
   * aparece dos veces: "Servicio técnico para bicimotos eléctricas RAIDEN · Raiden".
   * Fix: `title.toLowerCase().includes(site.name.toLowerCase()) ? title : ...`.
   */
  for (const path of [GE, TITAN, '/servicio-tecnico']) {
    test(`${path}: la marca aparece una sola vez en el <title>`, async ({ page }) => {
      test.fixme(true, 'meta.ts buildTitle: comparación de marca sensible a mayúsculas → "RAIDEN · Raiden"');
      await page.goto(path);
      expect((await page.title()).match(/raiden/gi)?.length).toBe(1);
    });
  }

  test('la ficha de bicimoto incluye JSON-LD Product (AggregateOffer en PEN) y BreadcrumbList', async ({ page }) => {
    await page.goto(GE);
    const schemas = await jsonLd(page);
    const product = schemas.find((s) => s['@type'] === 'Product')!;
    expect(product).toBeTruthy();
    expect(product.name).toBe('Golden Eagle');
    expect(product.brand).toEqual({ '@type': 'Brand', name: 'Raiden' });
    expect(product.offers['@type']).toBe('AggregateOffer');
    expect(product.offers.priceCurrency).toBe('PEN');
    expect(product.offers.lowPrice).toBe('1200.00');
    expect(product.offers.highPrice).toBe('1500.00');
    expect(product.offers.offerCount).toBe(2);
    expect(product.offers.availability).toBe('https://schema.org/InStock');
    expect(product.url).toMatch(new RegExp(`${GE}$`));
    expect(Array.isArray(product.image) && product.image.length).toBeGreaterThanOrEqual(1);
    const crumbs = schemas.find((s) => s['@type'] === 'BreadcrumbList')!;
    expect(crumbs.itemListElement.map((i: { name: string }) => i.name)).toEqual(['Inicio', 'Bicimotos', 'Golden Eagle']);
    expect(schemas.some((s) => s['@type'] === 'FAQPage')).toBe(true);
  });

  test('la trimoto Titan Rhino tiene un único precio S/ 2,700', async ({ page }) => {
    await page.goto(TITAN);
    const product = (await jsonLd(page)).find((s) => s['@type'] === 'Product')!;
    expect(product.name).toBe('Titan Rhino');
    expect(product.offers.priceCurrency).toBe('PEN');
    expect(product.offers.lowPrice).toBe('2700.00');
    expect(product.offers.highPrice).toBe('2700.00');
    expect(product.offers.offerCount).toBe(1);
  });

  test('la ficha de repuesto incluye JSON-LD Product con Offer en PEN', async ({ page }) => {
    await page.goto(MOTOR);
    const schemas = await jsonLd(page);
    const product = schemas.find((s) => s['@type'] === 'Product')!;
    expect(product).toBeTruthy();
    expect(product.name).toBe('Motor 350 W');
    expect(product.category).toBe('Repuestos');
    expect(product.offers['@type']).toBe('Offer');
    expect(product.offers.priceCurrency).toBe('PEN');
    expect(product.offers.price).toBe('350.00');
    expect(product.offers.availability).toMatch(/^https:\/\/schema\.org\/(InStock|BackOrder|PreOrder)$/);
    expect(product.url).toMatch(new RegExp(`${MOTOR}$`));
    const crumbs = schemas.find((s) => s['@type'] === 'BreadcrumbList')!;
    expect(crumbs.itemListElement.map((i: { name: string }) => i.name)).toEqual(['Inicio', 'Repuestos', 'Motor 350 W']);
  });

  test('los listados incluyen ItemList con las rutas reales', async ({ page }) => {
    await page.goto('/productos');
    const list = (await jsonLd(page)).find((s) => s['@type'] === 'ItemList')!;
    expect(list.itemListElement).toHaveLength(4);
    for (const it of list.itemListElement) expect(it.url).toMatch(/\/(bicimotos|trimotos)\/[a-z-]+$/);
    await page.goto('/repuestos');
    const parts = (await jsonLd(page)).find((s) => s['@type'] === 'ItemList')!;
    expect(parts.itemListElement.length).toBeGreaterThanOrEqual(20);
    for (const it of parts.itemListElement) expect(it.url).toMatch(/\/repuestos\/[a-z0-9-]+$/);
  });

  test('/carrito es noindex; las fichas indexables no', async ({ page }) => {
    await page.goto('/carrito');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await page.goto(GE);
    expect(await page.locator('meta[name="robots"][content*="noindex"]').count()).toBe(0);
  });

  test('sitemap incluye las rutas nuevas y excluye /carrito, /comparar, /dev y las rutas antiguas', async ({ request }) => {
    const res = await request.get('/sitemap-index.xml');
    expect(res.ok()).toBe(true);
    const body = await res.text();
    expect(body).toContain('<sitemapindex');
    expect(body).toMatch(/sitemap-\d+\.xml/);
    const sm = await request.get('/sitemap-0.xml');
    expect(sm.ok()).toBe(true);
    const smBody = await sm.text();
    for (const p of [GE, TITAN, MOTOR, '/productos', '/bicimotos', '/trimotos', '/repuestos', '/contacto', '/nosotros', '/servicio-tecnico']) {
      expect(smBody, p).toMatch(new RegExp(`${p.replace(/\//g, '\\/')}<\\/loc>`));
    }
    expect(smBody).not.toMatch(/\/carrito</);
    expect(smBody).not.toMatch(/\/comparar</);
    expect(smBody).not.toMatch(/\/dev(\/|<)/);
    expect(smBody).not.toContain('/motos-electricas');
    expect(smBody).not.toContain('/accesorios');
    const robots = await request.get('/robots.txt');
    expect(robots.ok()).toBe(true);
    expect(await robots.text()).toMatch(/Sitemap: https?:\/\/.+sitemap-index\.xml/);
  });

  test('/dev/ui no existe en el build de producción', async ({ request }) => {
    expect((await request.get('/dev/ui')).status()).toBe(404);
  });
});
