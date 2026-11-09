import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser, CommitInfo } from '../../src/domain/admin';
import type { Part, Product } from '../../src/domain/types';
import { pen } from '../../src/domain/money';
import { ConflictError, serializeJson, type ContentStore, type StoredFile } from '../../functions/api/admin/_lib/github';
import { DIRS, deleteEntry, deployStatus, getCatalog, mapDeployState, me, patchEntry, putEntry, referencesTo } from '../../functions/api/admin/_lib/handlers';
import { HttpError } from '../../functions/api/admin/_lib/http';
import { makePart, makeProduct, premiumVariant, variant } from './fixtures';

/** Handlers del panel (ADR-018) con un almacén en memoria: política, concurrencia por sha, validación y referencias. */

interface MemoryStore extends ContentStore {
  files: Map<string, StoredFile>;
  writes: { path: string; content: string; message: string; sha?: string }[];
  removals: { path: string; message: string; sha: string }[];
}

function memoryStore(seed: Record<string, unknown>): MemoryStore {
  let counter = 0;
  const nextSha = () => `sha-${++counter}`;
  const files = new Map<string, StoredFile>();
  for (const [path, data] of Object.entries(seed)) files.set(path, { path, sha: nextSha(), content: serializeJson(data) });
  const commit = (message: string): CommitInfo => ({ sha: `commit-${++counter}`, url: `https://github.com/x/y/commit/${counter}`, message });
  const store: MemoryStore = {
    files,
    writes: [],
    removals: [],
    async list(dir) {
      return [...files.values()].filter((f) => f.path.startsWith(dir + '/')).map((f) => ({ path: f.path, sha: f.sha, name: f.path.slice(dir.length + 1) }));
    },
    async read(path) {
      return files.get(path) ?? null;
    },
    async write(path, content, message, sha) {
      const existing = files.get(path);
      if (!sha && existing) throw new ConflictError('ya existe');
      if (sha && (!existing || existing.sha !== sha)) throw new ConflictError('does not match');
      store.writes.push({ path, content, message, sha });
      const file = { path, sha: nextSha(), content };
      files.set(path, file);
      return { sha: file.sha, commit: commit(message) };
    },
    async remove(path, message, sha) {
      const existing = files.get(path);
      if (!existing || existing.sha !== sha) throw new ConflictError('does not match');
      store.removals.push({ path, message, sha });
      files.delete(path);
      return { commit: commit(message) };
    },
  };
  return store;
}

const P = (slug: string) => `${DIRS.products}/${slug}.json`;
const R = (slug: string) => `${DIRS.repuestos}/${slug}.json`;

const aguila = makeProduct({ slug: 'aguila-test', name: 'Águila Test', featured: 20, variants: [variant({ isDefault: true }), premiumVariant()], accessories: ['motor-test'] });
const tigre = makeProduct({ slug: 'tigre-test', name: 'Tigre Test', featured: 90, variants: [variant({ isDefault: true })], related: ['aguila-test'], hidden: true });
const motor = makePart({ slug: 'motor-test', name: 'Motor de prueba', compatibleWith: ['aguila-test'] });
const cargador = makePart({ id: 'rp-cargador', slug: 'cargador-test', name: 'Cargador de prueba', kind: 'cargador', price: pen(9000) });

const admin: AdminUser = { email: 'diego@example.com', role: 'admin', admins: ['diego@example.com'], editors: ['wiliam@example.com'], localMode: true, branch: 'main' };
const editor: AdminUser = { ...admin, email: 'wiliam@example.com', role: 'editor' };

let store: MemoryStore;
const asAdmin = () => ({ store, user: admin });
const asEditor = () => ({ store, user: editor });

const fails = async (p: Promise<unknown>): Promise<HttpError> => {
  const e = await p.then(() => null).catch((err: unknown) => err);
  expect(e).toBeInstanceOf(HttpError);
  return e as HttpError;
};

beforeEach(() => {
  store = memoryStore({ [P('aguila-test')]: aguila, [P('tigre-test')]: tigre, [R('motor-test')]: motor, [R('cargador-test')]: cargador });
});

