import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError, UpstreamError, decodeBase64Utf8, encodeUtf8Base64, githubStore, serializeJson } from '../../functions/api/admin/_lib/github';
import { HttpError } from '../../functions/api/admin/_lib/http';

/** Almacén sobre la Contents API de GitHub (ADR-018): cabeceras, codificación UTF-8 y mapeo de errores. */

const env = { GITHUB_TOKEN: 'ghp_secreto', GITHUB_REPO: 'diego-1795/motos-electricas', GITHUB_BRANCH: 'admin-sandbox' };
const BASE = 'https://api.github.com/repos/diego-1795/motos-electricas/contents/';

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];

function mockFetch(responder: (call: Call) => Response | Promise<Response>) {
  calls.length = 0;
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const call = { url, init };
    calls.push(call);
    return responder(call);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const headersOf = (c: Call) => c.init.headers as Record<string, string>;
const bodyOf = (c: Call) => JSON.parse(c.init.body as string) as Record<string, unknown>;

afterEach(() => vi.unstubAllGlobals());

describe('codificación', () => {
  it('ida y vuelta UTF-8 ↔ base64 con tildes, eñes y comillas', () => {
    const text = '{\n  "name": "Águila eléctrica · 14 x 2.5\\" ñ"\n}\n';
    expect(decodeBase64Utf8(encodeUtf8Base64(text))).toBe(text);
  });

  it('emojis (pares sustitutos) y texto largo (> 32 KB, varios chunks) sobreviven la ida y vuelta', () => {
    const emoji = '{\n  "claim": "⚡🏍️ Águila 🇵🇪 — 100 % eléctrica"\n}\n';
    expect(decodeBase64Utf8(encodeUtf8Base64(emoji))).toBe(emoji);
    const largo = 'ñ🏍️'.repeat(20_000);
    expect(decodeBase64Utf8(encodeUtf8Base64(largo))).toBe(largo);
    // El base64 que produce GitHub parte las líneas con \n: se ignoran
    expect(decodeBase64Utf8(encodeUtf8Base64(emoji).replace(/(.{60})/g, '$1\n'))).toBe(emoji);
  });

  it('serializeJson usa 2 espacios y salto final, como los JSON del repo', () => {
    expect(serializeJson({ a: 1, b: [1, 2] })).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}\n');
  });
});

