import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AdminCatalog, AdminError, AdminUser, BlogEntry, BlogSummary, CatalogEntry, DeployStatus, UploadResult, WriteResult } from '../../src/domain/admin';
import type { Part, Product } from '../../src/domain/types';
import { makePart, makeProduct, premiumVariant, variant } from '../unit/fixtures';

/**
 * Panel /admin (ADR-018) con el API mockeado por page.route: el build es estático y las
 * Pages Functions no corren en `astro preview`. Catálogo sintético: 2 productos (uno oculto)
 * y 2 repuestos. El mock guarda estado por test (sha y datos avanzan con cada escritura) y
 * aplica el contrato del PATCH como el servidor (422 ante claves extra o tipos incorrectos).
 * Blog y subidas (ADR-023): 2 artículos; el mock de /blog y /uploads responde 403 al editor.
 */

const posts: BlogEntry[] = [
  {
    slug: 'como-cuidar-la-bateria',
    frontmatter: { title: 'Cómo cuidar la batería', description: 'Guía práctica.', category: 'baterias', publishedAt: '2026-10-27T08:00:00.000Z', author: 'Equipo Raiden', relatedProducts: ['aguila-test'] },
    body: 'Carga después de cada uso.\n\n## Resumen\n\nNunca la dejes vacía.\n',
    sha: 'sha-bateria-1',
    path: 'src/content/blog/como-cuidar-la-bateria.md',
  },
  {
    slug: 'necesito-licencia',
    frontmatter: {
      title: '¿Necesito licencia?',
      description: 'Respuesta honesta.',
      category: 'legislacion',
      publishedAt: '2026-10-23T08:00:00.000Z',
      author: 'Equipo Raiden',
      image: { src: '~/assets/blog/necesito-licencia.webp', alt: 'Bicimoto', width: 1264, height: 848 },
      relatedProducts: [],
    },
    body: 'En general no.\n',
    sha: 'sha-licencia-1',
    path: 'src/content/blog/necesito-licencia.md',
  },
];

const summary = (p: BlogEntry): BlogSummary => ({
  slug: p.slug,
  title: p.frontmatter.title,
  category: p.frontmatter.category,
  publishedAt: p.frontmatter.publishedAt,
  ...(p.frontmatter.updatedAt ? { updatedAt: p.frontmatter.updatedAt } : {}),
  author: p.frontmatter.author,
  hasImage: Boolean(p.frontmatter.image),
  sha: p.sha,
  path: p.path,
});

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
  /** Sin cookie de sesión: todo responde 401 hasta un POST /auth/login correcto (ADR-024) */
  loggedOut?: boolean;
  /** Contraseña temporal: /me lleva mustChangePassword y el resto responde 403 hasta cambiarla */
  mustChange?: boolean;
}

/** Contraseña que acepta el mock de /auth/login y /auth/password (como la temporal asignada por el administrador) */
const MOCK_PASSWORD = 'Temporal-1234-abcd';

const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const PRODUCT_PATCH_KEYS = new Set(['sha', 'reason', 'hidden', 'prices']);
const PART_PATCH_KEYS = new Set(['sha', 'reason', 'hidden', 'price']);

