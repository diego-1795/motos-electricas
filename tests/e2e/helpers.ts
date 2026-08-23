import { expect, type Locator, type Page } from '@playwright/test';

export const CART_KEY = 'raiden:cart:v1';
export const COMPARE_KEY = 'raiden:compare:v1';

/** Parsea "S/ 4,999" / "S/ 12,155.50" a número de soles */
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
