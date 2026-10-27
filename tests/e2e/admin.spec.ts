import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AdminCatalog, AdminError, AdminUser, CatalogEntry, DeployStatus, WriteResult } from '../../src/domain/admin';
import type { Part, Product } from '../../src/domain/types';
import { makePart, makeProduct, premiumVariant, variant } from '../unit/fixtures';

/**
 * Panel /admin (ADR-018) con el API mockeado por page.route: el build es estático y las
 * Pages Functions no corren en `astro preview`. Catálogo sintético: 2 productos (uno oculto)
 * y 2 repuestos. El mock guarda estado por test (sha y datos avanzan con cada escritura) y
 * aplica el contrato del PATCH como el servidor (422 ante claves extra o tipos incorrectos).
 */

const products: CatalogEntry<Product>[] = [
  {
    data: makeProduct({ slug: 'aguila-test', name: 'Águila Test', variants: [variant({ isDefault: true }), premiumVariant()], related: ['tigre-test'] }),
    sha: 'sha-aguila-1',
    path: 'src/content/products/aguila-test.json',
  },
  {
    data: makeProduct({ slug: 'tigre-test', name: 'Tigre Test', category: 'trimotos', variants: [variant({ isDefault: true, price: { amount: 270000, currency: 'PEN' } })], hidden: true }),
    sha: 'sha-tigre-1',
    path: 'src/content/products/tigre-test.json',
  },
];
const repuestos: CatalogEntry<Part>[] = [
  { data: makePart({ slug: 'motor-test', name: 'Motor de prueba', compatibleWith: ['aguila-test'] }), sha: 'sha-motor-1', path: 'src/content/repuestos/motor-test.json' },
  { data: makePart({ slug: 'cargador-test', name: 'Cargador de prueba', kind: 'cargador', price: { amount: 12000, currency: 'PEN' }, id: 'rp-cargador' }), sha: 'sha-cargador-1', path: 'src/content/repuestos/cargador-test.json' },
];

const users: Record<'admin' | 'editor', AdminUser> = {
  admin: { email: 'admin@example.com', role: 'admin', admins: ['admin@example.com'], editors: ['editor@example.com'], localMode: false, branch: 'main' },
  editor: { email: 'editor@example.com', role: 'editor', admins: ['admin@example.com'], editors: ['editor@example.com'], localMode: false, branch: 'main' },
};

interface Captured {
  method: string;
  path: string;
  body: unknown;
  /** Cabeceras de la petición (claves en minúsculas) */
  headers: Record<string, string>;
}

interface MockOptions {
  role: 'admin' | 'editor';
  deploy?: DeployStatus;
  /** Respuesta forzada para escrituras (p. ej. 409) */
  writeStatus?: number;
  /** Error forzado en escrituras con el cuerpo completo del contrato (422 con details, 502…) */
  writeError?: { status: number; body: AdminError };
  /** PATCH sin cambios: el servidor responde commit: null y no dispara build */
  noopPatch?: boolean;
  /** Retrasa la primera escritura (para encadenar dos guardados sobre la misma fila) */
  firstWriteDelayMs?: number;
  /** Modo local (wrangler pages dev): /me devuelve localMode y respeta la cabecera x-admin-local-user */
  localMode?: boolean;
}

const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const PRODUCT_PATCH_KEYS = new Set(['sha', 'reason', 'hidden', 'prices']);
const PART_PATCH_KEYS = new Set(['sha', 'reason', 'hidden', 'price']);

