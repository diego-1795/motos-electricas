import { test, expect } from '@playwright/test';
import { COMPARE_KEY, hydrated, readStorage } from './helpers';

test.describe('Comparador', () => {
  test('máximo 3 modelos (el 4º avisa con toast), tabla en /comparar y quitar uno', async ({ page }) => {
    await page.goto('/productos');
    const toggles = page.locator('[data-compare-toggle]');
    await expect(toggles).toHaveCount(4);

    for (let i = 0; i < 3; i++) {
      const t = toggles.nth(i);
      await hydrated(t);
      await t.click();
      await expect(t).toHaveAttribute('aria-pressed', 'true');
      await expect(t).toHaveText(/Comparando/);
    }
    await expect.poll(async () => (await readStorage<string[]>(page, COMPARE_KEY))?.length).toBe(3);

    // El cuarto no se añade y muestra toast de límite
    const fourth = toggles.nth(3);
    await hydrated(fourth);
    await fourth.click();
    await expect(page.locator('div[role="status"]')).toContainText('hasta 3 modelos');
    await expect(fourth).toHaveAttribute('aria-pressed', 'false');
    expect((await readStorage<string[]>(page, COMPARE_KEY))?.length).toBe(3);

    await page.goto('/comparar');
    await expect(page.locator('h1')).toHaveText('Comparador');
    const table = page.locator('[data-compare-table]');
    await expect(table).toBeVisible();
    // Cabecera: 1 columna de etiqueta + 3 modelos
    await expect(table.locator('thead th')).toHaveCount(4);
    await expect(table.locator('tbody tr').first().locator('td')).toHaveCount(3);

    await table.getByRole('button', { name: /^Quitar / }).first().click();
    await expect(table.locator('thead th')).toHaveCount(3);
    await expect.poll(async () => (await readStorage<string[]>(page, COMPARE_KEY))?.length).toBe(2);
    // Al bajar de 3 aparece el selector para añadir otro
    await expect(table.locator('select')).toBeVisible();
  });

  /**
   * BUG src/islands/CompareToggle.tsx:7-16 — desajuste de hidratación con el store persistido.
   * El SSR pinta `aria-pressed="false"` y clase sin `is-active`; al hidratar, `useStore($compare)` ya contiene
   * el slug y Preact actualiza el TEXTO ("✓ Comparando") pero NO re-aplica atributos/clases que difieren del
   * HTML servido → el botón dice "Comparando" con aria-pressed="false" y sin estilo activo.
   * Fix (mismo patrón que CartButton.tsx): const [mounted, setMounted] = useState(false);
   *   useEffect(() => setMounted(true), []); const active = mounted && list.includes(slug);
   */
  test('el toggle de la ficha de producto comparte estado con el catálogo tras navegar', async ({ page }) => {
    await page.goto('/bicimotos/golden-eagle');
    const t = page.locator('[data-compare-toggle="golden-eagle"]');
    await hydrated(t);
    await t.click();
    await expect(t).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/productos');
    const inCatalog = page.locator('[data-compare-toggle="golden-eagle"]');
    await hydrated(inCatalog);
    await expect(inCatalog).toHaveText(/Comparando/);
    await expect(inCatalog).toHaveAttribute('aria-pressed', 'true');
    await expect(inCatalog).toHaveClass(/is-active/);
  });

  test('el estado del comparador persiste entre páginas (texto y localStorage)', async ({ page }) => {
    await page.goto('/bicimotos/golden-eagle');
    const t = page.locator('[data-compare-toggle="golden-eagle"]');
    await hydrated(t);
    await t.click();
    await expect(t).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/productos');
    const inCatalog = page.locator('[data-compare-toggle="golden-eagle"]');
    await hydrated(inCatalog);
    await expect(inCatalog).toHaveText(/Comparando/);
    expect(await readStorage<string[]>(page, COMPARE_KEY)).toEqual(['golden-eagle']);
    // Al pulsar de nuevo se quita (el estado real es el del store)
    await inCatalog.click();
    await expect(inCatalog).toHaveText('Comparar');
    await expect.poll(async () => (await readStorage<string[]>(page, COMPARE_KEY))?.length).toBe(0);
  });

  test('sin selección muestra estado vacío', async ({ page }) => {
    await page.goto('/comparar');
    await expect(page.locator('[data-compare-table]')).toContainText('Aún no has elegido modelos');
    await expect(page.locator('[data-compare-table] table')).toHaveCount(0);
  });
});
