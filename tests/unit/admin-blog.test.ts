import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser, BlogFrontmatter } from '../../src/domain/admin';
import { canPerform } from '../../src/domain/adminPolicy';
import { parseFrontmatter } from '../../src/domain/frontmatter';
import { BLOG_DIR, blogPath, deletePost, getPost, listPosts, putPost, serializePost } from '../../functions/api/admin/_lib/blog';
import { DIRS } from '../../functions/api/admin/_lib/handlers';
import { HttpError } from '../../functions/api/admin/_lib/http';
import type { Env } from '../../functions/api/admin/_lib/env';
import { onRequestGet as listRoute } from '../../functions/api/admin/blog/index';
import { onRequestDelete, onRequestGet, onRequestPut } from '../../functions/api/admin/blog/[slug]';
import { makeProduct, variant } from './fixtures';
import { memoryStore, type MemoryStore } from './memoryStore';

/** Blog en el panel (ADR-023): solo admin, concurrencia por sha, validación con blogSchema y frontmatter determinista. */

const admin: AdminUser = { email: 'diego@example.com', role: 'admin', admins: ['diego@example.com'], editors: ['wiliam@example.com'], localMode: true, branch: 'main' };
const editor: AdminUser = { ...admin, email: 'wiliam@example.com', role: 'editor' };

const fm = (over: Partial<BlogFrontmatter> = {}): BlogFrontmatter => ({
  title: 'Cómo cuidar la batería',
  description: 'Guía práctica.',
  category: 'baterias',
  publishedAt: '2026-10-27T08:00:00.000Z',
  author: 'Equipo Raiden',
  relatedProducts: ['aguila-test'],
  ...over,
});

const bateria = serializePost(fm(), 'Carga después de cada uso.\n\n## Resumen\n\nNunca la dejes vacía.');
const licencia = serializePost(fm({ title: '¿Necesito licencia?', category: 'legislacion', publishedAt: '2026-10-23T08:00:00.000Z', relatedProducts: [], image: { src: '~/assets/blog/licencia.webp', alt: 'Bicimoto', width: 1264, height: 848 } }), 'En general no.');

let store: MemoryStore;
const asAdmin = () => ({ store, user: admin });
const asEditor = () => ({ store, user: editor });

const fails = async (p: Promise<unknown>): Promise<HttpError> => {
  const e = await p.then(() => null).catch((err: unknown) => err);
  expect(e).toBeInstanceOf(HttpError);
  return e as HttpError;
};

beforeEach(() => {
  store = memoryStore({
    [blogPath('como-cuidar-la-bateria')]: bateria,
    [blogPath('necesito-licencia')]: licencia,
    [`${BLOG_DIR}/notas.txt`]: 'no es un artículo',
    [`${DIRS.products}/aguila-test.json`]: makeProduct({ slug: 'aguila-test', variants: [variant({ isDefault: true })] }),
  });
});

describe('política', () => {
  it('blog y upload son operaciones de administrador', () => {
    expect(canPerform('admin', 'blog')).toBe(true);
    expect(canPerform('admin', 'upload')).toBe(true);
    expect(canPerform('editor', 'blog')).toBe(false);
    expect(canPerform('editor', 'upload')).toBe(false);
  });

  it('el editor recibe 403 en listar, leer, guardar y borrar, sin tocar el almacén', async () => {
    const reads = vi.spyOn(store, 'read');
    for (const p of [listPosts(asEditor()), getPost(asEditor(), 'como-cuidar-la-bateria'), putPost(asEditor(), 'nuevo', { frontmatter: fm(), body: 'x' }), deletePost(asEditor(), 'como-cuidar-la-bateria', { sha: 'sha-1' })]) {
      expect(await fails(p)).toMatchObject({ status: 403, code: 'forbidden' });
    }
    expect(reads).not.toHaveBeenCalled();
    expect(store.writes).toHaveLength(0);
    expect(store.removals).toHaveLength(0);
  });
});