async function mockApi(page: Page, opts: MockOptions) {
  const calls: Captured[] = [];
  const counters = { catalog: 0, deploy: 0, writes: 0 };
  // Estado por test: cada escritura avanza el sha y los datos, como el repositorio real
  const state: AdminCatalog = { products: clone(products), repuestos: clone(repuestos), branch: 'main' };

  await page.route('**/api/admin/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api\/admin/, '');
    const method = req.method();
    const body = method === 'GET' ? undefined : req.postDataJSON();
    const headers = await req.allHeaders();
    calls.push({ method, path, body, headers });

    if (method === 'GET' && path === '/me') {
      if (!opts.localMode) return json(route, 200, users[opts.role]);
      const sim = headers['x-admin-local-user'];
      const role = sim === users.editor.email ? 'editor' : sim === users.admin.email ? 'admin' : opts.role;
      return json(route, 200, { ...users[role], localMode: true });
    }
    if (method === 'GET' && path === '/catalog') {
      counters.catalog++;
      return json(route, 200, state);
    }
    if (method === 'GET' && path === '/deploy') {
      counters.deploy++;
      return json(route, 200, opts.deploy ?? { available: false });
    }
    const m = /^\/(products|repuestos)\/([a-z0-9-]+)$/.exec(path);
    if (m && (method === 'PATCH' || method === 'PUT' || method === 'DELETE')) {
      counters.writes++;
      if (opts.firstWriteDelayMs && counters.writes === 1) await new Promise((r) => setTimeout(r, opts.firstWriteDelayMs));
      if (opts.writeError) return json(route, opts.writeError.status, opts.writeError.body);
      if (opts.writeStatus === 409) return json(route, 409, { code: 'conflict', error: 'El fichero ha cambiado en el repositorio (sha distinto)' });
      const kind = m[1] as 'products' | 'repuestos';
      const list: CatalogEntry<Product | Part>[] = kind === 'products' ? state.products : state.repuestos;
      const i = list.findIndex((e) => e.data.slug === m[2]);
      const entry = list[i];
      if (!entry) return json(route, 404, { code: 'not_found', error: 'No existe' });
      const b = body as Record<string, unknown>;
      if (b.sha !== entry.sha) return json(route, 409, { code: 'conflict', error: `El fichero ha cambiado en el repositorio (sha ${String(b.sha)} ≠ ${entry.sha})` });
      if (method === 'DELETE') {
        list.splice(i, 1);
        return json(route, 200, { path: entry.path, commit: { sha: 'c0ffee', url: 'https://github.com/x/y/commit/c0ffee', message: 'borrar' } });
      }
      if (method === 'PATCH') {
        const errors = patchErrors(kind, entry.data, b);
        if (errors.length) return json(route, 422, { code: 'validation', error: `El cambio sobre ${m[2]} no es válido`, details: errors });
      }
      const data = method === 'PUT' ? (b as { data: Product | Part }).data : applyPatch(entry.data, b);
      const commit = opts.noopPatch && method === 'PATCH' ? null : { sha: 'c0ffee', url: 'https://github.com/x/y/commit/c0ffee', message: 'actualizar' };
      const result: WriteResult<Product | Part> = { sha: commit ? `${entry.sha}-new` : entry.sha, path: entry.path, data, commit };
      list[i] = { data, sha: result.sha, path: entry.path };
      return json(route, 200, result);
    }
    return json(route, 404, { code: 'not_found', error: `Sin mock para ${method} ${path}` });
  });
  return { calls, counters };
}

/** El contrato del PATCH tal como lo impone adminPolicy en el servidor: solo claves permitidas y tipos correctos */
function patchErrors(kind: 'products' | 'repuestos', data: Product | Part, patch: Record<string, unknown>): string[] {
  const allowed = kind === 'products' ? PRODUCT_PATCH_KEYS : PART_PATCH_KEYS;
  const errors = Object.keys(patch)
    .filter((k) => !allowed.has(k))
    .map((k) => `campo no permitido en PATCH: ${k}`);
  if (patch.hidden !== undefined && typeof patch.hidden !== 'boolean') errors.push('hidden debe ser booleano');
  if (patch.reason !== undefined && typeof patch.reason !== 'string') errors.push('reason debe ser texto');
  if (kind === 'products' && patch.prices !== undefined) {
    for (const [id, amount] of Object.entries(patch.prices as Record<string, unknown>)) {
      if (!(data as Product).variants.some((v) => v.id === id)) errors.push(`variante desconocida: ${id}`);
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) errors.push(`variante ${id}: el precio debe ser un entero en céntimos de sol mayor que 0`);
    }
  }
  if (kind === 'repuestos' && patch.price !== undefined && (typeof patch.price !== 'number' || !Number.isInteger(patch.price) || patch.price <= 0)) {
    errors.push('price: el precio debe ser un entero en céntimos de sol mayor que 0');
  }
  return errors;
}

