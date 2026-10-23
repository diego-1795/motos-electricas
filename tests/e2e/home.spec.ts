import { test, expect, type Page } from '@playwright/test';
import { WA_PREFIX } from './helpers';

const dot = (page: Page, i: number) => page.locator(`[data-dot="${i}"]`);
const scrollLeft = (page: Page) => page.locator('[data-track]').evaluate((el) => Math.round(el.scrollLeft));
const slideOffset = (page: Page, i: number) => page.locator('[data-slide]').nth(i).evaluate((el) => (el as HTMLElement).offsetLeft);

/**
 * Con `page.clock.install()` el rAF que pinta el punto activo está bajo el reloj simulado, mientras que
 * el evento `scroll` lo despacha el navegador en tiempo real: hay que avanzar el reloj mientras se espera.
 */
async function expectDotWithClock(page: Page, i: number) {
  await expect
    .poll(
      async () => {
        await page.clock.runFor(50);
        return dot(page, i).getAttribute('aria-selected');
      },
      { timeout: 10_000 },
    )
    .toBe('true');
}

test.describe('Portada: hero slider', () => {
  test('4 diapositivas, un solo h1, flechas y puntos cambian la activa', async ({ page }) => {
    await page.goto('/');
    const slides = page.locator('[data-slide]');
    await expect(slides).toHaveCount(4);
    await expect(page.locator('[data-dot]')).toHaveCount(4);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(slides.first().locator('h1')).toHaveText(/Golden Eagle|Royal Tiger|Vortex Kobra|Titan Rhino/);
    await expect(slides.nth(1).locator('h2')).toHaveCount(1);
    await expect(dot(page, 0)).toHaveAttribute('aria-selected', 'true');
    await expect(dot(page, 1)).toHaveAttribute('aria-selected', 'false');

    await page.locator('[data-next]').click();
    await expect(dot(page, 1)).toHaveAttribute('aria-selected', 'true');
    await expect(dot(page, 0)).toHaveAttribute('aria-selected', 'false');
    await expect.poll(async () => (await scrollLeft(page)) - (await slideOffset(page, 1))).toBeLessThanOrEqual(1);

    await page.locator('[data-prev]').click();
    await expect(dot(page, 0)).toHaveAttribute('aria-selected', 'true');

    // Anterior desde la primera → última (circular)
    await page.locator('[data-prev]').click();
    await expect(dot(page, 3)).toHaveAttribute('aria-selected', 'true');

    await dot(page, 2).click();
    await expect(dot(page, 2)).toHaveAttribute('aria-selected', 'true');
    await expect(dot(page, 3)).toHaveAttribute('aria-selected', 'false');

    // Cada diapositiva lleva CTA a la ficha y a WhatsApp
    for (const s of await slides.all()) {
      await expect(s.getByRole('link', { name: 'Descubrir modelo' })).toHaveAttribute('href', /^\/(bicimotos|trimotos)\/[a-z-]+$/);
      expect((await s.locator('[data-wa-source="header"]').getAttribute('href'))!.startsWith(WA_PREFIX)).toBe(true);
    }
  });

  test('con prefers-reduced-motion el cambio es instantáneo y no hay autoplay', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install();
    await page.goto('/');
    await expect(dot(page, 0)).toHaveAttribute('aria-selected', 'true');
    // Más de un ciclo de autoplay (6 s) sin que cambie nada
    await page.clock.runFor(13_000);
    await expect(dot(page, 0)).toHaveAttribute('aria-selected', 'true');
    expect(await scrollLeft(page)).toBe(0);

    // El desplazamiento es inmediato (behavior: auto): justo tras el clic ya está en destino
    await page.locator('[data-next]').click();
    expect(Math.abs((await scrollLeft(page)) - (await slideOffset(page, 1)))).toBeLessThanOrEqual(1);
  });

  /**
   * BUG src/components/home/HeroSlider.astro:75-99 — `go()` asigna `index` ANTES de desplazar y `paint()` solo
   * se llama desde el handler de `scroll` cuando `i !== index`. Con scroll instantáneo (prefers-reduced-motion,
   * o navegadores sin smooth scroll) llega un único evento con i === index y los puntos NO se actualizan:
   * la diapositiva cambia pero el punto activo se queda en la anterior. Con scroll suave funciona por
   * casualidad (los eventos intermedios con i=0 fuerzan un repintado).
   * Fix: llamar a `paint()` dentro de `go()` justo después de asignar `index`.
   */
  test('con prefers-reduced-motion el punto activo también se actualiza al pulsar siguiente', async ({ page }) => {
    test.fixme(true, 'HeroSlider.astro go(): no llama a paint(); con scroll instantáneo los puntos no cambian');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('[data-next]').click();
    await expect(dot(page, 1)).toHaveAttribute('aria-selected', 'true');
    await expect(dot(page, 0)).toHaveAttribute('aria-selected', 'false');
  });

  test('sin reduced motion el autoplay avanza tras 6 s y se pausa con el foco', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.clock.install();
    await page.goto('/');
    await expect(dot(page, 0)).toHaveAttribute('aria-selected', 'true');
    await page.clock.runFor(6_100);
    await expectDotWithClock(page, 1);

    // Con el foco dentro del carrusel no avanza
    await page.locator('[data-next]').focus();
    await page.clock.runFor(13_000);
    await page.clock.runFor(100);
    await expect(dot(page, 1)).toHaveAttribute('aria-selected', 'true');
  });

  test('las secciones de portada enlazan a categorías, productos y repuestos', async ({ page }) => {
    await page.goto('/');
    for (const href of ['/bicimotos', '/trimotos', '/repuestos']) {
      await expect(page.locator(`.cats__tile[href="${href}"]`)).toHaveCount(1);
    }
    expect(await page.locator('main [data-product-card]').count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator('main a[href="/productos"]').first()).toBeVisible();
    await expect(page.locator('main a[href="/repuestos"]').first()).toBeVisible();
  });
});
