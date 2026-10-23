import { test, expect } from '@playwright/test';
import { WA_PREFIX, hydrated, openedUrls, stubWindowOpen } from './helpers';

const NAME = 'Diego Prueba';
const PHONE = '+51 900 000 000';
const MESSAGE = 'Quiero información sobre la batería de 20Ah para mi Golden Eagle.';

test.describe('Formulario de contacto → WhatsApp', () => {
  test.beforeEach(async ({ page }) => {
    await stubWindowOpen(page);
    await page.goto('/contacto');
    await expect(page.locator('h1')).toHaveText('Hablemos');
    await hydrated(page.locator('[data-contact-form]'));
  });

  test('rellenar nombre, teléfono, asunto y mensaje abre wa.me con el texto codificado', async ({ page }) => {
    await page.locator('#cf-name').fill(NAME);
    await page.locator('#cf-phone').fill(PHONE);
    await page.locator('select[name="asunto"]').selectOption('Repuestos');
    await page.locator('#cf-message').fill(MESSAGE);
    await expect(page.locator('#cf-message-hint')).toHaveText(`${MESSAGE.length}/500`);

    await page.locator('[data-contact-whatsapp]').click();
    await expect.poll(async () => (await openedUrls(page)).length).toBe(1);
    const url = (await openedUrls(page))[0]!;
    expect(url.startsWith(WA_PREFIX)).toBe(true);
    expect(url).not.toContain(' ');
    expect(url).toContain(encodeURIComponent(NAME));
    expect(url).toContain(encodeURIComponent(MESSAGE));
    const decoded = decodeURIComponent(url.split('text=')[1]!);
    expect(decoded).toContain(`Soy ${NAME} y escribo desde la web.`);
    expect(decoded).toContain('Asunto: Repuestos');
    expect(decoded).toContain(`Teléfono: ${PHONE}`);
    expect(decoded).toContain(`Mensaje: ${MESSAGE}`);
    await expect(page.locator('[data-contact-form] [aria-live="polite"]')).toContainText('Se abrió WhatsApp');
    // El formulario no se envía a ningún servidor propio
    await expect(page).toHaveURL(/\/contacto$/);
  });

  test('teléfono inválido muestra validación y no abre WhatsApp', async ({ page }) => {
    await page.locator('#cf-name').fill(NAME);
    await page.locator('#cf-phone').fill('abc');
    await page.locator('#cf-message').fill(MESSAGE);
    await page.locator('[data-contact-whatsapp]').click();
    const err = page.locator('#cf-phone-err');
    await expect(err).toBeVisible();
    await expect(err).toHaveAttribute('role', 'alert');
    await expect(err).toContainText('Revisa el número de teléfono');
    await expect(page.locator('#cf-phone')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#cf-phone')).toHaveAttribute('aria-describedby', 'cf-phone-err');
    await expect(page.locator('#cf-phone')).toBeFocused();
    expect(await openedUrls(page)).toEqual([]);

    // Corregir el teléfono limpia el error y permite enviar
    await page.locator('#cf-phone').fill(PHONE);
    await page.locator('[data-contact-whatsapp]').click();
    await expect(err).toHaveCount(0);
    await expect.poll(async () => (await openedUrls(page)).length).toBe(1);
  });

  test('nombre y mensaje son obligatorios; el teléfono es opcional', async ({ page }) => {
    await page.locator('[data-contact-whatsapp]').click();
    await expect(page.locator('#cf-name-err')).toContainText('Escribe tu nombre');
    await expect(page.locator('#cf-message-err')).toContainText('mínimo 10 caracteres');
    await expect(page.locator('#cf-name')).toBeFocused();
    expect(await openedUrls(page)).toEqual([]);

    await page.locator('#cf-name').fill('Ana');
    await page.locator('#cf-message').fill('Hola, ¿tienen stock del Vortex Kobra?');
    await page.locator('[data-contact-whatsapp]').click();
    await expect.poll(async () => (await openedUrls(page)).length).toBe(1);
    const decoded = decodeURIComponent((await openedUrls(page))[0]!.split('text=')[1]!);
    expect(decoded).toContain('Soy Ana');
    expect(decoded).not.toContain('Teléfono');
    expect(decoded).toContain('Asunto: Compra');
  });

  test('la página expone WhatsApp directo y datos de contacto centralizados', async ({ page }) => {
    const wa = page.locator('[data-wa-source="contact"]');
    await expect(wa).toHaveCount(1);
    expect((await wa.getAttribute('href'))!.startsWith(WA_PREFIX)).toBe(true);
    await expect(page.locator('.contact__big a')).toHaveAttribute('href', `tel:+${WA_PREFIX.match(/wa\.me\/(\d+)/)![1]}`);
  });
});