/** Réplica mínima de applyProductPatch/applyPartPatch para que la respuesta mockeada sea coherente */
function applyPatch(data: Product | Part, patch: Record<string, unknown>): Product | Part {
  const out = clone(data);
  if (typeof patch.hidden === 'boolean') {
    if (patch.hidden) out.hidden = true;
    else delete out.hidden;
  }
  if ('variants' in out && patch.prices && typeof patch.prices === 'object') {
    for (const v of out.variants) {
      const a = (patch.prices as Record<string, number>)[v.id];
      if (a !== undefined) v.price.amount = a;
    }
  }
  if (!('variants' in out) && typeof patch.price === 'number') out.price.amount = patch.price;
  return out;
}

async function openAdmin(page: Page) {
  await page.goto('/admin');
  await expect(page.locator('[data-admin-app]')).toBeVisible();
}

test.describe('Panel de administración', () => {
  test('/admin es noindex, sin cabecera ni carrito, y sin JS dice "Cargando el panel…"', async ({ page, request }) => {
    const html = await (await request.get('/admin')).text();
    expect(html).toContain('Cargando el panel…');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    await mockApi(page, { role: 'admin' });
    await openAdmin(page);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page).toHaveTitle('Administración de la tienda · RAIDEN');
    expect(await page.locator('header.header, [data-cart-drawer], [data-wa-source="floating"]').count()).toBe(0);
    await expect(page.locator('main[data-pagefind-body]')).toHaveCount(0);
  });

  test('editor: ve precios e interruptores de ocultar pero no crear, editar ni borrar', async ({ page }) => {
    await mockApi(page, { role: 'editor' });
    await openAdmin(page);
    await expect(page.locator('[data-admin-app]')).toHaveAttribute('data-role', 'editor');
    await expect(page.locator('.adm-who')).toContainText('editor@example.com · Editor');
    expect(await page.locator('[data-price-input]').count()).toBe(3); // 2 variantes + 1 variante
    expect(await page.locator('[data-hidden-toggle]').count()).toBe(2);
    await expect(page.getByRole('button', { name: 'Nuevo producto' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Editar ficha/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Borrar/ })).toHaveCount(0);
    // Ni siquiera en el DOM: sin botón "Nuevo", sin columna "Acciones", sin diálogos de administrador ni selector de modo local
    await expect(page.locator('[data-admin-new], .adm-td-actions, [data-admin-editor], [data-admin-delete], [data-admin-duplicate], [data-admin-simulate]')).toHaveCount(0);
    await expect(page.locator('[data-admin-table="products"] thead th')).toHaveCount(5);
    // La ficha oculta lleva la insignia y el interruptor marcado
    const hiddenRow = page.locator('[data-admin-row="tigre-test"]');
    await expect(hiddenRow.getByText('Oculto', { exact: true })).toBeVisible();
    await expect(hiddenRow.locator('[data-hidden-toggle]')).toHaveAttribute('aria-checked', 'true');
    // Repuestos: también precio e interruptor, sin acciones
    await page.getByRole('tab', { name: /Repuestos/ }).click();
    expect(await page.locator('[data-price-input]').count()).toBe(2);
    await expect(page.getByRole('button', { name: 'Nuevo repuesto' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Editar ficha/ })).toHaveCount(0);
  });

  test('admin: existen "Nuevo producto", "Editar ficha" y "Borrar"; el buscador filtra por nombre/slug', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'admin' });
    await openAdmin(page);
    await expect(page.getByRole('button', { name: 'Nuevo producto' })).toBeVisible();
    expect(await page.getByRole('button', { name: /Editar ficha/ }).count()).toBe(2);
    expect(await page.getByRole('button', { name: /^Borrar/ }).count()).toBe(2);
    await page.getByRole('searchbox', { name: 'Buscar por nombre o slug' }).fill('tigre');
    await expect(page.locator('[data-admin-row]')).toHaveCount(1);
    await expect(page.locator('[data-admin-row="tigre-test"]')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Buscar por nombre o slug' }).fill('aguila'); // sin tilde
    await expect(page.locator('[data-admin-row="aguila-test"]')).toBeVisible();
    await page.getByRole('tab', { name: /Repuestos/ }).click();
    await expect(page.getByRole('button', { name: 'Nuevo repuesto' })).toBeVisible();
    await expect(page.locator('[data-admin-row]')).toHaveCount(2);
    await expect(page.locator('[data-admin-access]')).toContainText('admin@example.com');
    await expect(page.locator('[data-admin-access]')).toContainText('editor@example.com');
    // Fuera del modo local no hay selector "Simular como…" y la cabecera de simulación no viaja nunca
    await expect(page.locator('[data-admin-simulate]')).toHaveCount(0);
    expect(calls.every((c) => c.headers['x-admin-local-user'] === undefined)).toBe(true);
  });

  test('editar el precio Estándar a 1250 envía PATCH {sha, prices:{estandar:125000}} y muestra el banner de publicación', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'editor' });
    await openAdmin(page);
    const input = page.locator('[data-price-input="aguila-test:estandar"]');
    await expect(input).toHaveValue('1200');
    await input.fill('1,250');
    await page.locator('[data-price-save="aguila-test:estandar"]').click();
    await expect(page.locator('[data-deploy-banner]')).toBeVisible();
    await expect(page.locator('[data-deploy-banner]')).toContainText('Publicando…');
    await expect(page.locator('[data-deploy-banner]')).toContainText('unos 3 minutos');
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch).toBeTruthy();
    expect(patch!.path).toBe('/products/aguila-test');
    expect(patch!.body).toEqual({ sha: 'sha-aguila-1', prices: { estandar: 125000 } });
    // La tabla refleja el nuevo precio y el sha devuelto se usa en la siguiente escritura
    await expect(input).toHaveValue('1250');
    await expect(page.locator('[data-price-cell="aguila-test:estandar"]')).toContainText('S/ 1,250');
    await page.locator('[data-hidden-toggle="aguila-test"]').click();
    await expect.poll(() => calls.filter((c) => c.method === 'PATCH').length).toBe(2);
    expect(calls.filter((c) => c.method === 'PATCH')[1]!.body).toEqual({ sha: 'sha-aguila-1-new', hidden: true });
  });

  test('el precio Premium no puede quedar por debajo del Estándar (aviso local, sin petición) y un importe inválido se rechaza', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'editor' });
    await openAdmin(page);
    const premium = page.locator('[data-price-input="aguila-test:premium"]');
    await premium.fill('1100');
    await page.locator('[data-price-save="aguila-test:premium"]').click();
    await expect(page.locator('[data-price-cell="aguila-test:premium"]')).toContainText('Premium no puede ser más barata');
    await premium.fill('abc');
    await page.locator('[data-price-save="aguila-test:premium"]').click();
    await expect(page.locator('[data-price-cell="aguila-test:premium"]')).toContainText('Importe no válido');
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });

  test('el interruptor Oculto envía PATCH {sha, hidden: true} (y hidden:false al volver a mostrar)', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'editor' });
    await openAdmin(page);
    const toggle = page.locator('[data-hidden-toggle="aguila-test"]');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ sha: 'sha-aguila-1', hidden: true });
    await expect(page.locator('[data-admin-row="aguila-test"]').getByText('Oculto', { exact: true })).toBeVisible();
    await page.locator('[data-hidden-toggle="tigre-test"]').click();
    await expect.poll(() => calls.filter((c) => c.method === 'PATCH').length).toBe(2);
    expect(calls.filter((c) => c.method === 'PATCH')[1]!.body).toEqual({ sha: 'sha-tigre-1', hidden: false });
  });

  test('un 409 muestra "Alguien modificó esta ficha; se ha recargado" y vuelve a pedir el catálogo', async ({ page }) => {
    const { counters } = await mockApi(page, { role: 'editor', writeStatus: 409 });
    await openAdmin(page);
    expect(counters.catalog).toBe(1);
    await page.locator('[data-price-input="aguila-test:estandar"]').fill('1300');
    await page.locator('[data-price-save="aguila-test:estandar"]').click();
    await expect(page.locator('[data-admin-alert]')).toHaveText('Alguien modificó esta ficha; se ha recargado');
    await expect.poll(() => counters.catalog).toBe(2);
    // Tras recargar, el input vuelve al valor real del catálogo
    await expect(page.locator('[data-price-input="aguila-test:estandar"]')).toHaveValue('1200');
  });

  test('con la API de Pages disponible el banner muestra el estado del despliegue y el enlace', async ({ page }) => {
    await mockApi(page, { role: 'editor', deploy: { available: true, state: 'building', url: 'https://dash.cloudflare.com/deploy/1', commitSha: 'c0ffee' } });
    await openAdmin(page);
    await page.locator('[data-hidden-toggle="aguila-test"]').click();
    const banner = page.locator('[data-deploy-banner="building"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Construyendo el sitio');
    await expect(banner.getByRole('link', { name: 'ver despliegue' })).toHaveAttribute('href', 'https://dash.cloudflare.com/deploy/1');
  });

  test('admin: "Editar ficha" abre el editor y guardar envía PUT con sha y la ficha fusionada; "Borrar" exige el slug', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'admin' });
    await openAdmin(page);
    await page.getByRole('button', { name: 'Editar ficha de Águila Test' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Editar ficha: Águila Test');
    await dialog.getByLabel('Subtítulo').fill('Subtítulo nuevo');
    await dialog.getByLabel('Motivo (opcional)').fill('prueba e2e');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toBeHidden();
    const put = calls.find((c) => c.method === 'PUT');
    expect(put).toBeTruthy();
    expect(put!.path).toBe('/products/aguila-test');
    const body = put!.body as { sha: string; reason: string; data: Product };
    expect(body.sha).toBe('sha-aguila-1');
    expect(body.reason).toBe('prueba e2e');
    expect(body.data.subtitle).toBe('Subtítulo nuevo');
    expect(body.data.specs).toEqual(products[0]!.data.specs);
    expect(body.data.variants.find((v) => v.isDefault)?.id).toBe('estandar');
    expect(body.data.related).toEqual(['tigre-test']);
    await expect(page.locator('[data-deploy-banner]')).toBeVisible();

    await page.getByRole('button', { name: 'Borrar Tigre Test' }).click();
    const del = page.getByRole('dialog');
    const confirm = del.getByRole('button', { name: 'Borrar', exact: true });
    await expect(confirm).toBeDisabled();
    await del.getByLabel(/para confirmar/).fill('tigre-test');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(del).toBeHidden();
    const deleted = calls.find((c) => c.method === 'DELETE');
    expect(deleted!.path).toBe('/products/tigre-test');
    expect(deleted!.body).toEqual({ sha: 'sha-tigre-1' });
    await expect(page.locator('[data-admin-row="tigre-test"]')).toHaveCount(0);
  });

  test('admin: "Nuevo producto" duplica una ficha y guarda con PUT sin sha; valida el slug', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'admin' });
    await openAdmin(page);
    await page.getByRole('button', { name: 'Nuevo producto' }).click();
    const dup = page.getByRole('dialog');
    await dup.getByLabel('Slug nuevo').fill('Mal Slug');
    await dup.getByLabel('Nombre').fill('Storm X2');
    await dup.getByRole('button', { name: 'Continuar al editor' }).click();
    await expect(dup).toContainText('minúsculas, números y guiones');
    await dup.getByLabel('Slug nuevo').fill('aguila-test');
    await dup.getByRole('button', { name: 'Continuar al editor' }).click();
    await expect(dup).toContainText('Ya existe una ficha');
    await dup.getByLabel('Slug nuevo').fill('storm-x2');
    await dup.getByRole('button', { name: 'Continuar al editor' }).click();
    const editor = page.getByRole('dialog');
    await expect(editor).toContainText('Nuevo producto: Storm X2');
    await expect(editor.getByLabel('Slug (URL)')).toHaveValue('storm-x2');
    await editor.getByRole('button', { name: 'Guardar' }).click();
    // El mock no conoce storm-x2 (404): el error se lista junto al formulario y el diálogo sigue abierto
    await expect(editor.getByRole('alert')).toContainText('No existe');
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.path).toBe('/products/storm-x2');
    const body = put.body as { sha?: string; data: Product };
    expect(body.sha).toBeUndefined();
    expect(body.data.slug).toBe('storm-x2');
    expect(body.data.name).toBe('Storm X2');
    expect(body.data.id).toBe('id-storm-x2');
  });

  test('un PATCH sin cambios (commit: null) avisa "Sin cambios" y no muestra el banner de publicación', async ({ page }) => {
    await mockApi(page, { role: 'editor', noopPatch: true });
    await openAdmin(page);
    await page.locator('[data-hidden-toggle="aguila-test"]').click();
    await expect(page.locator('[data-admin-status]')).toContainText('Sin cambios');
    await expect(page.locator('[data-deploy-banner]')).toHaveCount(0);
  });

  test('un error de configuración (500, code "config") se muestra como tal, dirigido a Diego', async ({ page }) => {
    await page.route('**/api/admin/**', (route) => json(route, 500, { code: 'config', error: 'Configuración incompleta del panel: falta GITHUB_TOKEN' }));
    await page.goto('/admin');
    const err = page.locator('[data-admin-error="config"]');
    await expect(err).toBeVisible();
    await expect(err).toContainText('Configuración incompleta del panel');
    await expect(err).toContainText('falta GITHUB_TOKEN');
    await expect(err).toContainText('Diego');
  });

  test('sin acceso (403) muestra la pantalla "Sin acceso" con a quién pedirlo', async ({ page }) => {
    await page.route('**/api/admin/**', (route) => json(route, 403, { code: 'forbidden', error: 'Email sin rol' }));
    await page.goto('/admin');
    const denied = page.locator('[data-admin-denied]');
    await expect(denied).toBeVisible();
    await expect(denied).toContainText('Sin acceso');
    await expect(denied).toContainText('ADMIN_EMAILS');
    await expect(denied).toContainText('Diego');
  });

  test('sin sesión (401) explica cómo volver a entrar; una redirección de Access (sesión caducada) se trata igual', async ({ page }) => {
    await page.route('**/api/admin/**', (route) => json(route, 401, { code: 'unauthorized', error: 'Sin sesión de Access' }));
    await page.goto('/admin');
    const denied = page.locator('[data-admin-denied]');
    await expect(denied).toBeVisible();
    await expect(denied).toContainText('Sin acceso');
    await expect(denied).toContainText('código de un solo uso');
    await expect(denied).toContainText('Sin sesión de Access');
    await expect(denied).not.toContainText('ADMIN_EMAILS');

    // Access caducado: el API "responde" con un 302 al login del equipo. El cliente no lo sigue (redirect: manual)
    // y lo muestra como sesión caducada en vez de como caída del servidor.
    await page.unroute('**/api/admin/**');
    await page.route('**/api/admin/**', (route) => route.fulfill({ status: 302, headers: { location: 'https://equipo.cloudflareaccess.com/cdn-cgi/access/login' } }));
    await page.goto('/admin');
    await expect(page.locator('[data-admin-denied]')).toBeVisible();
    await expect(page.locator('[data-admin-denied]')).toContainText('ha caducado');
    await expect(page.locator('[data-admin-error]')).toHaveCount(0);
  });

  test('un 422 lista los details del servidor junto al precio y en el editor, sin banner de publicación', async ({ page }) => {
    const details = ['variante estandar: el precio debe ser un entero en céntimos de sol', 'la versión Premium (110000) no puede ser más barata que la Estándar (130000)'];
    const { calls } = await mockApi(page, { role: 'admin', writeError: { status: 422, body: { code: 'validation', error: 'El cambio sobre aguila-test no es válido', details } } });
    await openAdmin(page);
    const input = page.locator('[data-price-input="aguila-test:estandar"]');
    await input.fill('1300');
    await page.locator('[data-price-save="aguila-test:estandar"]').click();
    const cell = page.locator('[data-price-cell="aguila-test:estandar"]');
    await expect(cell.getByRole('alert')).toContainText('no es válido');
    await expect(cell.getByRole('alert')).toContainText(details[0]!);
    await expect(cell.getByRole('alert')).toContainText(details[1]!);
    await expect(page.locator('[data-admin-alert]')).toContainText(details[0]!);
    await expect(page.locator('[data-deploy-banner]')).toHaveCount(0);
    // Lo escrito se conserva para corregirlo y el campo queda marcado como inválido
    await expect(input).toHaveValue('1300');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);

    await page.getByRole('button', { name: 'Editar ficha de Águila Test' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Subtítulo').fill('Otro');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toContainText('No se ha guardado');
    await expect(dialog.getByRole('alert')).toContainText(details[0]!);
    await expect(dialog.getByRole('alert')).toContainText(details[1]!);
    // El resumen de errores recibe el foco (WCAG 3.3.1 / docs 12 §6)
    await expect(dialog.getByRole('alert')).toBeFocused();
    await expect(page.locator('[data-deploy-banner]')).toHaveCount(0);
  });

  test('un 502 (upstream) en una escritura se anuncia como fallo de GitHub/Cloudflare y la fila no cambia', async ({ page }) => {
    await mockApi(page, { role: 'editor', writeError: { status: 502, body: { code: 'upstream', error: 'GitHub respondió 503' } } });
    await openAdmin(page);
    const toggle = page.locator('[data-hidden-toggle="aguila-test"]');
    await toggle.click();
    await expect(page.locator('[data-admin-alert]')).toContainText('Fallo de GitHub o Cloudflare');
    await expect(page.locator('[data-admin-alert]')).toContainText('GitHub respondió 503');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('[data-deploy-banner]')).toHaveCount(0);
  });

  test('dos escrituras seguidas sobre la misma fila se encadenan: la segunda usa el sha devuelto por la primera (sin 409 propio)', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'editor', firstWriteDelayMs: 700 });
    await openAdmin(page);
    await page.locator('[data-price-input="aguila-test:estandar"]').fill('1250');
    await page.locator('[data-price-save="aguila-test:estandar"]').click();
    // Con el primer PATCH aún en vuelo se pulsa el interruptor de la misma ficha
    await expect(page.locator('[data-price-save="aguila-test:estandar"]')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('[data-hidden-toggle="aguila-test"]').click();
    await expect.poll(() => calls.filter((c) => c.method === 'PATCH').length, { timeout: 5000 }).toBe(2);
    const patches = calls.filter((c) => c.method === 'PATCH');
    expect(patches[0]!.body).toEqual({ sha: 'sha-aguila-1', prices: { estandar: 125000 } });
    expect(patches[1]!.body).toEqual({ sha: 'sha-aguila-1-new', hidden: true });
    await expect(page.locator('[data-hidden-toggle="aguila-test"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-price-input="aguila-test:estandar"]')).toHaveValue('1250');
    await expect(page.locator('[data-admin-alert]')).toBeEmpty();
    await expect(page.locator('[data-deploy-banner]')).toBeVisible();
  });

  test('repuestos: el precio envía PATCH {sha, price, reason} y el foco vuelve al importe tras guardar', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'editor' });
    await openAdmin(page);
    await page.getByRole('tab', { name: /Repuestos/ }).click();
    const input = page.locator('[data-price-input="motor-test"]');
    await expect(input).toHaveValue('350');
    await input.fill('S/ 400');
    await page.getByLabel('Motivo del cambio de Precio de Motor de prueba').fill('nueva lista del proveedor');
    await page.locator('[data-price-save="motor-test"]').click();
    await expect.poll(() => calls.filter((c) => c.method === 'PATCH').length).toBe(1);
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.path).toBe('/repuestos/motor-test');
    expect(patch.body).toEqual({ sha: 'sha-motor-1', price: 40000, reason: 'nueva lista del proveedor' });
    await expect(page.locator('[data-price-cell="motor-test"]')).toContainText('S/ 400');
    await expect(input).toHaveValue('400');
    await expect(input).toBeFocused();
    // Cancelar también devuelve el foco al importe y descarta lo escrito
    await input.fill('999');
    await page.locator('[data-price-cell="motor-test"]').getByRole('button', { name: 'Cancelar' }).click();
    await expect(input).toHaveValue('400');
    await expect(input).toBeFocused();
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
  });

  test('admin: un 409 en el editor bloquea "Guardar" (el formulario parte de una versión antigua) y recarga el catálogo', async ({ page }) => {
    const { calls, counters } = await mockApi(page, { role: 'admin', writeStatus: 409 });
    await openAdmin(page);
    await page.getByRole('button', { name: 'Editar ficha de Águila Test' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Subtítulo').fill('Cambio que llega tarde');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toContainText('Alguien modificó esta ficha');
    await expect(dialog.getByRole('alert')).toContainText('vuelve a abrirlo');
    await expect.poll(() => counters.catalog).toBe(2);
    await expect(dialog.getByRole('button', { name: 'Guardar' })).toHaveAttribute('aria-disabled', 'true');
    // `force`: Playwright trata aria-disabled como "no habilitado" y no pulsaría; aquí queremos comprobar que pulsar no envía nada
    await dialog.getByRole('button', { name: 'Guardar' }).click({ force: true });
    await page.keyboard.press('Enter');
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
  });

  test('modo local: "Simular como…" fija la cabecera x-admin-local-user y cambia el rol; al quitarla deja de enviarse', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'admin', localMode: true });
    await openAdmin(page);
    await expect(page.locator('.adm-who')).toContainText('Modo local');
    const sim = page.locator('[data-admin-simulate]');
    await expect(sim).toBeVisible();
    expect(calls.find((c) => c.path === '/me')!.headers['x-admin-local-user']).toBeUndefined();

    await sim.selectOption('editor@example.com');
    await expect(page.locator('[data-admin-app]')).toHaveAttribute('data-role', 'editor');
    await expect(page.locator('.adm-who')).toContainText('editor@example.com · Editor');
    await expect(page.getByRole('button', { name: 'Nuevo producto' })).toHaveCount(0);
    const afterSim = calls.filter((c) => c.path === '/me' || c.path === '/catalog').slice(-2);
    expect(afterSim).toHaveLength(2);
    for (const c of afterSim) expect(c.headers['x-admin-local-user']).toBe('editor@example.com');

    await page.locator('[data-admin-simulate]').selectOption('');
    await expect(page.locator('[data-admin-app]')).toHaveAttribute('data-role', 'admin');
    expect(calls.filter((c) => c.path === '/me').at(-1)!.headers['x-admin-local-user']).toBeUndefined();
    await expect(page.getByRole('button', { name: 'Nuevo producto' })).toBeVisible();
  });

  test('teclado: flechas entre pestañas, Escape cierra el diálogo y devuelve el foco, el interruptor no pierde el foco al guardar', async ({ page }) => {
    await mockApi(page, { role: 'admin' });
    await openAdmin(page);
    await page.getByRole('tab', { name: /Productos/ }).focus();
    await page.keyboard.press('ArrowRight');
    const partsTab = page.getByRole('tab', { name: /Repuestos/ });
    await expect(partsTab).toBeFocused();
    await expect(partsTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-admin-table="repuestos"]')).toBeVisible();
    await page.keyboard.press('ArrowRight'); // circular
    await expect(page.getByRole('tab', { name: /Productos/ })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(partsTab).toBeFocused();

    const edit = page.getByRole('button', { name: 'Editar ficha de Motor de prueba' });
    await edit.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(edit).toBeFocused();

    const toggle = page.locator('[data-hidden-toggle="motor-test"]');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toBeFocused();
    await expect(toggle).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('móvil: cada celda lleva el nombre de su columna, la tabla conserva su semántica y axe no encuentra violaciones serious/critical', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, { role: 'editor' });
    await openAdmin(page);
    const row = page.locator('[data-admin-row="aguila-test"]');
    await expect(row).toHaveAttribute('role', 'row');
    await expect(page.locator('[data-admin-table="products"]')).toHaveAttribute('role', 'table');
    for (const label of ['Nombre', 'Categoría', 'Precios', 'Disponibilidad', 'Estado']) {
      await expect(row.locator(`td[data-label="${label}"][role="cell"]`)).toHaveCount(1);
    }
    // Sin scroll horizontal a 390 px
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // Objetivos táctiles ≥ 24 px (WCAG 2.5.8) en interruptor, precio y pestañas
    for (const sel of ['[data-hidden-toggle="aguila-test"]', '[data-price-input="aguila-test:estandar"]', '#adm-tab-repuestos']) {
      const box = (await page.locator(sel).boundingBox())!;
      expect(box.height, sel).toBeGreaterThanOrEqual(24);
      expect(box.width, sel).toBeGreaterThanOrEqual(24);
    }
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }));
    expect(blocking).toEqual([]);
  });

  test('axe sin violaciones serious/critical en la vista admin (tabla, accesos) y con el editor abierto', async ({ page }) => {
    await mockApi(page, { role: 'admin' });
    await openAdmin(page);
    await page.waitForLoadState('networkidle');
    const audit = async (label: string) => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
      const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }));
      expect(blocking, `violaciones serious/critical (${label})`).toEqual([]);
    };
    await audit('tabla');
    await page.locator('[data-price-input="aguila-test:estandar"]').fill('1300');
    await audit('precio editado');
    await page.getByRole('button', { name: 'Editar ficha de Águila Test' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await audit('editor');
  });
});
