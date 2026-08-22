import { test, expect } from '@playwright/test';
import { hydrated } from './helpers';

/**
 * BUG — desajuste de hidratación en islas que leen el store persistido.
 *
 * En SSR el carrito está vacío; al hidratar, `useStore($cart)` ya devuelve el carrito
 * de localStorage. Preact, en modo hydrate, NO re-aplica los atributos del nodo raíz
 * cuando difieren del HTML servido, así que:
 *
 *  1. src/islands/CartPage.tsx:15-30 — el nodo raíz conserva `class="cp__empty card"` del
 *     estado vacío y nunca recibe `data-cp`/`data-cart-page` ni `class="cp"` (la página se
 *     pinta con el layout del estado vacío, sin grid de dos columnas en escritorio).
 *  2. src/islands/CartButton.tsx:7 — `aria-label="Abrir carrito, 0 artículos"` queda
 *     desactualizado aunque el badge muestre 2.
 *
 * Fix sugerido: renderizar lo mismo que el SSR hasta montar y luego re-renderizar:
 *   const [ready, setReady] = useState(false); useEffect(() => setReady(true), []);
 *   const cart = ready ? useStore($cart) : emptyCart();   // o un wrapper raíz estable
 *     <div class={items.length ? 'cp' : 'cp__empty card'} data-cart-page> siempre presente.
 */
test.describe('Hidratación con carrito persistido', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/motos-electricas/odin-1-0');
    await hydrated(page.locator('[data-configurator]'));
    await page.getByRole('button', { name: 'Más unidades' }).click();
    await page.locator('[data-add-to-cart]').click();
    await expect(page.locator('[data-cart-drawer]')).toBeVisible();
  });

  test('/carrito con ítems expone [data-cart-page] y no el layout de vacío', async ({ page }) => {
    await page.goto('/carrito');
    await expect(page.locator('[data-cart-page]')).toBeVisible();
    await expect(page.locator('[data-cart-page]')).toHaveClass(/\bcp\b/);
    await expect(page.locator('.cp__empty')).toHaveCount(0);
  });

  test('el botón del carrito anuncia el número real de artículos tras recargar', async ({ page }) => {
    await page.reload();
    await expect(page.locator('[data-cart-count]')).toHaveText('2');
    await expect(page.locator('[data-cart-button]')).toHaveAttribute('aria-label', 'Abrir carrito, 2 artículos');
  });
});