describe('lectura', () => {
  it('lista solo los .md, más reciente primero, con sha, ruta y si tienen foto', async () => {
    const list = await listPosts(asAdmin());
    expect(list.branch).toBe('main');
    expect(list.posts.map((p) => p.slug)).toEqual(['como-cuidar-la-bateria', 'necesito-licencia']);
    expect(list.posts[0]).toEqual({ slug: 'como-cuidar-la-bateria', title: 'Cómo cuidar la batería', category: 'baterias', publishedAt: '2026-10-27T08:00:00.000Z', author: 'Equipo Raiden', hasImage: false, sha: 'sha-1', path: blogPath('como-cuidar-la-bateria') });
    expect(list.posts[1]?.hasImage).toBe(true);
  });

  it('lee frontmatter validado + cuerpo + sha; inexistente → 404', async () => {
    const e = await getPost(asAdmin(), 'necesito-licencia');
    expect(e.frontmatter.image).toEqual({ src: '~/assets/blog/licencia.webp', alt: 'Bicimoto', width: 1264, height: 848 });
    expect(e.body).toBe('En general no.\n');
    expect(e.sha).toBe('sha-2');
    expect((await fails(getPost(asAdmin(), 'no-existe'))).status).toBe(404);
  });

  it('un artículo del repo que no pasa el esquema o cuyo YAML no se entiende → 502 con el fichero señalado', async () => {
    store.files.set(blogPath('roto'), { path: blogPath('roto'), sha: 'sha-x', content: '---\ntitle: "x"\n---\ncuerpo' });
    const err = await fails(getPost(asAdmin(), 'roto'));
    expect(err).toMatchObject({ status: 502, code: 'upstream' });
    expect(err.message).toContain(blogPath('roto'));
    store.files.set(blogPath('yaml'), { path: blogPath('yaml'), sha: 'sha-y', content: '---\ntitle: |\n  multi\n---\ncuerpo' });
    expect((await fails(getPost(asAdmin(), 'yaml'))).message).toMatch(/frontmatter/);
    expect((await fails(listPosts(asAdmin()))).status).toBe(502);
  });
});

describe('PUT', () => {
  it('crear sin sha escribe un frontmatter determinista y hace commit chore(blog): crear', async () => {
    const body = 'Texto nuevo.\r\n\r\n## Sección\r\n';
    const res = await putPost(asAdmin(), 'articulo-nuevo', { frontmatter: fm({ title: 'Nuevo', relatedProducts: ['aguila-test'] }), body, reason: 'Primer artículo' });
    expect(res.commit.message).toBe('chore(blog): crear articulo-nuevo por diego@example.com\n\nMotivo: Primer artículo');
    expect(res.path).toBe(blogPath('articulo-nuevo'));
    expect(res.slug).toBe('articulo-nuevo');
    expect(store.writes[0]?.sha).toBeUndefined();
    expect(store.writes[0]?.encoding).toBe('utf8');
    expect(store.writes[0]?.content).toBe(
      '---\ntitle: "Nuevo"\ndescription: "Guía práctica."\ncategory: "baterias"\npublishedAt: "2026-10-27T08:00:00.000Z"\nauthor: "Equipo Raiden"\nrelatedProducts: ["aguila-test"]\n---\n\nTexto nuevo.\n\n## Sección\n',
    );
    // Lo escrito lo entiende el lector y no lleva readingMinutes
    const back = parseFrontmatter(store.writes[0]!.content);
    expect(back.data).not.toHaveProperty('readingMinutes');
    expect(back.data.title).toBe('Nuevo');
  });

  it('actualizar con sha: la imagen va en bloque con orden fijo y updatedAt entre publishedAt y author', async () => {
    const res = await putPost(asAdmin(), 'como-cuidar-la-bateria', {
      sha: 'sha-1',
      frontmatter: fm({ updatedAt: '2026-11-04', image: { width: 1600, height: 900, alt: 'Batería', src: '~/assets/blog/como-cuidar-la-bateria.webp' } }),
      body: 'Actualizado.',
    });
    expect(res.commit.message).toBe('chore(blog): actualizar como-cuidar-la-bateria por diego@example.com');
    expect(store.writes[0]?.content).toBe(
      '---\ntitle: "Cómo cuidar la batería"\ndescription: "Guía práctica."\ncategory: "baterias"\npublishedAt: "2026-10-27T08:00:00.000Z"\nupdatedAt: "2026-11-04"\nauthor: "Equipo Raiden"\nimage:\n  src: "~/assets/blog/como-cuidar-la-bateria.webp"\n  alt: "Batería"\n  width: 1600\n  height: 900\nrelatedProducts: ["aguila-test"]\n---\n\nActualizado.\n',
    );
    expect(res.sha).not.toBe('sha-1');
  });

  it('sha desfasado → 409; crear sobre existente → 409; actualizar inexistente → 404', async () => {
    expect((await fails(putPost(asAdmin(), 'como-cuidar-la-bateria', { sha: 'viejo', frontmatter: fm(), body: 'x' }))).status).toBe(409);
    expect((await fails(putPost(asAdmin(), 'como-cuidar-la-bateria', { frontmatter: fm(), body: 'x' }))).status).toBe(409);
    expect((await fails(putPost(asAdmin(), 'fantasma', { sha: 'sha-1', frontmatter: fm(), body: 'x' }))).status).toBe(404);
    expect(store.writes).toHaveLength(0);
  });

  it('inválido → 422 con details (esquema, reglas y relatedProducts contra el catálogo real)', async () => {
    const err = await fails(putPost(asAdmin(), 'nuevo', { frontmatter: { ...fm({ relatedProducts: ['aguila-test', 'no-existe'] }), category: 'otra', readingMinutes: 3 }, body: 'Precio en €' }));
    expect(err).toMatchObject({ status: 422, code: 'validation' });
    expect(err.details).toEqual(expect.arrayContaining([expect.stringMatching(/^category/), expect.stringMatching(/readingMinutes/)]));
    const err2 = await fails(putPost(asAdmin(), 'nuevo', { frontmatter: fm({ relatedProducts: ['no-existe'] }), body: 'Precio en €' }));
    expect(err2.details).toEqual(['relatedProducts desconocido: no-existe', 'contiene referencias a España/EUR (€, EUR, carnet, IVA): usar S/, IGV, licencia']);
    expect(store.writes).toHaveLength(0);
  });

  it('cuerpo mal formado → 400', async () => {
    expect((await fails(putPost(asAdmin(), 'nuevo', { frontmatter: fm() }))).status).toBe(400);
    expect((await fails(putPost(asAdmin(), 'nuevo', { body: 'x' }))).status).toBe(400);
    expect((await fails(putPost(asAdmin(), 'nuevo', { sha: '', frontmatter: fm(), body: 'x' }))).status).toBe(400);
    expect((await fails(putPost(asAdmin(), 'nuevo', 'texto'))).status).toBe(400);
  });
});

