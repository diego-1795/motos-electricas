import { test, expect } from '@playwright/test';

test.describe('Cabecera: desplegable Productos (escritorio)', () => {
  test.skip(({ isMobile }) => !!isMobile, 'el desplegable solo existe en ≥ 1024px; en móvil es un acordeón');

  test('abre con teclado, enfoca el primer enlace, Esc cierra y devuelve el foco', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('[data-dropdown-btn]');
    const panel = page.locator('[data-dropdown-panel]');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toHaveAttribute('aria-haspopup', 'true');
    await expect(btn).toHaveAttribute('aria-controls', 'nav-productos');
    await expect(panel).toBeHidden();

    await btn.focus();
    await page.keyboard.press('ArrowDown');
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
    await expect(panel.locator('a').first()).toBeFocused();
    await expect(panel.locator('a').first()).toHaveAttribute('href', '/bicimotos');

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toBeFocused();

    // Enter/Espacio sobre el botón también lo abre; Tab fuera lo cierra
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('enlaza a /bicimotos, /trimotos, /repuestos, /productos y a las herramientas', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('[data-dropdown-btn]');
    await btn.focus();
    await page.keyboard.press('ArrowDown');
    const panel = page.locator('[data-dropdown-panel]');
    await expect(panel).toBeVisible();
    const hrefs = await panel.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(['/bicimotos', '/trimotos', '/repuestos', '/productos', '/comparar', '/encuentra-tu-moto']);
    await panel.locator('a[href="/trimotos"]').click();
    await expect(page).toHaveURL(/\/trimotos$/);
    // En la página de categoría el botón queda marcado como activo
    await expect(page.locator('[data-dropdown-btn]')).toHaveClass(/is-active/);
    await expect(page.locator('[data-dropdown-panel] a[href="/trimotos"]')).toHaveAttribute('aria-current', 'page');
  });

  /**
   * BUG src/components/layout/Header.astro:171-185 — con puntero fino, `mouseenter` sobre [data-dropdown]
   * abre el panel (setOpen(true)) y el `click` inmediato sobre el botón lo vuelve a cerrar (setOpen(!isOpen())):
   * el usuario de ratón que hace clic en "Productos" ve el menú parpadear y cerrarse.
   * Fix sugerido: en el handler de click, si el panel ya está abierto por hover, mantenerlo abierto:
   *   let hoverOpened = false;  // ponerlo a true en mouseenter, a false en mouseleave
   *   btn.addEventListener('click', () => { if (hoverOpened && isOpen()) return; setOpen(!isOpen()); });
   */
  test('clic con ratón sobre "Productos" abre el desplegable (y clic fuera lo cierra)', async ({ page }) => {
    await page.goto('/nosotros');
    await page.locator('[data-dropdown-btn]').click();
    await expect(page.locator('[data-dropdown-panel]')).toBeVisible();
    // Clic fuera: el panel abierto cubre el h1, así que se clica en el pie (siempre visible y libre)
    await page.locator('footer').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('[data-dropdown-panel]')).toBeHidden();
  });

  test('pasar el ratón por "Productos" abre el panel y salir lo cierra', async ({ page }) => {
    await page.goto('/nosotros');
    const panel = page.locator('[data-dropdown-panel]');
    await page.locator('[data-dropdown-btn]').hover();
    await expect(panel).toBeVisible();
    await page.locator('footer').hover(); // lejos del panel (que cubre parte del contenido)
    await expect(panel).toBeHidden();
    // Tab fuera del desplegable (focusout) también lo cierra
    await page.locator('[data-dropdown-btn]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(panel).toBeVisible();
    await page.locator('.header__link[href="/blog"]').focus();
    await expect(panel).toBeHidden();
  });
});

test.describe('Cabecera: menú móvil', () => {
  test.skip(({ isMobile }) => !isMobile, 'solo móvil');

  test('el botón Menú abre la navegación con acordeón Productos y Esc la cierra', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('[data-menu-toggle]');
    const nav = page.locator('#mobile-nav');
    await expect(nav).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(nav).toBeVisible();
    const acc = nav.locator('details.mobile-nav__acc');
    await acc.locator('summary').click();
    await expect(acc).toHaveAttribute('open', '');
    for (const href of ['/bicimotos', '/trimotos', '/repuestos', '/productos']) {
      await expect(acc.locator(`a[href="${href}"]`)).toBeVisible();
    }
    await expect(nav.locator('a[href="/contacto"]')).toBeVisible();
    await expect(nav.locator('a[href="/carrito"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('Buscador (Pagefind)', () => {
  test('abre el modal, busca "motor" y lista resultados; Esc cierra', async ({ page, request }) => {
    const idx = await request.get('/pagefind/pagefind-ui.js');
    test.skip(!idx.ok(), 'índice Pagefind no generado (npm run build ejecuta postbuild)');

    await page.goto('/');
    const dialog = page.locator('dialog[data-search]');
    await expect(dialog).not.toHaveAttribute('open', /.*/);
    await page.locator('[data-search-open]').first().click();
    await expect(dialog).toHaveAttribute('open', '');
    await expect(dialog.getByRole('heading', { name: 'Buscar en el sitio' })).toBeVisible();

    const input = dialog.locator('input.pagefind-ui__search-input');
    await expect(input).toBeVisible();
    await input.fill('motor');
    const results = dialog.locator('.pagefind-ui__result');
    await expect.poll(() => results.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    await expect(dialog.locator('.pagefind-ui__message')).toContainText(/resultados? para motor/);
    const links = await results.locator('.pagefind-ui__result-link').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
    expect(links.length).toBeGreaterThanOrEqual(1);
    // Resultados internos, con la palabra en título o extracto; páginas excluidas del índice no aparecen
    for (const h of links) expect(h).toMatch(/^\//);
    expect(links.some((h) => /\/(carrito|comparar|dev)(\/|$)/.test(h))).toBe(false);
    await expect(results.first()).toContainText(/motor/i);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open', /.*/);
    // Reabrir no recarga el buscador y mantiene el foco en el campo
    await page.locator('[data-search-open]').first().click();
    await expect(dialog).toHaveAttribute('open', '');
    await dialog.locator('[data-search-close]').click();
    await expect(dialog).not.toHaveAttribute('open', /.*/);
  });

  test('Ctrl/Cmd+K abre y cierra el buscador', async ({ page }) => {
    await page.goto('/nosotros');
    const dialog = page.locator('dialog[data-search]');
    await page.keyboard.press('ControlOrMeta+k');
    await expect(dialog).toHaveAttribute('open', '');
    await page.keyboard.press('ControlOrMeta+k');
    await expect(dialog).not.toHaveAttribute('open', /.*/);
  });
});
