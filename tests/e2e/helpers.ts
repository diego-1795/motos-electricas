import { expect, type Locator, type Page } from '@playwright/test';

export const CART_KEY = 'raiden:cart:v1';
export const COMPARE_KEY = 'raiden:compare:v1';
/** Número de WhatsApp del build bajo prueba (playwright.config.ts → PUBLIC_WHATSAPP_NUMBER). */
export const WA_NUMBER = process.env.PUBLIC_WHATSAPP_NUMBER ?? '51989853431';
export const WA_PREFIX = `https://wa.me/${WA_NUMBER}?text=`;

/** Rutas del catálogo real (ADR-015) */
export const GE = '/bicimotos/golden-eagle';
export const TITAN = '/trimotos/titan-rhino';
export const MOTOR = '/repuestos/motor-350w';

/** Parsea "S/ 1,500" / "S/ 12,155.50" a número de soles */
export function parsePrice(text: string): number {
  const m = text.replace(/\s/g, '').match(/S\/(\d{1,3}(?:,\d{3})*|\d+)(\.\d+)?/);
  if (!m) throw new Error(`No price in "${text}"`);
  return Number(m[1]!.replace(/,/g, '') + (m[2] ?? ''));
}

export function decodeWaHref(href: string): string {
  const idx = href.indexOf('text=');
  return decodeURIComponent(href.slice(idx + 5));
}

export async function readStorage<T>(page: Page, key: string): Promise<T | null> {
  const raw = await page.evaluate((k) => localStorage.getItem(k), key);
  return raw ? (JSON.parse(raw) as T) : null;
}

/**
 * Espera a que la isla Astro que contiene el elemento esté hidratada.
 * Astro elimina el atributo `ssr` de <astro-island> al terminar la hidratación;
 * un click antes de eso (islas `client:visible`) se pierde.
 */
export async function hydrated(el: Locator): Promise<void> {
  await el.scrollIntoViewIfNeeded();
  const island = el.locator('xpath=ancestor::astro-island[1]');
  await expect(island).not.toHaveAttribute('ssr', /.*/);
}

/**
 * Sustituye window.open por un registro en `window.__opened` para capturar el enlace
 * wa.me que abre el formulario de contacto sin crear pestañas reales.
 */
export async function stubWindowOpen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __opened: string[]; open: (url?: string | URL) => null };
    w.__opened = [];
    w.open = (url) => {
      w.__opened.push(String(url));
      return null;
    };
  });
}

export const openedUrls = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);

/** En móvil el panel de filtros del catálogo está plegado: lo abre si el control indicado no es visible. */
export async function openFilters(page: Page, probe: Locator): Promise<void> {
  if (!(await probe.isVisible())) {
    await page.locator('[data-filters-toggle]').click();
  }
  await expect(probe).toBeVisible();
}

/** Añade Golden Eagle (versión por defecto) al carrito desde su ficha y deja el drawer abierto. */
export async function addGoldenEagle(page: Page, qty = 1): Promise<void> {
  await page.goto(GE);
  const cfg = page.locator('[data-configurator]');
  await hydrated(cfg);
  for (let i = 1; i < qty; i++) await cfg.getByRole('button', { name: 'Más unidades' }).click();
  await cfg.locator('[data-add-to-cart]').click();
  await expect(page.locator('[data-cart-drawer]')).toBeVisible();
}