describe('DELETE', () => {
  it('borra con sha correcto y commit chore(blog): borrar; sha desfasado → 409; inexistente → 404', async () => {
    const res = await deletePost(asAdmin(), 'necesito-licencia', { sha: 'sha-2', reason: 'Obsoleto' });
    expect(res.commit.message).toBe('chore(blog): borrar necesito-licencia por diego@example.com\n\nMotivo: Obsoleto');
    expect(store.files.has(blogPath('necesito-licencia'))).toBe(false);
    expect((await fails(deletePost(asAdmin(), 'como-cuidar-la-bateria', { sha: 'otro' }))).status).toBe(409);
    expect((await fails(deletePost(asAdmin(), 'no-existe', { sha: 'x' }))).status).toBe(404);
    expect((await fails(deletePost(asAdmin(), 'como-cuidar-la-bateria', {}))).status).toBe(400);
  });
});

describe('rutas: orden de comprobaciones', () => {
  type Ctx = Parameters<typeof onRequestPut>[0];
  const ctx = (request: Request, user: AdminUser, slug: unknown, env: Env = {}) =>
    ({ request, env, data: { user }, params: { slug }, functionPath: '', waitUntil: () => {}, passThroughOnException: () => {}, next: async () => new Response() }) as unknown as Ctx;

  it('editor → 403 en las cuatro rutas antes de leer el cuerpo y sin GITHUB_TOKEN', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    for (const handler of [onRequestGet, onRequestPut, onRequestDelete, listRoute as unknown as typeof onRequestPut]) {
      const request = new Request('https://x.test/api/admin/blog/como-cuidar-la-bateria', { method: 'PUT', body: '{"sha":"a"}', headers: { 'Content-Type': 'application/json' } });
      const text = vi.spyOn(request, 'text');
      const res = await handler(ctx(request, editor, 'como-cuidar-la-bateria', {}));
      expect(res.status).toBe(403);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      await expect(res.json()).resolves.toMatchObject({ code: 'forbidden' });
      expect(text).not.toHaveBeenCalled();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('admin: slug inválido → 400 y cuerpo no JSON → 400 antes de tocar GitHub; sin token → 500 config', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect((await onRequestPut(ctx(new Request('https://x.test', { method: 'PUT', body: '{}', headers: { 'Content-Type': 'application/json' } }), admin, '../x', { GITHUB_TOKEN: 't' }))).status).toBe(400);
    expect((await onRequestPut(ctx(new Request('https://x.test', { method: 'PUT', body: 'no-json', headers: { 'Content-Type': 'application/json' } }), admin, 'ok', { GITHUB_TOKEN: 't' }))).status).toBe(400);
    const res = await onRequestGet(ctx(new Request('https://x.test', { method: 'GET' }), admin, 'ok', {}));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ code: 'config' });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
