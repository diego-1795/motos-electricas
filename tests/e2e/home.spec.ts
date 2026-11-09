import { test, expect, type Page } from '@playwright/test';
import { WA_PREFIX } from './helpers';

const dot = (page: Page, i: number) => page.locator(`[data-dot="${i}"]`);
const scrollLeft = (page: Page) => page.locator('[data-track]').evaluate((el) => Math.round(el.scrollLeft));
const slideOffset = (page: Page, i: number) => page.locator('[data-slide]').nth(i).evaluate((el) => (el as HTMLElement).offsetLeft);

test.describe('Portada: hero slider', () => {
  test('el carrusel se puede pausar y reanudar con un botón (WCAG 2.2.2); en pausa no avanza solo', async ({ page }) => {
    await page.goto('/');
    const pause = page.locator('[data-pause]');
    await expect(pause).toBeVisible();
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await expect(pause).toHaveAccessibleName('Pausar el carrusel');
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await expect(pause).toHaveAccessibleName('Reanudar el carrusel');
    await expect(page.locator('[data-slider]')).toHaveClass(/is-user-paused/);
    // Sin interacción con el carrusel (ratón fuera) la diapositiva activa no cambia
    await page.mouse.move(5, 5);
    await page.waitForTimeout(6500);
    await expect(dot(page, 0)).toHaveAttribute('aria-selected', 'true');
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    await expect(pause).toHaveAccessibleName('Pausar el carrusel');
  });

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
    // El intervalo (reloj simulado) dispara go(1); el scroll suave termina en tiempo real.
    // Se comprueba la posición del carril y no el punto: ver BUG de paint() más abajo.
    const target = await slideOffset(page, 1);
    await expect.poll(() => scrollLeft(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(target - 1);

    // Con el foco dentro del carrusel no avanza
    await page.locator('[data-next]').focus();
    await page.clock.runFor(13_000);
    expect(Math.abs((await scrollLeft(page)) - target)).toBeLessThanOrEqual(1);
  });

  /** Queja del cliente (2026-11-04): "la imagen principal sale muy oscura". La moto no debe llevar velo encima. */
  test('la moto del hero se ve: en móvil la foto va encima del texto; en escritorio el texto queda en la mitad izquierda', async ({ page, isMobile }) => {
    await page.goto('/');
    const slide = page.locator('[data-slide]').first();
    const media = (await slide.locator('.hs__media').boundingBox())!;
    const title = (await slide.locator('h1').boundingBox())!;
    const vw = page.viewportSize()!.width;
    if (isMobile) {
      // Apilado: la foto termina antes de que empiece el título y ocupa todo el ancho
      expect(media.y + media.height).toBeLessThanOrEqual(title.y + 1);
      expect(Math.round(media.width)).toBe(vw);
      // El velo es solo un fundido inferior (no un degradado sobre toda la foto)
      const bg = await slide.locator('.hs__media').evaluate((el) => getComputedStyle(el, '::after').backgroundImage);
      expect(bg).toMatch(/to top|0deg/);
      expect(bg).not.toMatch(/radial-gradient/);
    } else {
      // El bloque de texto no invade el centro, donde está el vehículo
      expect(title.x + title.width).toBeLessThanOrEqual(vw * 0.55);
      expect(media.height).toBeGreaterThan(400);
      const bg = await slide.locator('.hs__media').evaluate((el) => getComputedStyle(el, '::after').backgroundImage);
      // Franja izquierda que termina en transparente (rgba(17, 17, 17, 0)) y sin el radial azul antiguo
      expect(bg).toMatch(/rgba\(17, 17, 17, 0\)/);
      expect(bg).not.toMatch(/radial-gradient/);
    }
  });

  test('el texto de "Productos recientes" es el del cliente y los antetítulos (eyebrows) son legibles (≥ 15 px, por debajo del H2)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.recent .sh__text')).toHaveText(
      'Bicimotos de 25 km/h y trimotos convertibles pasajeros/carga. Disponibles en versiones estándar y premium, garantía de 6 meses en batería y motor.',
    );
    for (const text of ['Descubre tu instinto', 'Productos recientes', 'Raiders satisfechos', 'Comunidad RAIDEN']) {
      const eyebrow = page.locator('.eyebrow', { hasText: text }).first();
      const fs = await eyebrow.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(fs, text).toBeGreaterThanOrEqual(15);
      expect(fs, text).toBeLessThanOrEqual(17);
      await expect(eyebrow).toHaveCSS('text-transform', 'uppercase');
    }
    const h2 = await page.locator('.recent h2').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(h2).toBeGreaterThanOrEqual(26);
    // Las etiquetas dentro de tarjetas (categoría del blog) siguen compactas
    const small = page.locator('.blog__card .eyebrow--sm').first();
    if (await small.count()) expect(await small.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(12.5);
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