async function mockApi(page: Page, opts: MockOptions) {
  const calls: Captured[] = [];
  const counters = { catalog: 0, deploy: 0, writes: 0 };
  // Estado por test: cada escritura avanza el sha y los datos, como el repositorio real
  const state: AdminCatalog = { products: clone(products), repuestos: clone(repuestos), branch: 'main' };
  const blog: BlogEntry[] = clone(posts);
  const commitOf = (message: string) => ({ sha: 'c0ffee', url: 'https://github.com/x/y/commit/c0ffee', message });
  let session = !opts.loggedOut;
  let mustChange = Boolean(opts.mustChange);

  await page.route('**/api/admin/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api\/admin/, '');
    const method = req.method();
    const body = method === 'GET' ? undefined : req.postDataJSON();
    const headers = await req.allHeaders();
    calls.push({ method, path, body, headers });

    // Sesión (ADR-024): login, logout y cambio de contraseña; sin sesión todo lo demás es 401
    if (path === '/auth/login' && method === 'POST') {
      const b = body as { email?: string; password?: string };
      if (b.email === users[opts.role].email && b.password === MOCK_PASSWORD) {
        session = true;
        return json(route, 200, { ...users[opts.role], ...(mustChange ? { mustChangePassword: true } : {}) });
      }
      return json(route, 401, { code: 'unauthorized', error: 'Email o contraseña incorrectos' });
    }
    if (path === '/auth/logout' && method === 'POST') {
      session = false;
      return json(route, 200, { ok: true });
    }
    if (!session) return json(route, 401, { code: 'unauthorized', error: 'Inicia sesión con tu email y contraseña' });
    if (path === '/auth/password' && method === 'POST') {
      const b = body as { currentPassword?: string; newPassword?: string };
      if (b.currentPassword !== MOCK_PASSWORD) return json(route, 401, { code: 'unauthorized', error: 'La contraseña actual no es correcta' });
      if ((b.newPassword ?? '').length < 10) return json(route, 422, { code: 'validation', error: 'La contraseña nueva no es válida', details: ['La contraseña debe tener al menos 10 caracteres'] });
      mustChange = false;
      return json(route, 200, users[opts.role]);
    }
    if (mustChange && path !== '/me') return json(route, 403, { code: 'forbidden', error: 'Debes cambiar tu contraseña temporal antes de usar el panel' });

    // Blog y subidas (ADR-023): solo admin, como el servidor
    if (path === '/blog' || path.startsWith('/blog/') || path === '/uploads') {
      if (opts.role !== 'admin') return json(route, 403, { code: 'forbidden', error: 'Solo el administrador puede gestionar el blog' });
      if (method === 'GET' && path === '/blog') return json(route, 200, { posts: blog.map(summary), branch: 'main' });
      if (method === 'POST' && path === '/uploads') {
        const b = body as { path: string; contentBase64: string };
        const ref = b.path.startsWith('public/docs/') ? b.path.replace(/^public/, '') : b.path.replace(/^src\/assets/, '~/assets');
        const result: UploadResult = { path: b.path, ref, bytes: Math.floor((b.contentBase64.length * 3) / 4), sha: 'sha-upload-1', replaced: false, commit: commitOf('subir') };
        return json(route, 200, result);
      }
      const bm = /^\/blog\/([a-z0-9-]+)$/.exec(path);
      if (!bm) return json(route, 404, { code: 'not_found', error: `Sin mock para ${method} ${path}` });
      const i = blog.findIndex((p) => p.slug === bm[1]);
      const entry = blog[i];
      if (method === 'GET') return entry ? json(route, 200, entry) : json(route, 404, { code: 'not_found', error: 'No existe' });
      const b = body as Record<string, unknown>;
      if (opts.writeError) return json(route, opts.writeError.status, opts.writeError.body);
      if (method === 'DELETE') {
        if (!entry) return json(route, 404, { code: 'not_found', error: 'No existe' });
        if (b.sha !== entry.sha) return json(route, 409, { code: 'conflict', error: 'El artículo cambió' });
        blog.splice(i, 1);
        return json(route, 200, { path: entry.path, commit: commitOf('borrar') });
      }
      if (method === 'PUT') {
        if (b.sha === undefined && entry) return json(route, 409, { code: 'conflict', error: 'Ya existe' });
        if (b.sha !== undefined && (!entry || b.sha !== entry.sha)) return json(route, entry ? 409 : 404, { code: entry ? 'conflict' : 'not_found', error: entry ? 'El artículo cambió' : 'No existe' });
        const saved: BlogEntry = { slug: bm[1]!, frontmatter: b.frontmatter as BlogEntry['frontmatter'], body: b.body as string, sha: `${entry?.sha ?? 'sha-nuevo'}-new`, path: `src/content/blog/${bm[1]}.md` };
        if (entry) blog[i] = saved;
        else blog.push(saved);
        return json(route, 200, { ...saved, commit: commitOf(entry ? 'actualizar' : 'crear') });
      }
      return json(route, 405, { code: 'bad_request', error: 'método' });
    }

    if (method === 'GET' && path === '/me') {
      if (mustChange) return json(route, 200, { ...users[opts.role], mustChangePassword: true });
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
    // Sin pestaña Blog (ADR-023): solo Productos y Repuestos
    await expect(page.getByRole('tab')).toHaveCount(2);
    await expect(page.getByRole('tab', { name: 'Blog' })).toHaveCount(0);
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

  test('sin sesión muestra "Iniciar sesión"; credenciales incorrectas avisan sin salir; las correctas abren el panel con su rol', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'editor', loggedOut: true });
    await page.goto('/admin');
    const login = page.locator('[data-admin-login]');
    await expect(login).toBeVisible();
    await expect(page.locator('[data-admin-app]')).toHaveCount(0);
    await expect(login.getByLabel('Email')).toBeFocused();
    // Validación local: sin petición
    await login.getByRole('button', { name: 'Entrar' }).click();
    await expect(login.getByRole('alert')).toContainText('email válido');
    expect(calls.filter((c) => c.path === '/auth/login')).toHaveLength(0);
    // Contraseña incorrecta: 401 del servidor, se vacía el campo y el foco va al aviso
    await login.getByLabel('Email').fill('Editor@Example.com ');
    await login.getByLabel('Contraseña').fill('no-es-esta');
    await login.getByRole('button', { name: 'Entrar' }).click();
    await expect(login.getByRole('alert')).toContainText('incorrectos');
    await expect(login.getByRole('alert')).toBeFocused();
    await expect(login.getByLabel('Contraseña')).toHaveValue('');
    expect(calls.find((c) => c.path === '/auth/login')!.body).toEqual({ email: 'editor@example.com', password: 'no-es-esta' });
    // Correcta: panel con el rol que devuelve el servidor
    await login.getByLabel('Contraseña').fill(MOCK_PASSWORD);
    await login.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('[data-admin-app]')).toHaveAttribute('data-role', 'editor');
    await expect(page.locator('.adm-who')).toContainText('editor@example.com · Editor');
    await expect(page.locator('[data-admin-logout]')).toBeVisible();

    // Un perímetro externo que redirige (302) se muestra como sesión caducada sobre el propio login, no como caída
    await page.unroute('**/api/admin/**');
    await page.route('**/api/admin/**', (route) => route.fulfill({ status: 302, headers: { location: 'https://equipo.cloudflareaccess.com/cdn-cgi/access/login' } }));
    await page.goto('/admin');
    await expect(page.locator('[data-admin-login]')).toBeVisible();
    await expect(page.locator('[data-admin-login]')).toContainText('ha caducado');
    await expect(page.locator('[data-admin-error]')).toHaveCount(0);
  });

  test('contraseña temporal: obliga a elegir una nueva antes de cargar el panel (validación local y 401 del servidor)', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'admin', mustChange: true });
    await page.goto('/admin');
    const must = page.locator('[data-admin-must-change]');
    await expect(must).toBeVisible();
    await expect(must).toContainText('contraseña temporal');
    await expect(page.locator('[data-admin-app]')).toHaveCount(0);
    expect(calls.some((c) => c.path === '/catalog')).toBe(false);
    await expect(must.getByLabel('Contraseña actual')).toBeFocused();

    const form = must.locator('[data-admin-password-form]');
    await form.getByLabel('Contraseña actual').fill(MOCK_PASSWORD);
    await form.getByLabel('Contraseña nueva', { exact: true }).fill('1234567890');
    await form.getByLabel('Repite la contraseña nueva').fill('1234567891');
    await form.getByRole('button', { name: 'Cambiar contraseña' }).click();
    const errors = form.getByRole('alert');
    await expect(errors).toContainText('predecible');
    await expect(errors).toContainText('no coinciden');
    await expect(errors).toBeFocused();
    expect(calls.filter((c) => c.path === '/auth/password')).toHaveLength(0);

    await form.getByLabel('Contraseña actual').fill('otra-que-no-es');
    await form.getByLabel('Contraseña nueva', { exact: true }).fill('mi moto azul vuela 2026');
    await form.getByLabel('Repite la contraseña nueva').fill('mi moto azul vuela 2026');
    await form.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(errors).toContainText('actual no es correcta');
    await expect(form.getByLabel('Contraseña actual')).toHaveValue('');

    await form.getByLabel('Contraseña actual').fill(MOCK_PASSWORD);
    await form.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(page.locator('[data-admin-app]')).toHaveAttribute('data-role', 'admin');
    const change = calls.filter((c) => c.path === '/auth/password');
    expect(change).toHaveLength(2);
    expect(change[1]!.body).toEqual({ currentPassword: MOCK_PASSWORD, newPassword: 'mi moto azul vuela 2026' });
  });

  test('"Cambiar contraseña" abre un diálogo y confirma en la región de estado; "Cerrar sesión" vuelve al inicio de sesión', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'editor' });
    await openAdmin(page);
    await page.locator('[data-admin-change-password]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Cambiar contraseña');
    await dialog.getByLabel('Contraseña actual').fill(MOCK_PASSWORD);
    await dialog.getByLabel('Contraseña nueva', { exact: true }).fill('Raiden#Callao2026');
    await dialog.getByLabel('Repite la contraseña nueva').fill('Raiden#Callao2026');
    await dialog.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-admin-status]')).toContainText('Contraseña cambiada');
    expect(calls.find((c) => c.path === '/auth/password')!.body).toEqual({ currentPassword: MOCK_PASSWORD, newPassword: 'Raiden#Callao2026' });

    await page.locator('[data-admin-logout]').click();
    await expect(page.locator('[data-admin-login]')).toBeVisible();
    await expect(page.locator('[data-admin-login]')).toContainText('Has cerrado la sesión');
    expect(calls.some((c) => c.path === '/auth/logout' && c.method === 'POST')).toBe(true);
    // Tras cerrar, el API responde 401 y el panel no se muestra
    await expect(page.locator('[data-admin-app]')).toHaveCount(0);
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
    await page.keyboard.press('ArrowRight'); // admin: tercera pestaña Blog
    await expect(page.getByRole('tab', { name: 'Blog' })).toBeFocused();
    await page.keyboard.press('ArrowRight'); // circular
    await expect(page.getByRole('tab', { name: /Productos/ })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Blog' })).toBeFocused();
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

  test('/admin/ayuda renderiza la guía del administrador (noindex) y el panel enlaza a ella', async ({ page, request }) => {
    const html = await (await request.get('/admin/ayuda')).text();
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('Guía del administrador');
    expect(html).toContain('Subir PDF');
    await mockApi(page, { role: 'editor' });
    await openAdmin(page);
    await expect(page.locator('[data-admin-help]')).toHaveAttribute('href', '/admin/ayuda');
    await page.locator('[data-admin-help]').click();
    await expect(page.locator('[data-admin-help-page] h1')).toContainText('Guía del administrador');
    await expect(page.getByRole('link', { name: 'Volver al panel' })).toHaveAttribute('href', '/admin');
  });

  test('admin: la pestaña Blog lista los artículos y "Editar" guarda con PUT {sha, frontmatter, body}', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'admin' });
    await openAdmin(page);
    await page.getByRole('tab', { name: 'Blog' }).click();
    await expect(page.locator('[data-admin-post]')).toHaveCount(2);
    await expect(page.locator('[data-admin-post="como-cuidar-la-bateria"]')).toContainText('Baterías');
    await expect(page.locator('[data-admin-post="necesito-licencia"] td[data-label="Foto"]')).toHaveText('Sí');
    await expect(page.locator('[data-admin-post="como-cuidar-la-bateria"] td[data-label="Foto"]')).toHaveText('No');
    await expect(page.locator('[data-admin-post="como-cuidar-la-bateria"]').getByRole('link', { name: /Ver/ })).toHaveAttribute('href', '/blog/como-cuidar-la-bateria');

    await page.getByRole('button', { name: 'Editar artículo Cómo cuidar la batería' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Editar artículo: Cómo cuidar la batería');
    await expect(dialog.getByLabel('Slug (URL)')).toHaveValue('como-cuidar-la-bateria');
    await expect(dialog.getByLabel('Slug (URL)')).toHaveAttribute('readonly', '');
    await expect(dialog.getByLabel('Texto del artículo (Markdown)')).toHaveValue(/Carga después de cada uso/);
    await expect(dialog).toContainText('min de lectura');
    await dialog.getByLabel('Título', { exact: true }).fill('Cómo cuidar la batería (2026)');
    await dialog.getByLabel('Fecha de actualización (opcional)').fill('2026-11-04');
    await dialog.getByRole('checkbox', { name: /Tigre Test/ }).check();
    await dialog.getByLabel('Texto del artículo (Markdown)').fill('Texto nuevo con **negrita**.\n\n## Sección\n\n- uno');
    await dialog.getByLabel('Motivo (opcional)').fill('revisión e2e');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toBeHidden();
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.path).toBe('/blog/como-cuidar-la-bateria');
    expect(put.body).toEqual({
      sha: 'sha-bateria-1',
      reason: 'revisión e2e',
      frontmatter: {
        title: 'Cómo cuidar la batería (2026)',
        description: 'Guía práctica.',
        category: 'baterias',
        publishedAt: '2026-10-27T08:00:00.000Z',
        updatedAt: '2026-11-04T08:00:00.000Z',
        author: 'Equipo Raiden',
        relatedProducts: ['aguila-test', 'tigre-test'],
      },
      body: 'Texto nuevo con **negrita**.\n\n## Sección\n\n- uno',
    });
    await expect(page.locator('[data-deploy-banner]')).toBeVisible();
    await expect(page.locator('[data-admin-post="como-cuidar-la-bateria"]')).toContainText('Cómo cuidar la batería (2026)');

    // Borrar exige el slug y envía DELETE {sha}
    await page.getByRole('button', { name: 'Borrar artículo ¿Necesito licencia?' }).click();
    const del = page.getByRole('dialog');
    await expect(del.getByRole('button', { name: 'Borrar', exact: true })).toBeDisabled();
    await del.getByLabel(/para confirmar/).fill('necesito-licencia');
    await del.getByRole('button', { name: 'Borrar', exact: true }).click();
    await expect(del).toBeHidden();
    expect(calls.find((c) => c.method === 'DELETE')).toMatchObject({ path: '/blog/necesito-licencia', body: { sha: 'sha-licencia-1' } });
    await expect(page.locator('[data-admin-post]')).toHaveCount(1);
  });

  test('admin: "Nuevo artículo" propone el slug desde el título, la foto va por ruta (sin subida) y publica con PUT sin sha', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'admin' });
    await openAdmin(page);
    await page.getByRole('tab', { name: 'Blog' }).click();
    await page.getByRole('button', { name: 'Nuevo artículo' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Nuevo artículo');
    // Ningún control de subida de imágenes en el panel (ADR-023: las fotos van por git)
    await expect(dialog.locator('input[type="file"]')).toHaveCount(0);
    await dialog.getByLabel('Título', { exact: true }).fill('¿Cómo elegir una bicimoto eléctrica?');
    await expect(dialog.getByLabel('Slug (URL)')).toHaveValue('como-elegir-una-bicimoto-electrica');
    await dialog.getByLabel(/Descripción/).fill('Factores a considerar.');
    await dialog.getByLabel('Categoría').selectOption('compra');
    await dialog.getByLabel('Texto del artículo (Markdown)').fill('Mira la batería y el motor.');

    // Foto por ruta: se propone ~/assets/blog/<slug>.webp; una ruta fuera de src/assets/blog se rechaza en local
    await dialog.getByRole('button', { name: 'Añadir foto (por ruta)' }).click();
    const src = dialog.getByLabel('Foto: ruta');
    await expect(src).toHaveValue('~/assets/blog/como-elegir-una-bicimoto-electrica.webp');
    await src.fill('~/assets/products/golden-eagle-negro.webp');
    await dialog.getByLabel('Foto: texto alternativo').fill('Persona comparando bicimotos');
    await dialog.getByRole('button', { name: 'Publicar artículo' }).click();
    await expect(dialog.getByRole('alert')).toContainText('~/assets/blog/<nombre>.webp');
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
    await src.fill('~/assets/blog/como-elegir-una-bicimoto-electrica.webp');
    await dialog.getByLabel('Foto: ancho').fill('1600');
    await dialog.getByLabel('Foto: alto').fill('800');

    await dialog.getByRole('button', { name: 'Publicar artículo' }).click();
    await expect(dialog).toBeHidden();
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.path).toBe('/blog/como-elegir-una-bicimoto-electrica');
    const body = put.body as { sha?: string; frontmatter: BlogEntry['frontmatter']; body: string };
    expect(body.sha).toBeUndefined();
    expect(body.frontmatter.title).toBe('¿Cómo elegir una bicimoto eléctrica?');
    expect(body.frontmatter.category).toBe('compra');
    expect(body.frontmatter.author).toBe('Equipo Raiden');
    expect(body.frontmatter.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T08:00:00\.000Z$/);
    expect(body.frontmatter.image).toEqual({ src: '~/assets/blog/como-elegir-una-bicimoto-electrica.webp', alt: 'Persona comparando bicimotos', width: 1600, height: 800 });
    expect(body.frontmatter.relatedProducts).toEqual([]);
    expect(body.body).toBe('Mira la batería y el motor.');
    expect(calls.filter((c) => c.path === '/uploads')).toHaveLength(0);
    await expect(page.locator('[data-admin-post]')).toHaveCount(3);
  });

  test('admin: el editor de artículo valida en local (sin petición) y muestra los details de un 422 del servidor', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'admin', writeError: { status: 422, body: { code: 'validation', error: 'El artículo no es válido', details: ['relatedProducts desconocido: zz'] } } });
    await openAdmin(page);
    await page.getByRole('tab', { name: 'Blog' }).click();
    await page.getByRole('button', { name: 'Nuevo artículo' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Publicar artículo' }).click();
    await expect(dialog.getByRole('alert')).toContainText('No se ha guardado');
    await expect(dialog.getByRole('alert')).toContainText('slug');
    await expect(dialog.getByRole('alert')).toContainText('title es obligatorio');
    await expect(dialog.getByRole('alert')).toBeFocused();
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
    await dialog.getByLabel('Título', { exact: true }).fill('Precios en euros');
    await dialog.getByLabel(/Descripción/).fill('d');
    await dialog.getByLabel('Texto del artículo (Markdown)').fill('Cuesta 300 € con IVA');
    await dialog.getByRole('button', { name: 'Publicar artículo' }).click();
    await expect(dialog.getByRole('alert')).toContainText('España/EUR');
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
    await dialog.getByLabel('Texto del artículo (Markdown)').fill('Cuesta S/ 1,200 con IGV');
    await dialog.getByRole('button', { name: 'Publicar artículo' }).click();
    await expect(dialog.getByRole('alert')).toContainText('relatedProducts desconocido: zz');
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    await expect(page.locator('[data-deploy-banner]')).toHaveCount(0);
  });

  test('admin: el editor de producto tiene Manual, Ficha técnica y Video; normaliza la URL de YouTube y "Subir PDF" rellena el campo', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'admin' });
    await openAdmin(page);
    await page.getByRole('button', { name: 'Editar ficha de Águila Test' }).click();
    const dialog = page.getByRole('dialog');
    const manual = dialog.getByLabel('Manual de uso (PDF)');
    const datasheet = dialog.getByLabel('Ficha técnica (PDF)');
    const video = dialog.getByLabel('Video de YouTube');
    await expect(manual).toHaveValue('');
    await expect(datasheet).toHaveValue('');
    await expect(video).toHaveValue('');

    // Un enlace que no es de YouTube se rechaza en local, sin petición
    await video.fill('https://vimeo.com/123');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Video de YouTube');
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
    await manual.fill('docs/sin-barra.pdf');
    await video.fill('https://youtu.be/dQw4w9WgXcQ?si=abc');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Manual de uso (PDF)');
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);

    // Subir PDF: POST /uploads con la ruta blanca y el campo se rellena con /docs/<slug>-manual.pdf
    await dialog.locator('[data-admin-pdf-upload="manual"] input[type="file"]').setInputFiles({ name: 'manual.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%fake\n') });
    await expect(manual).toHaveValue('/docs/aguila-test-manual.pdf');
    await expect(dialog.locator('[data-admin-pdf-upload="manual"]')).toContainText('manual.pdf subido');
    const upload = calls.find((c) => c.method === 'POST' && c.path === '/uploads')!;
    expect(upload.body).toMatchObject({ path: 'public/docs/aguila-test-manual.pdf', contentBase64: Buffer.from('%PDF-1.4\n%fake\n').toString('base64') });
    await datasheet.fill('https://example.com/ficha.pdf');

    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toBeHidden();
    const put = calls.find((c) => c.method === 'PUT')!;
    const data = (put.body as { data: Product }).data;
    expect(data.manualUrl).toBe('/docs/aguila-test-manual.pdf');
    expect(data.datasheetUrl).toBe('https://example.com/ficha.pdf');
    expect(data.videoUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(data.specs).toEqual(products[0]!.data.specs);
    expect(data.related).toEqual(['tigre-test']);
    expect(data.images).toEqual(products[0]!.data.images);
    // Los campos no se duplican en el JSON avanzado al reabrir
    await page.getByRole('button', { name: 'Editar ficha de Águila Test' }).click();
    const again = page.getByRole('dialog');
    await expect(again.getByLabel('Video de YouTube')).toHaveValue('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await expect(again.getByLabel('JSON avanzado')).not.toHaveValue(/videoUrl/);
    await expect(again.getByLabel('JSON avanzado')).not.toHaveValue(/"images"/);
  });

  test('admin: crear un producto de principio a fin — duplicar, cambiar fotos por ruta (sin subida), precios y guardar oculto con PUT sin sha', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'admin' });
    await openAdmin(page);
    await page.getByRole('button', { name: 'Nuevo producto' }).click();
    const dup = page.getByRole('dialog');
    await dup.getByLabel('Slug nuevo').fill('storm-x2');
    await dup.getByLabel('Nombre').fill('Storm X2');
    await dup.getByRole('button', { name: 'Continuar al editor' }).click();
    const editor = page.getByRole('dialog');
    await expect(editor).toContainText('Nuevo producto: Storm X2');
    // Sin subida de imágenes: solo el selector de PDF del manual y de la ficha
    await expect(editor.locator('input[type="file"]')).toHaveCount(2);
    // Las fotos heredadas de la plantilla se ven como rutas editables
    const src = editor.getByLabel('Foto 1: ruta');
    await expect(src).toHaveValue('~/assets/test.svg');
    await src.fill('foto-sin-ruta.webp');
    await editor.getByRole('button', { name: 'Guardar' }).click();
    await expect(editor.getByRole('alert')).toContainText('foto 1: la ruta debe empezar por ~/assets/');
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
    await src.fill('~/assets/products/storm-x2-negro.webp');
    await editor.getByLabel('Foto 1: texto alternativo').fill('Storm X2 en color negro');
    await editor.getByLabel('Foto 1: ancho').fill('2020');
    await editor.getByLabel('Foto 1: alto').fill('2486');
    await editor.getByRole('button', { name: 'Añadir foto (por ruta)' }).click();
    await editor.getByLabel('Foto 2: ruta').fill('~/assets/products/storm-x2-rojo.webp');
    await editor.getByLabel('Foto 2: texto alternativo').fill('Storm X2 en color rojo');
    await editor.getByLabel('Foto 2: ancho').fill('2020');
    await editor.getByLabel('Foto 2: alto').fill('2486');
    await editor.getByLabel('Subtítulo').fill('Bicimoto urbana');
    await editor.getByRole('checkbox', { name: /Oculto/ }).check();
    await editor.getByRole('button', { name: 'Guardar' }).click();
    // El mock no conoce storm-x2 (404) pero la petición ya es la correcta
    await expect(editor.getByRole('alert')).toContainText('No existe');
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.path).toBe('/products/storm-x2');
    const body = put.body as { sha?: string; data: Product };
    expect(body.sha).toBeUndefined();
    expect(body.data.slug).toBe('storm-x2');
    expect(body.data.name).toBe('Storm X2');
    expect(body.data.subtitle).toBe('Bicimoto urbana');
    expect(body.data.hidden).toBe(true);
    expect(body.data.isHero).toBeUndefined();
    expect(body.data.images).toEqual([
      { src: '~/assets/products/storm-x2-negro.webp', alt: 'Storm X2 en color negro', width: 2020, height: 2486 },
      { src: '~/assets/products/storm-x2-rojo.webp', alt: 'Storm X2 en color rojo', width: 2020, height: 2486 },
    ]);
    expect(body.data.specs).toEqual(products[0]!.data.specs);
    expect(body.data.variants.find((v) => v.isDefault)?.id).toBe('estandar');
    expect(calls.filter((c) => c.path === '/uploads')).toHaveLength(0);
  });

  test('editor: el API de blog y subidas responde 403 (el mock replica al servidor) y el panel no lo llama', async ({ page }) => {
    const { calls } = await mockApi(page, { role: 'editor' });
    await openAdmin(page);
    expect(calls.some((c) => c.path.startsWith('/blog') || c.path === '/uploads')).toBe(false);
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/admin/blog', { credentials: 'same-origin' });
      return { status: r.status, body: (await r.json()) as { code: string } };
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('forbidden');
  });

  test('axe sin violaciones serious/critical en login, cambio de contraseña, vista admin (tabla, accesos) y con el editor abierto', async ({ page }) => {
    const audit = async (label: string) => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
      const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }));
      expect(blocking, `violaciones serious/critical (${label})`).toEqual([]);
    };
    await mockApi(page, { role: 'admin', loggedOut: true });
    await page.goto('/admin');
    await expect(page.locator('[data-admin-login]')).toBeVisible();
    await audit('login');
    await page.unroute('**/api/admin/**');
    await mockApi(page, { role: 'admin', mustChange: true });
    await page.goto('/admin');
    await expect(page.locator('[data-admin-must-change]')).toBeVisible();
    await audit('cambio de contraseña obligatorio');
    await page.unroute('**/api/admin/**');
    await mockApi(page, { role: 'admin' });
    await openAdmin(page);
    await page.waitForLoadState('networkidle');
    await audit('tabla');
    await page.locator('[data-price-input="aguila-test:estandar"]').fill('1300');
    await audit('precio editado');
    await page.getByRole('button', { name: 'Editar ficha de Águila Test' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await audit('editor');
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Blog' }).click();
    await expect(page.locator('[data-admin-post]')).toHaveCount(2);
    await audit('blog');
    await page.getByRole('button', { name: 'Editar artículo Cómo cuidar la batería' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await audit('editor de artículo');
  });
});
