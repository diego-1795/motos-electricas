import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Elementos ocultos desde el panel de administración (ADR-018): un producto o repuesto con
 * `hidden: true` en src/content no existe para el sitio público. El test lee el contenido real
 * del repo: para cada oculto exige 404 y ausencia en el sitemap; para los visibles, 200.
 * Además, /admin y /api/admin quedan fuera del sitemap y de robots.txt.
 */
const load = (dir: string) =>
  readdirSync(join('src/content', dir))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join('src/content', dir, f), 'utf8')) as { slug: string; category?: string; hidden?: boolean });

const products = load('products');
const parts = load('repuestos');
const pathOf = (p: { slug: string; category?: string }) => (p.category ? `/${p.category}/${p.slug}` : `/repuestos/${p.slug}`);

test.describe('ocultos (hidden) fuera del sitio público', () => {
  test('cada JSON oculto responde 404 y no está en el sitemap; los visibles responden 200', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap-0.xml')).text();
    for (const item of [...products, ...parts]) {
      const path = pathOf(item);
      const res = await request.get(path);
      if (item.hidden === true) {
        expect(res.status(), `${path} oculto`).toBe(404);
        expect(sitemap, `${path} en sitemap`).not.toContain(`${path}<`);
      } else {
        expect(res.status(), `${path} visible`).toBe(200);
        expect(sitemap, `${path} fuera del sitemap`).toContain(`${path}<`);
      }
    }
  });

  test('el panel /admin no aparece en el sitemap ni en robots.txt (Disallow)', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap-0.xml')).text();
    expect(sitemap).not.toContain('/admin');
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /admin');
    expect(robots).toContain('Disallow: /api/');
  });
});
