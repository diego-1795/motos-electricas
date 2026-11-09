import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '../../src/domain/admin';
import type { Env } from '../../functions/api/admin/_lib/env';
import { HttpError, MAX_BODY_BYTES, MAX_SLUG_LENGTH, assertSlug, errorResponse, json, readJsonBody } from '../../functions/api/admin/_lib/http';
import { entryRoutes } from '../../functions/api/admin/_lib/routes';

/** Capa HTTP del panel (ADR-018): slug seguro hacia GitHub, cuerpos acotados, errores sin fugas y orden de comprobaciones. */

const thrown = <T>(fn: () => T): HttpError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(HttpError);
    return e as HttpError;
  }
  throw new Error('no lanzó');
};

afterEach(() => vi.restoreAllMocks());

describe('assertSlug', () => {
  it('acepta kebab-case y rechaza todo lo que podría salirse de src/content/<kind>/', () => {
    expect(assertSlug('golden-eagle')).toBe('golden-eagle');
    expect(assertSlug('x1')).toBe('x1');
    const malos = ['..', '../', '../../wrangler.toml', 'a/b', 'a%2Fb', 'a%2e%2e', 'Golden-Eagle', 'ñandu', 'golden eagle', 'golden_eagle', '.github', 'a.json', '', ' ', 'a\u0000b', 'a\nb', 'ａ'];
    for (const m of malos) {
      const err = thrown(() => assertSlug(m));
      expect(err.status, JSON.stringify(m)).toBe(400);
    }
    expect(thrown(() => assertSlug(undefined)).status).toBe(400);
    expect(thrown(() => assertSlug(['a', 'b'])).status).toBe(400); // segmentos múltiples
  });

  it('acota la longitud (evita rutas absurdas hacia GitHub)', () => {
    expect(assertSlug('a'.repeat(MAX_SLUG_LENGTH))).toHaveLength(MAX_SLUG_LENGTH);
    const err = thrown(() => assertSlug('a'.repeat(MAX_SLUG_LENGTH + 1)));
    expect(err.status).toBe(400);
    expect(err.message).not.toContain('a'.repeat(MAX_SLUG_LENGTH + 1)); // no se refleja el slug gigante
  });
});

describe('readJsonBody', () => {
  const req = (body: string | null, headers: Record<string, string> = { 'Content-Type': 'application/json' }) => new Request('https://x.test/api/admin/products/a', { method: 'PATCH', body, headers });
  const rejects = async (r: Request): Promise<HttpError> => {
    const e = await readJsonBody(r).then(() => null, (err: unknown) => err);
    expect(e).toBeInstanceOf(HttpError);
    return e as HttpError;
  };

  it('objeto JSON con Content-Type application/json (con o sin charset) → objeto', async () => {
    await expect(readJsonBody(req('{"sha":"a","hidden":true}', { 'Content-Type': 'application/json' }))).resolves.toEqual({ sha: 'a', hidden: true });
    await expect(readJsonBody(req(' {"a":1} ', { 'Content-Type': 'application/json; charset=utf-8' }))).resolves.toEqual({ a: 1 });
    await expect(readJsonBody(req('{"a":1}', { 'Content-Type': 'Application/JSON' }))).resolves.toEqual({ a: 1 });
  });

  it('sin Content-Type, text/plain o x-www-form-urlencoded → 415 aunque el cuerpo sea JSON válido (anti CSRF por formulario)', async () => {
    expect((await rejects(req('{"a":1}', {}))).status).toBe(415);
    expect((await rejects(req('{"a":1}', { 'Content-Type': 'text/plain' }))).status).toBe(415);
    expect((await rejects(req('{"a":1}', { 'Content-Type': 'application/x-www-form-urlencoded' }))).status).toBe(415);
    expect((await rejects(req('{"a":1}', { 'Content-Type': 'application/jsonx' }))).status).toBe(415);
  });

  it('vacío, JSON inválido, array, string o null → 400', async () => {
    expect((await rejects(req(''))).status).toBe(400);
    expect((await rejects(req('   '))).status).toBe(400);
    expect((await rejects(req('{sha: 1}'))).status).toBe(400);
    expect((await rejects(req('[1,2]'))).status).toBe(400);
    expect((await rejects(req('"hola"'))).status).toBe(400);
    expect((await rejects(req('null'))).status).toBe(400);
    expect((await rejects(req('{"a":1}trailing'))).status).toBe(400);
  });

  it('cuerpo mayor que MAX_BODY_BYTES → 413, tanto por Content-Length como por tamaño real', async () => {
    const big = `{"pad":"${'x'.repeat(MAX_BODY_BYTES)}"}`;
    const real = await rejects(req(big));
    expect(real.status).toBe(413);
    expect(real.code).toBe('bad_request');
    // Content-Length declarado grande: se corta antes de leer
    const r = req('{"a":1}');
    Object.defineProperty(r, 'headers', { value: new Headers({ 'Content-Type': 'application/json', 'Content-Length': String(MAX_BODY_BYTES + 1) }) });
    const text = vi.spyOn(r, 'text');
    expect((await rejects(r)).status).toBe(413);
    expect(text).not.toHaveBeenCalled();
    // Justo en el límite se acepta
    const ok = `{"pad":"${'x'.repeat(MAX_BODY_BYTES - 10)}"}`;
    expect(ok.length).toBeLessThanOrEqual(MAX_BODY_BYTES);
    await expect(readJsonBody(req(ok))).resolves.toBeTruthy();
  });

  it('error al leer el stream → 400', async () => {
    const r = req('{"a":1}');
    vi.spyOn(r, 'text').mockRejectedValue(new Error('aborted'));
    expect((await rejects(r)).status).toBe(400);
  });
});