describe('me y catálogo', () => {
  it('me devuelve el usuario del middleware; al editor no le muestra la lista de administradores', () => {
    expect(me({ user: admin })).toBe(admin);
    expect(me({ user: editor })).toEqual({ ...editor, admins: [], editors: [editor.email] });
  });

  it('catalog incluye los ocultos, con sha y ruta; productos por featured desc y repuestos por nombre', async () => {
    const cat = await getCatalog(asEditor());
    expect(cat.branch).toBe('main');
    expect(cat.products.map((p) => p.data.slug)).toEqual(['tigre-test', 'aguila-test']);
    expect(cat.products[0]?.data.hidden).toBe(true);
    expect(cat.products[0]).toMatchObject({ sha: 'sha-2', path: P('tigre-test') });
    expect(cat.repuestos.map((r) => r.data.slug)).toEqual(['cargador-test', 'motor-test']);
  });
});

describe('PATCH', () => {
  it('editor cambia el precio: commit "chore(catalog): actualizar <slug> por <email>" con el cambio en el cuerpo', async () => {
    const res = await patchEntry(asEditor(), 'products', 'aguila-test', { sha: 'sha-1', prices: { estandar: 125000 }, reason: 'Subida de proveedor' });
    expect(res.commit?.message).toBe('chore(catalog): actualizar aguila-test por wiliam@example.com\n\nEstándar: 120000 → 125000\n\nMotivo: Subida de proveedor');
    expect(res.data.variants[0]?.price.amount).toBe(125000);
    expect(res.data.variants[1]?.price.amount).toBe(150000);
    expect(res.sha).not.toBe('sha-1');
    expect(res.path).toBe(P('aguila-test'));
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0]).toMatchObject({ path: P('aguila-test'), sha: 'sha-1' });
    expect(store.writes[0]?.content.endsWith('}\n')).toBe(true);
    expect((JSON.parse(store.writes[0]!.content) as Product).variants[0]?.price.amount).toBe(125000);
  });

  it('editor oculta un repuesto', async () => {
    const res = await patchEntry(asEditor(), 'repuestos', 'motor-test', { sha: 'sha-3', hidden: true });
    expect(res.data.hidden).toBe(true);
    expect(res.commit?.message).toContain('ocultar');
  });

  it('clave extra → 422 validation con details y sin escribir', async () => {
    const err = await fails(patchEntry(asEditor(), 'products', 'aguila-test', { sha: 'sha-1', name: 'Otro nombre' }));
    expect(err).toMatchObject({ status: 422, code: 'validation' });
    expect(err.details).toEqual(['campo no permitido en PATCH: name']);
    expect(store.writes).toHaveLength(0);
  });

  it('sha desfasado → 409 conflict', async () => {
    const err = await fails(patchEntry(asEditor(), 'products', 'aguila-test', { sha: 'sha-viejo', prices: { estandar: 125000 } }));
    expect(err).toMatchObject({ status: 409, code: 'conflict' });
    expect(store.writes).toHaveLength(0);
  });

  it('Premium más barata que Estándar → 422', async () => {
    const err = await fails(patchEntry(asAdmin(), 'products', 'aguila-test', { sha: 'sha-1', prices: { premium: 100000 } }));
    expect(err.status).toBe(422);
    expect(err.details?.[0]).toMatch(/Premium/);
  });

  it('sin cambios efectivos → 200 con el estado actual y sin commit', async () => {
    const res = await patchEntry(asEditor(), 'products', 'aguila-test', { sha: 'sha-1', prices: { estandar: 120000 } });
    expect(res.commit).toBeNull();
    expect(res.sha).toBe('sha-1');
    expect(store.writes).toHaveLength(0);
  });

  it('sin sha → 400; ficha inexistente → 404', async () => {
    expect((await fails(patchEntry(asEditor(), 'products', 'aguila-test', { prices: {} }))).status).toBe(400);
    expect((await fails(patchEntry(asEditor(), 'products', 'no-existe', { sha: 'x' }))).status).toBe(404);
  });

  it('__proto__ en el cuerpo o en prices → 422 sin escribir (JSON.parse crea una clave propia, no un prototipo)', async () => {
    const body = JSON.parse('{"sha":"sha-1","__proto__":{"role":"admin"},"prices":{"estandar":125000}}') as Record<string, unknown>;
    const err = await fails(patchEntry(asEditor(), 'products', 'aguila-test', body));
    expect(err).toMatchObject({ status: 422 });
    expect(err.details).toEqual(['campo no permitido en PATCH: __proto__']);
    const body2 = JSON.parse('{"sha":"sha-1","prices":{"__proto__":{"estandar":1},"constructor":5}}') as Record<string, unknown>;
    const err2 = await fails(patchEntry(asEditor(), 'products', 'aguila-test', body2));
    expect(err2.details).toEqual(expect.arrayContaining([expect.stringMatching(/variante desconocida: __proto__/), expect.stringMatching(/variante desconocida: constructor/)]));
    expect(store.writes).toHaveLength(0);
  });

  it('prices que no es un objeto plano (array, texto, número) → 422', async () => {
    for (const prices of [[125000], 'estandar=125000', 125000, true]) {
      const err = await fails(patchEntry(asEditor(), 'products', 'aguila-test', { sha: 'sha-1', prices }));
      expect(err.status, JSON.stringify(prices)).toBe(422);
      expect(err.details?.some((d) => /prices debe ser un objeto/.test(d)), JSON.stringify(prices)).toBe(true);
    }
    expect(store.writes).toHaveLength(0);
  });

  it('el editor no puede colar precio con currency ni tocar la variante por otra vía: solo amount cambia', async () => {
    const res = await patchEntry(asEditor(), 'products', 'aguila-test', { sha: 'sha-1', prices: { premium: 160000 } });
    const written = JSON.parse(store.writes[0]!.content) as Product;
    expect(written.variants[1]?.price).toEqual({ amount: 160000, currency: 'PEN' });
    const { variants: _v, ...restWritten } = written;
    const { variants: _o, ...restOriginal } = aguila;
    expect(restWritten).toEqual(restOriginal);
    expect(res.data.variants[0]).toEqual(aguila.variants[0]);
  });

  it('mostrar (hidden: false) elimina la clave del JSON escrito', async () => {
    const res = await patchEntry(asEditor(), 'products', 'tigre-test', { sha: 'sha-2', hidden: false });
    expect(res.commit?.message).toContain('mostrar');
    expect('hidden' in (JSON.parse(store.writes[0]!.content) as Record<string, unknown>)).toBe(false);
  });
});