describe('githubStore', () => {
  it('sin GITHUB_TOKEN → error de configuración (500)', () => {
    const err = (() => {
      try {
        githubStore({});
        return null;
      } catch (e) {
        return e as HttpError;
      }
    })();
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 500 });
    expect(err!.message).toMatch(/GITHUB_TOKEN/);
  });

  it('read decodifica base64 con saltos de línea como UTF-8 y envía las cabeceras correctas', async () => {
    const original = serializeJson({ name: 'Águila eléctrica ñ' });
    const b64 = encodeUtf8Base64(original).replace(/(.{20})/g, '$1\n'); // GitHub parte el base64 en líneas
    mockFetch(() => jsonRes({ type: 'file', name: 'x.json', path: 'src/content/products/x.json', sha: 'abc', encoding: 'base64', content: b64 }));

    const file = await githubStore(env).read('src/content/products/x.json');
    expect(file).toEqual({ path: 'src/content/products/x.json', sha: 'abc', content: original });

    expect(calls[0]?.url).toBe(`${BASE}src/content/products/x.json?ref=admin-sandbox`);
    expect(calls[0]?.init.method).toBe('GET');
    expect(headersOf(calls[0]!)).toMatchObject({
      Authorization: 'Bearer ghp_secreto',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'raiden-admin',
    });
  });

  it('read 404 → null', async () => {
    mockFetch(() => jsonRes({ message: 'Not Found' }, 404));
    await expect(githubStore(env).read('src/content/products/nope.json')).resolves.toBeNull();
  });

  it('list devuelve solo ficheros con path, sha y name', async () => {
    mockFetch(() =>
      jsonRes([
        { type: 'file', name: 'a.json', path: 'src/content/products/a.json', sha: 's1' },
        { type: 'dir', name: 'img', path: 'src/content/products/img', sha: 's2' },
      ]),
    );
    await expect(githubStore(env).list('src/content/products')).resolves.toEqual([{ path: 'src/content/products/a.json', sha: 's1', name: 'a.json' }]);
    expect(calls[0]?.url).toBe(`${BASE}src/content/products?ref=admin-sandbox`);
  });

  it('write envía message, content base64, branch y sha; devuelve sha nuevo y commit', async () => {
    mockFetch(() => jsonRes({ content: { sha: 'nuevo-sha', path: 'p' }, commit: { sha: 'c1', html_url: 'https://github.com/x/commit/c1', message: 'msg' } }, 200));
    const content = serializeJson({ name: 'Ñandú' });
    const res = await githubStore(env).write('src/content/products/x.json', content, 'chore(catalog): actualizar x por a@b.c', 'sha-viejo');

    expect(res).toEqual({ sha: 'nuevo-sha', commit: { sha: 'c1', url: 'https://github.com/x/commit/c1', message: 'msg' } });
    expect(calls[0]?.url).toBe(`${BASE}src/content/products/x.json`);
    expect(calls[0]?.init.method).toBe('PUT');
    const body = bodyOf(calls[0]!);
    expect(body).toEqual({ message: 'chore(catalog): actualizar x por a@b.c', content: encodeUtf8Base64(content), branch: 'admin-sandbox', sha: 'sha-viejo' });
    expect(decodeBase64Utf8(body.content as string)).toBe(content);
  });

  it('write sin sha (crear) no envía sha y acepta 201', async () => {
    mockFetch(() => jsonRes({ content: { sha: 'creado' }, commit: { sha: 'c2' } }, 201));
    const res = await githubStore(env).write('src/content/products/n.json', '{}\n', 'chore(catalog): crear n por a@b.c');
    expect(res.sha).toBe('creado');
    expect(res.commit).toEqual({ sha: 'c2', url: '', message: 'chore(catalog): crear n por a@b.c' });
    expect('sha' in bodyOf(calls[0]!)).toBe(false);
  });

  it('409 y 422 "does not match" → ConflictError (409)', async () => {
    mockFetch(() => jsonRes({ message: 'is at abc but expected def' }, 409));
    await expect(githubStore(env).write('p.json', '{}', 'm', 'def')).rejects.toBeInstanceOf(ConflictError);

    mockFetch(() => jsonRes({ message: 'p.json does not match abc' }, 422));
    const err = await githubStore(env).write('p.json', '{}', 'm', 'abc').catch((e: unknown) => e as ConflictError);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toMatchObject({ status: 409, code: 'conflict' });

    mockFetch(() => jsonRes({ message: 'Invalid request.\n\n"sha" wasn\'t supplied.' }, 422));
    await expect(githubStore(env).write('p.json', '{}', 'm')).rejects.toBeInstanceOf(ConflictError);
  });

  it('remove envía message, sha y branch', async () => {
    mockFetch(() => jsonRes({ content: null, commit: { sha: 'c3', html_url: 'u', message: 'borrado' } }));
    const res = await githubStore(env).remove('src/content/repuestos/x.json', 'chore(catalog): borrar x por a@b.c', 'sha-x');
    expect(res.commit).toEqual({ sha: 'c3', url: 'u', message: 'borrado' });
    expect(calls[0]?.init.method).toBe('DELETE');
    expect(bodyOf(calls[0]!)).toEqual({ message: 'chore(catalog): borrar x por a@b.c', sha: 'sha-x', branch: 'admin-sandbox' });
  });

  it('404 al escribir/borrar → NotFoundError; otros errores → UpstreamError 502 sin el token', async () => {
    mockFetch(() => jsonRes({ message: 'Not Found' }, 404));
    await expect(githubStore(env).remove('x.json', 'm', 's')).rejects.toBeInstanceOf(NotFoundError);

    mockFetch(() => jsonRes({ message: 'Server Error' }, 500));
    const err = (await githubStore(env).read('x.json').catch((e: unknown) => e)) as UpstreamError;
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err).toMatchObject({ status: 502, code: 'upstream' });
    expect(err.message).toContain('Server Error');
    expect(err.message).not.toContain('ghp_secreto');

    mockFetch(() => jsonRes({ message: 'Bad credentials' }, 401));
    const err2 = (await githubStore(env).read('x.json').catch((e: unknown) => e)) as UpstreamError;
    expect(err2.message).toMatch(/GITHUB_TOKEN/);
    expect(err2.message).not.toContain('ghp_secreto');
  });

  it('usa repo y rama por defecto si no se configuran', async () => {
    mockFetch(() => jsonRes({ message: 'Not Found' }, 404));
    await githubStore({ GITHUB_TOKEN: 't' }).read('x.json');
    expect(calls[0]?.url).toBe('https://api.github.com/repos/diego-1795/motos-electricas/contents/x.json?ref=main');
  });

  it('fallo de red → UpstreamError', async () => {
    mockFetch(() => {
      throw new Error('ECONNRESET');
    });
    await expect(githubStore(env).read('x.json')).rejects.toBeInstanceOf(UpstreamError);
  });
});
