import { describe, it, expect } from 'vitest';
import { formatMoney, parseSoles, pen } from '../../src/domain/money';
import { AdminApiClient, AdminApiError, SESSION_EXPIRED_MESSAGE } from '../../src/services/admin/AdminApiClient';
import { centsToInput, safeHttpUrl } from '../../src/islands/admin/context';
import { LOCAL_USER_HEADER } from '../../src/domain/admin';

/** Entrada de precios del panel de administración (ADR-018): soles escritos a mano → céntimos. */
describe('parseSoles', () => {
  it('acepta enteros, miles con coma y hasta 2 decimales con punto', () => {
    expect(parseSoles('1200')).toBe(120000);
    expect(parseSoles('1,200')).toBe(120000);
    expect(parseSoles('1200.50')).toBe(120050);
    expect(parseSoles('1,200.50')).toBe(120050);
    expect(parseSoles('1,234,567.8')).toBe(123456780);
    expect(parseSoles('1,000,000')).toBe(100000000);
    expect(parseSoles('0.05')).toBe(5);
    expect(parseSoles('350')).toBe(35000);
    expect(parseSoles('1250.5')).toBe(125050);
    expect(parseSoles('007')).toBe(700);
  });

  it('tolera espacios y el prefijo "S/" o "S/."', () => {
    expect(parseSoles('  1250 ')).toBe(125000);
    expect(parseSoles('S/ 1,250')).toBe(125000);
    expect(parseSoles('s/1250.5')).toBe(125050);
    expect(parseSoles('S/. 1,250')).toBe(125000);
    expect(parseSoles('S/.1250')).toBe(125000);
  });

  it('devuelve null para entradas que no son un importe', () => {
    for (const bad of [
      '',
      '   ',
      'abc',
      '12a',
      '-100',
      '+100',
      '1.234',
      '1,20',
      '1,2000',
      ',200',
      '1200,',
      '1200.',
      '.50',
      '1 200',
      '12.345,50',
      'NaN',
      '1e3',
      '1_000',
      '１２００', // dígitos de ancho completo
      '1 200', // espacio duro como separador de miles
      'S/',
      'S/ S/ 100',
      '100 S/',
      '12\n00',
    ]) {
      expect(parseSoles(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('"0" es un importe parseable (la regla "> 0" la aplica quien lo use)', () => {
    expect(parseSoles('0')).toBe(0);
    expect(parseSoles('0.00')).toBe(0);
  });

  it('nunca devuelve un número que no sea un entero seguro (importes absurdos → null)', () => {
    expect(parseSoles('9'.repeat(13))).toBe(9999999999999 * 100);
    expect(parseSoles('9'.repeat(14))).toBeNull(); // 9,99e15 céntimos > MAX_SAFE_INTEGER
    expect(parseSoles('9'.repeat(16))).toBeNull();
    expect(parseSoles('99999999999999999999.99')).toBeNull();
    const ok = parseSoles('90071992547409.91');
    expect(ok).not.toBeNull();
    expect(Number.isSafeInteger(ok)).toBe(true);
  });

  it('es inverso de formatMoney para los precios del catálogo', () => {
    for (const cents of [120000, 150000, 270000, 35000, 499950, 5]) {
      expect(parseSoles(formatMoney(pen(cents)))).toBe(cents);
    }
  });
});

describe('centsToInput', () => {
  it('escribe soles sin decimales inútiles y con 2 cuando hacen falta', () => {
    expect(centsToInput(120000)).toBe('1200');
    expect(centsToInput(120050)).toBe('1200.50');
    expect(centsToInput(120005)).toBe('1200.05');
    expect(centsToInput(5)).toBe('0.05');
    expect(centsToInput(0)).toBe('0');
  });

  it('es inverso de parseSoles', () => {
    for (const cents of [0, 5, 99, 100, 120000, 120050, 123456789]) expect(parseSoles(centsToInput(cents))).toBe(cents);
  });
});

describe('safeHttpUrl', () => {
  it('solo deja pasar http(s) absolutos', () => {
    expect(safeHttpUrl('https://github.com/x/y/commit/abc')).toBe('https://github.com/x/y/commit/abc');
    expect(safeHttpUrl('http://localhost:8788/x')).toBe('http://localhost:8788/x');
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'vbscript:x', 'file:///etc/passwd', '/relativa', 'github.com/x', '', undefined, null]) {
      expect(safeHttpUrl(bad), String(bad)).toBeUndefined();
    }
  });
});

/** Cliente HTTP del panel con un fetch falso: contrato de errores, cabecera de modo local y serialización exacta. */
describe('AdminApiClient', () => {
  type Call = { url: string; init: RequestInit };

  function client(respond: (call: Call) => Response | Promise<Response>) {
    const calls: Call[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = { url: String(input), init: init ?? {} };
      calls.push(call);
      return respond(call);
    }) as typeof fetch;
    return { api: new AdminApiClient('/api/admin', fetcher), calls };
  }

  const jsonRes = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  async function fails(p: Promise<unknown>): Promise<AdminApiError> {
    try {
      await p;
    } catch (e) {
      if (e instanceof AdminApiError) return e;
      throw e;
    }
    throw new Error('no lanzó');
  }

  it('serializa exactamente el cuerpo, usa mismo origen, no sigue redirecciones y codifica el slug', async () => {
    const { api, calls } = client(() => jsonRes(200, { sha: 'n', path: 'p', data: {}, commit: null }));
    await api.patch('products', 'golden eagle/x', { sha: 'abc', prices: { estandar: 125000 } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/admin/products/golden%20eagle%2Fx');
    expect(calls[0]!.init.method).toBe('PATCH');
    expect(calls[0]!.init.body).toBe('{"sha":"abc","prices":{"estandar":125000}}');
    expect(calls[0]!.init.credentials).toBe('same-origin');
    expect(calls[0]!.init.redirect).toBe('manual');
    expect(calls[0]!.init.cache).toBe('no-store');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Accept).toBe('application/json');
  });

  it('la cabecera de modo local solo viaja mientras hay simulación activa', async () => {
    const { api, calls } = client(() => jsonRes(200, { email: 'x', role: 'admin', admins: [], editors: [], localMode: true, branch: 'main' }));
    await api.me();
    expect((calls[0]!.init.headers as Record<string, string>)[LOCAL_USER_HEADER]).toBeUndefined();
    api.setLocalUser('editor@example.com');
    expect(api.getLocalUser()).toBe('editor@example.com');
    await api.me();
    expect((calls[1]!.init.headers as Record<string, string>)[LOCAL_USER_HEADER]).toBe('editor@example.com');
    api.setLocalUser(null);
    await api.me();
    expect((calls[2]!.init.headers as Record<string, string>)[LOCAL_USER_HEADER]).toBeUndefined();
    expect(calls[2]!.init.body).toBeUndefined();
    expect((calls[2]!.init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('un 422 conserva code, mensaje y details (solo strings)', async () => {
    const { api } = client(() => jsonRes(422, { code: 'validation', error: 'La ficha no es válida', details: ['a', 42, 'b', null] }));
    const err = await fails(api.put('repuestos', 'x', { data: {} as never }));
    expect(err.status).toBe(422);
    expect(err.code).toBe('validation');
    expect(err.message).toBe('La ficha no es válida');
    expect(err.details).toEqual(['a', 'b']);
  });

  it('un code desconocido o un cuerpo que no es objeto se sustituyen por el código del estado HTTP', async () => {
    const { api } = client(() => jsonRes(409, { code: 'something-else', error: 'conflicto' }));
    const err = await fails(api.remove('products', 'x', { sha: 's' }));
    expect(err.code).toBe('conflict');
    expect(err.message).toBe('conflicto');

    const { api: api2 } = client(() => new Response('["no", "es", "objeto"]', { status: 500 }));
    const err2 = await fails(api2.catalog());
    expect(err2.code).toBe('config');
    expect(err2.message).toBe('Error 500 del servidor');

    const { api: api3 } = client(() => new Response('<html>error</html>', { status: 503 }));
    const err3 = await fails(api3.deploy());
    expect(err3.code).toBe('upstream');
    expect(err3.status).toBe(503);
  });

  it('un 401 sin cuerpo tiene mensaje propio', async () => {
    const { api } = client(() => new Response('', { status: 401 }));
    const err = await fails(api.me());
    expect(err.status).toBe(401);
    expect(err.code).toBe('unauthorized');
    expect(err.message).toBe('Sin sesión de acceso');
  });

  it('una redirección (Cloudflare Access mandando al login) se trata como sesión caducada (401)', async () => {
    const opaque = { type: 'opaqueredirect', status: 0, ok: false, text: async () => '' } as unknown as Response;
    const { api } = client(() => opaque);
    const err = await fails(api.catalog());
    expect(err.status).toBe(401);
    expect(err.code).toBe('unauthorized');
    expect(err.message).toBe(SESSION_EXPIRED_MESSAGE);

    const { api: api2 } = client(() => new Response('', { status: 302, headers: { location: 'https://team.cloudflareaccess.com/' } }));
    expect((await fails(api2.catalog())).status).toBe(401);
  });

  it('un 200 que no es JSON (una página HTML interpuesta) no se devuelve como dato', async () => {
    const { api } = client(() => new Response('<!doctype html><title>Login</title>', { status: 200, headers: { 'content-type': 'text/html' } }));
    const err = await fails(api.me());
    expect(err.code).toBe('upstream');
    expect(err.message).toMatch(/no es JSON/);
  });

  it('un fallo de red se convierte en upstream con estado 0', async () => {
    const { api } = client(() => {
      throw new TypeError('Failed to fetch');
    });
    const err = await fails(api.me());
    expect(err.status).toBe(0);
    expect(err.code).toBe('upstream');
    expect(err.message).toContain('Failed to fetch');
  });
});