describe('PUT', () => {
  it('editor → 403 sin tocar el store', async () => {
    const err = await fails(putEntry(asEditor(), 'products', 'aguila-test', { sha: 'sha-1', data: aguila }));
    expect(err).toMatchObject({ status: 403, code: 'forbidden' });
    expect(store.writes).toHaveLength(0);
  });

  it('crear sin sha → OK con commit "crear"', async () => {
    const nuevo = makeProduct({ slug: 'nuevo-test', name: 'Nuevo', variants: [variant({ isDefault: true })], related: ['aguila-test'], accessories: ['cargador-test'] });
    const res = await putEntry(asAdmin(), 'products', 'nuevo-test', { data: nuevo, reason: 'Alta de modelo' });
    expect(res.commit?.message).toBe('chore(catalog): crear nuevo-test por diego@example.com\n\nMotivo: Alta de modelo');
    expect(res.path).toBe(P('nuevo-test'));
    expect(res.data.slug).toBe('nuevo-test');
    expect(store.files.has(P('nuevo-test'))).toBe(true);
    expect(store.writes[0]?.sha).toBeUndefined();
  });

  it('crear sobre un fichero existente → 409', async () => {
    const err = await fails(putEntry(asAdmin(), 'products', 'aguila-test', { data: aguila }));
    expect(err).toMatchObject({ status: 409, code: 'conflict' });
    expect(store.writes).toHaveLength(0);
  });

  it('actualizar con sha → OK; sha desfasado → 409; inexistente con sha → 404', async () => {
    const res = await putEntry(asAdmin(), 'products', 'aguila-test', { sha: 'sha-1', data: { ...aguila, name: 'Águila renombrada' } });
    expect(res.commit?.message).toMatch(/^chore\(catalog\): actualizar aguila-test por diego@example.com$/);
    expect(res.data.name).toBe('Águila renombrada');
    expect((await fails(putEntry(asAdmin(), 'products', 'aguila-test', { sha: 'sha-1', data: aguila }))).status).toBe(409);
    expect((await fails(putEntry(asAdmin(), 'products', 'fantasma', { sha: 'sha-1', data: { ...aguila, slug: 'fantasma' } }))).status).toBe(404);
  });

  it('inválido → 422 con details (esquema + reglas + referencias)', async () => {
    const malo = { ...makeProduct({ slug: 'malo-test', variants: [variant(), premiumVariant({ price: pen(1000) })], related: ['inexistente'] }), extra: 1 } as unknown as Product;
    const err = await fails(putEntry(asAdmin(), 'products', 'malo-test', { data: malo }));
    expect(err).toMatchObject({ status: 422, code: 'validation' });
    expect(err.details?.some((d) => /extra/.test(d))).toBe(true); // .strict()
    const sinExtra = { ...malo } as Record<string, unknown>;
    delete sinExtra.extra;
    const err2 = await fails(putEntry(asAdmin(), 'products', 'malo-test', { data: sinExtra }));
    expect(err2.details).toEqual(expect.arrayContaining([expect.stringMatching(/isDefault/), expect.stringMatching(/Premium/), expect.stringMatching(/related desconocido: inexistente/)]));
    expect(store.writes).toHaveLength(0);
  });

  it('slug del cuerpo distinto de la ruta o sin data → 400', async () => {
    expect((await fails(putEntry(asAdmin(), 'products', 'otro-slug', { data: aguila }))).status).toBe(400);
    expect((await fails(putEntry(asAdmin(), 'products', 'aguila-test', { sha: 'sha-1' }))).status).toBe(400);
  });

  it('hidden: false en PUT no se persiste; hidden: true sí; Premium < Estándar e isDefault ≠ 1 → 422', async () => {
    const visible = await putEntry(asAdmin(), 'products', 'tigre-test', { sha: 'sha-2', data: { ...tigre, hidden: false } });
    expect('hidden' in visible.data).toBe(false);
    expect('hidden' in (JSON.parse(store.writes[0]!.content) as Record<string, unknown>)).toBe(false);
    const oculto = await putEntry(asAdmin(), 'products', 'tigre-test', { sha: visible.sha, data: { ...tigre, hidden: true } });
    expect(oculto.data.hidden).toBe(true);

    const premiumBarata = { ...aguila, variants: [variant({ isDefault: true, price: pen(150000) }), premiumVariant({ price: pen(140000) })] };
    const err = await fails(putEntry(asAdmin(), 'products', 'aguila-test', { sha: 'sha-1', data: premiumBarata }));
    expect(err.status).toBe(422);
    expect(err.details?.some((d) => /Premium/.test(d))).toBe(true);
    const dosDefault = { ...aguila, variants: [variant({ isDefault: true }), premiumVariant({ isDefault: true })] };
    const err2 = await fails(putEntry(asAdmin(), 'products', 'aguila-test', { sha: 'sha-1', data: dosDefault }));
    expect(err2.details?.some((d) => /isDefault \(hay 2\)/.test(d))).toBe(true);
    expect(store.writes).toHaveLength(2);
  });

  it('data.slug con rutas raras nunca llega al almacén aunque coincida con el :slug', async () => {
    // El :slug lo filtra assertSlug en la ruta; aquí se comprueba la segunda barrera (reglas del dominio)
    for (const slug of ['../secrets', 'a/b', 'Golden', 'ñandu', '.github']) {
      const err = await fails(putEntry(asAdmin(), 'products', slug, { data: { ...aguila, slug } }));
      expect(err.status, slug).toBe(422);
      expect(err.details?.some((d) => /kebab-case/.test(d)), slug).toBe(true);
    }
    expect(store.writes).toHaveLength(0);
  });

  it('repuestos: crear válido y compatibleWith desconocido → 422', async () => {
    const parte = makePart({ id: 'rp-nuevo', slug: 'freno-test', name: 'Freno', kind: 'frenos', compatibleWith: ['aguila-test'] });
    const res = await putEntry(asAdmin(), 'repuestos', 'freno-test', { data: parte });
    expect(res.path).toBe(R('freno-test'));
    const err = await fails(putEntry(asAdmin(), 'repuestos', 'freno-dos', { data: { ...parte, slug: 'freno-dos', compatibleWith: ['nada'] } }));
    expect(err.details).toEqual(['compatibleWith desconocido: nada']);
  });
});