describe('json / errorResponse', () => {
  it('json siempre lleva no-store y charset utf-8', async () => {
    const res = json({ ok: true });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
  });

  it('HttpError → su estado y cuerpo; error desconocido → 500 genérico sin mensaje ni stack', async () => {
    const res = errorResponse(new HttpError('conflict', 'cambió', ['a']));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ code: 'conflict', error: 'cambió', details: ['a'] });

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res2 = errorResponse(new TypeError('Cannot read properties of undefined (reading "variants") ghp_token'));
    expect(res2.status).toBe(500);
    expect(res2.headers.get('Cache-Control')).toBe('no-store');
    const body = await res2.text();
    expect(body).toBe('{"code":"upstream","error":"Error interno del panel"}');
    expect(body).not.toContain('ghp_token');
    expect(body).not.toMatch(/\bat\b.*\.ts/); // sin stack
    const res3 = errorResponse('texto suelto');
    expect(res3.status).toBe(500);
    error.mockRestore();
  });

  it('details vacío no se serializa', () => {
    expect(new HttpError('validation', 'x', []).toBody()).toEqual({ code: 'validation', error: 'x' });
  });
});

describe('entryRoutes: orden de comprobaciones', () => {
  const editor: AdminUser = { email: 'wiliam@example.com', role: 'editor', admins: [], editors: ['wiliam@example.com'], localMode: false, branch: 'main' };
  const admin: AdminUser = { ...editor, email: 'diego@example.com', role: 'admin' };
  type Ctx = Parameters<ReturnType<typeof entryRoutes>['onRequestPut']>[0];
  const ctx = (request: Request, user: AdminUser, slug: unknown, env: Env = {}) =>
    ({ request, env, data: { user }, params: { slug }, functionPath: '', waitUntil: () => {}, passThroughOnException: () => {}, next: async () => new Response() }) as unknown as Ctx;
  const routes = entryRoutes('products');

  it('editor → PUT y DELETE responden 403 antes de leer el cuerpo y sin necesitar GITHUB_TOKEN', async () => {
    for (const handler of [routes.onRequestPut, routes.onRequestDelete]) {
      const request = new Request('https://x.test/api/admin/products/golden-eagle', { method: 'PUT', body: '{"sha":"a","data":{}}', headers: { 'Content-Type': 'application/json' } });
      const text = vi.spyOn(request, 'text');
      const res = await handler(ctx(request, editor, 'golden-eagle', {}));
      expect(res.status).toBe(403);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      await expect(res.json()).resolves.toMatchObject({ code: 'forbidden' });
      expect(text).not.toHaveBeenCalled();
    }
  });

  it('slug inválido → 400 antes de leer el cuerpo o tocar GitHub', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    for (const slug of ['../secrets', 'a/b', 'Golden', 'x'.repeat(MAX_SLUG_LENGTH + 1)]) {
      const request = new Request('https://x.test/api/admin/products/x', { method: 'PATCH', body: '{"sha":"a"}', headers: { 'Content-Type': 'application/json' } });
      const text = vi.spyOn(request, 'text');
      const res = await routes.onRequestPatch(ctx(request, admin, slug, { GITHUB_TOKEN: 't' }));
      expect(res.status, slug).toBe(400);
      expect(text).not.toHaveBeenCalled();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('cuerpo no JSON → 400 sin tocar GitHub; sin GITHUB_TOKEN → 500 de configuración (tras validar el cuerpo)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const bad = new Request('https://x.test/api/admin/products/golden-eagle', { method: 'PATCH', body: 'no-json', headers: { 'Content-Type': 'application/json' } });
    expect((await routes.onRequestPatch(ctx(bad, editor, 'golden-eagle', { GITHUB_TOKEN: 't' }))).status).toBe(400);
    const ok = new Request('https://x.test/api/admin/products/golden-eagle', { method: 'PATCH', body: '{"sha":"a"}', headers: { 'Content-Type': 'application/json' } });
    const res = await routes.onRequestPatch(ctx(ok, editor, 'golden-eagle', {}));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ code: 'config' });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
