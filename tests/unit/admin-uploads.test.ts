import { describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '../../src/domain/admin';
import { MAX_UPLOAD_BYTES, sniffKind, uploadErrors, uploadTarget } from '../../src/domain/uploads';
import { decodeBase64, uploadFile } from '../../functions/api/admin/_lib/uploads';
import { HttpError, MAX_UPLOAD_BODY_BYTES, MAX_BODY_BYTES } from '../../functions/api/admin/_lib/http';
import type { Env } from '../../functions/api/admin/_lib/env';
import { onRequestPost } from '../../functions/api/admin/uploads';
import { memoryStore } from './memoryStore';

/** Subida de PDF al repositorio desde el panel (ADR-023): solo public/docs, cabecera %PDF-, tamaño y rol. Las imágenes nunca se suben. */

const admin: AdminUser = { email: 'diego@example.com', role: 'admin', admins: ['diego@example.com'], editors: ['wiliam@example.com'], localMode: true, branch: 'main' };
const editor: AdminUser = { ...admin, email: 'wiliam@example.com', role: 'editor' };

const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
/** Cabecera (`head`) + relleno hasta `size` bytes */
const padded = (head: Uint8Array, size: number, fill: number): Uint8Array => {
  const out = new Uint8Array(Math.max(size, head.length)).fill(fill);
  out.set(head, 0);
  return out;
};
const pdf = (size = 64): Uint8Array => padded(ascii('%PDF-1.4\n'), size, 0x20);
/** Cabecera RIFF/WEBP: un webp real, que el servidor debe rechazar aunque la ruta fuera válida */
const webp = (size = 64): Uint8Array => padded(ascii('RIFF\0\0\0\0WEBPVP8 '), size, 0);
const b64 = (u: Uint8Array): string => Buffer.from(u).toString('base64');

const fails = async (p: Promise<unknown>): Promise<HttpError> => {
  const e = await p.then(() => null).catch((err: unknown) => err);
  expect(e).toBeInstanceOf(HttpError);
  return e as HttpError;
};

describe('uploadTarget (ruta blanca)', () => {
  it('solo public/docs/<kebab>.pdf: ninguna imagen, ninguna otra carpeta', () => {
    expect(uploadTarget('public/docs/golden-eagle-manual.pdf')).toEqual({ kind: 'pdf', path: 'public/docs/golden-eagle-manual.pdf', ref: '/docs/golden-eagle-manual.pdf' });
    expect(uploadTarget('public/docs/x.pdf')?.ref).toBe('/docs/x.pdf');
    for (const bad of [
      'src/assets/blog/foto.webp',
      'src/assets/products/x.webp',
      'public/docs/foto.webp',
      'public/docs/foto.jpg',
      'public/docs/../x.pdf',
      'public/docs/Manual.pdf',
      'public/docs/sub/x.pdf',
      'public/docs/manual.PDF',
      'public/docs/x.pdf.exe',
      'public/x.pdf',
      'functions/api/admin/x.pdf',
      '/public/docs/x.pdf',
      'public/docs/x.pdf\n',
      '',
      42,
      null,
      `public/docs/${'a'.repeat(200)}.pdf`,
    ]) {
      expect(uploadTarget(bad), String(bad)).toBeNull();
    }
  });
});

describe('sniffKind / uploadErrors (cabecera y tamaño)', () => {
  it('detecta el PDF por los bytes, no por la extensión; nada más se reconoce', () => {
    expect(sniffKind(pdf())).toBe('pdf');
    expect(sniffKind(webp())).toBeNull();
    expect(sniffKind(ascii('\x89PNG\r\n'))).toBeNull();
    expect(sniffKind(Uint8Array.from([0xff, 0xd8, 0xff]))).toBeNull(); // JPEG
    expect(sniffKind(ascii('%PDF'))).toBeNull(); // cabecera incompleta
    expect(sniffKind(ascii('<html>%PDF-'))).toBeNull(); // no al principio
    expect(sniffKind(new Uint8Array(0))).toBeNull();
  });

  it('el contenido debe ser PDF y pesar como máximo 10 MB', () => {
    const p = uploadTarget('public/docs/x.pdf')!;
    expect(uploadErrors(p, pdf())).toEqual([]);
    expect(uploadErrors(p, webp())[0]).toMatch(/no es un PDF/);
    expect(uploadErrors(p, new Uint8Array(0))).toEqual([expect.stringMatching(/PDF/), 'el fichero está vacío']);
    expect(uploadErrors(p, pdf(MAX_UPLOAD_BYTES.pdf))).toEqual([]);
    expect(uploadErrors(p, pdf(MAX_UPLOAD_BYTES.pdf + 1))).toEqual([expect.stringMatching(/pesa 10\.0 MB y el máximo es 10 MB/)]);
  });

  it('el cuerpo máximo del endpoint cubre el PDF máximo en base64 y es mayor que el de las fichas', () => {
    expect(MAX_UPLOAD_BODY_BYTES).toBeGreaterThan(Math.ceil((MAX_UPLOAD_BYTES.pdf * 4) / 3) + 1024);
    expect(MAX_UPLOAD_BODY_BYTES).toBeGreaterThan(MAX_BODY_BYTES);
  });
});

describe('decodeBase64', () => {
  it('decodifica (tolerando saltos de línea) y rechaza lo que no es base64', () => {
    expect([...decodeBase64('UkZG\nRg==')]).toEqual([...ascii('RFFF')]);
    for (const bad of ['###', 'a', 'a b!', 'UkZG=Rg']) expect(() => decodeBase64(bad), bad).toThrow(HttpError);
  });
});

describe('uploadFile (handler)', () => {
  it('editor → 403 sin tocar el almacén', async () => {
    const store = memoryStore({});
    const err = await fails(uploadFile({ store, user: editor }, { path: 'public/docs/x.pdf', contentBase64: b64(pdf()) }));
    expect(err).toMatchObject({ status: 403, code: 'forbidden' });
    expect(store.writes).toHaveLength(0);
  });

  it('admin: crea el PDF en base64 en una carpeta que aún no existe (public/docs) con commit chore(assets): subir', async () => {
    const store = memoryStore({ 'src/content/products/a.json': { slug: 'a' } });
    const data = pdf(100);
    const res = await uploadFile({ store, user: admin }, { path: 'public/docs/golden-eagle-manual.pdf', contentBase64: b64(data), reason: 'Manual 2026' });
    expect(res).toMatchObject({ path: 'public/docs/golden-eagle-manual.pdf', ref: '/docs/golden-eagle-manual.pdf', bytes: 100, replaced: false });
    expect(res.commit.message).toBe('chore(assets): subir public/docs/golden-eagle-manual.pdf por diego@example.com\n\n100 bytes\n\nMotivo: Manual 2026');
    expect(store.writes[0]).toMatchObject({ path: 'public/docs/golden-eagle-manual.pdf', encoding: 'base64', sha: undefined, content: b64(data) });
  });

  it('admin: si el PDF existe lo sustituye con su sha (sin 409 por "ya existe")', async () => {
    const store = memoryStore({ 'public/docs/golden-eagle-ficha.pdf': 'viejo' });
    const res = await uploadFile({ store, user: admin }, { path: 'public/docs/golden-eagle-ficha.pdf', contentBase64: b64(pdf()) });
    expect(res.replaced).toBe(true);
    expect(res.ref).toBe('/docs/golden-eagle-ficha.pdf');
    expect(store.writes[0]?.sha).toBe('sha-1');
    expect(store.writes[0]?.message).toContain('(sustituye al anterior)');
  });

  it('imagen (aunque sea webp válido) o ruta fuera de public/docs → 422; contenido que no es PDF → 422; sin contenido o base64 roto → 400', async () => {
    const store = memoryStore({});
    const img = await fails(uploadFile({ store, user: admin }, { path: 'src/assets/blog/foto.webp', contentBase64: b64(webp()) }));
    expect(img).toMatchObject({ status: 422, code: 'validation' });
    expect(img.details?.[0]).toMatch(/public\/docs/);
    expect((await fails(uploadFile({ store, user: admin }, { path: 'src/content/products/x.json', contentBase64: b64(pdf()) }))).status).toBe(422);
    const err = await fails(uploadFile({ store, user: admin }, { path: 'public/docs/x.pdf', contentBase64: b64(webp()) }));
    expect(err.status).toBe(422);
    expect(err.details?.[0]).toMatch(/no es un PDF/);
    expect((await fails(uploadFile({ store, user: admin }, { path: 'public/docs/x.pdf', contentBase64: b64(pdf(MAX_UPLOAD_BYTES.pdf + 1)) }))).details?.[0]).toMatch(/10 MB/);
    expect((await fails(uploadFile({ store, user: admin }, { path: 'public/docs/x.pdf' }))).status).toBe(400);
    expect((await fails(uploadFile({ store, user: admin }, { path: 'public/docs/x.pdf', contentBase64: '%%%' }))).status).toBe(400);
    expect((await fails(uploadFile({ store, user: admin }, 'texto'))).status).toBe(400);
    expect(store.writes).toHaveLength(0);
  });
});

describe('POST /api/admin/uploads (ruta)', () => {
  type Ctx = Parameters<typeof onRequestPost>[0];
  const ctx = (request: Request, user: AdminUser, env: Env = {}) =>
    ({ request, env, data: { user }, params: {}, functionPath: '', waitUntil: () => {}, passThroughOnException: () => {}, next: async () => new Response() }) as unknown as Ctx;

  it('editor → 403 antes de leer el cuerpo', async () => {
    const request = new Request('https://x.test/api/admin/uploads', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
    const text = vi.spyOn(request, 'text');
    const res = await onRequestPost(ctx(request, editor, {}));
    expect(res.status).toBe(403);
    expect(text).not.toHaveBeenCalled();
  });

  it('admin: acepta cuerpos mayores que el de las fichas (hasta MAX_UPLOAD_BODY_BYTES) y rechaza más grandes con 413', async () => {
    const big = `{"path":"public/docs/x.pdf","contentBase64":"${'A'.repeat(MAX_BODY_BYTES * 2)}"}`;
    const res = await onRequestPost(ctx(new Request('https://x.test/api/admin/uploads', { method: 'POST', body: big, headers: { 'Content-Type': 'application/json' } }), admin, {}));
    expect(res.status).toBe(500); // pasó la lectura del cuerpo; falla por falta de GITHUB_TOKEN (config)
    await expect(res.json()).resolves.toMatchObject({ code: 'config' });
    const huge = new Request('https://x.test/api/admin/uploads', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
    Object.defineProperty(huge, 'headers', { value: new Headers({ 'Content-Type': 'application/json', 'Content-Length': String(MAX_UPLOAD_BODY_BYTES + 1) }) });
    const text = vi.spyOn(huge, 'text');
    expect((await onRequestPost(ctx(huge, admin, { GITHUB_TOKEN: 't' }))).status).toBe(413);
    expect(text).not.toHaveBeenCalled();
  });
});