describe('DELETE', () => {
  it('editor → 403 sin tocar el store', async () => {
    const err = await fails(deleteEntry(asEditor(), 'repuestos', 'cargador-test', { sha: 'sha-4' }));
    expect(err).toMatchObject({ status: 403, code: 'forbidden' });
    expect(store.removals).toHaveLength(0);
    expect(store.files.has(R('cargador-test'))).toBe(true);
  });

  it('con referencias → 409 con details de quién lo referencia', async () => {
    const err = await fails(deleteEntry(asAdmin(), 'products', 'aguila-test', { sha: 'sha-1' }));
    expect(err).toMatchObject({ status: 409, code: 'conflict' });
    expect(err.details).toEqual(['producto tigre-test (related)', 'repuesto motor-test (compatibleWith)']);
    expect(store.removals).toHaveLength(0);
    const err2 = await fails(deleteEntry(asAdmin(), 'repuestos', 'motor-test', { sha: 'sha-3' }));
    expect(err2.details).toEqual(['producto aguila-test (accessories)']);
  });

  it('limpio → OK con commit "borrar"', async () => {
    const res = await deleteEntry(asAdmin(), 'repuestos', 'cargador-test', { sha: 'sha-4', reason: 'Descatalogado' });
    expect(res.path).toBe(R('cargador-test'));
    expect(res.commit.message).toBe('chore(catalog): borrar cargador-test por diego@example.com\n\nMotivo: Descatalogado');
    expect(store.files.has(R('cargador-test'))).toBe(false);
  });

  it('sha desfasado → 409; inexistente → 404', async () => {
    expect((await fails(deleteEntry(asAdmin(), 'repuestos', 'cargador-test', { sha: 'otro' }))).status).toBe(409);
    expect((await fails(deleteEntry(asAdmin(), 'repuestos', 'no-existe', { sha: 'x' }))).status).toBe(404);
  });

  it('referencesTo es puro', () => {
    const cat = { products: [{ data: aguila, sha: '', path: '' }, { data: tigre, sha: '', path: '' }], repuestos: [{ data: motor, sha: '', path: '' }] };
    expect(referencesTo('products', 'tigre-test', cat)).toEqual([]);
    expect(referencesTo('repuestos', 'motor-test', cat)).toEqual(['producto aguila-test (accessories)']);
  });
});

describe('deploy', () => {
  it('sin credenciales → available: false y sin llamar a la API', async () => {
    const fetchImpl = vi.fn();
    await expect(deployStatus({ CF_API_TOKEN: 'x' }, fetchImpl as unknown as typeof fetch)).resolves.toEqual({ available: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('con credenciales mapea el último despliegue', async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc1/pages/projects/raiden/deployments?per_page=1&env=production');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      return new Response(
        JSON.stringify({
          success: true,
          result: [{ url: 'https://abc.raiden.pages.dev', created_on: '2026-10-24T10:00:00Z', latest_stage: { name: 'deploy', status: 'success' }, deployment_trigger: { metadata: { commit_hash: 'deadbeef', commit_message: 'chore(catalog): actualizar x' } } }],
        }),
      );
    });
    const env = { CF_API_TOKEN: 'tok', CF_ACCOUNT_ID: 'acc1', CF_PAGES_PROJECT: 'raiden' };
    await expect(deployStatus(env, fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      available: true,
      state: 'success',
      createdAt: '2026-10-24T10:00:00Z',
      url: 'https://abc.raiden.pages.dev',
      commitSha: 'deadbeef',
      // commit_message no se reenvía: lleva el email del autor y el motivo del cambio
    });
  });

  it('errores de la API → available: false', async () => {
    const env = { CF_API_TOKEN: 'tok', CF_ACCOUNT_ID: 'acc1', CF_PAGES_PROJECT: 'raiden' };
    await expect(deployStatus(env, (async () => new Response('nope', { status: 403 })) as unknown as typeof fetch)).resolves.toEqual({ available: false });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(deployStatus(env, (async () => { throw new Error('red'); }) as unknown as typeof fetch)).resolves.toEqual({ available: false });
    warn.mockRestore();
  });

  it('mapDeployState', () => {
    expect(mapDeployState({ name: 'deploy', status: 'success' })).toBe('success');
    expect(mapDeployState({ name: 'build', status: 'success' })).toBe('building');
    expect(mapDeployState({ name: 'build', status: 'active' })).toBe('building');
    expect(mapDeployState({ name: 'deploy', status: 'idle' })).toBe('building');
    expect(mapDeployState({ name: 'queued', status: 'queued' })).toBe('queued');
    expect(mapDeployState({ name: 'build', status: 'failure' })).toBe('failure');
    expect(mapDeployState({ name: 'build', status: 'canceled' })).toBe('failure');
    expect(mapDeployState(undefined)).toBe('unknown');
  });
});
