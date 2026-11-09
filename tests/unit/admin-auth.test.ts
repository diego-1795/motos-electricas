import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOGIN_LOCKOUT_S, LOGIN_MAX_ATTEMPTS_PER_ACCOUNT, MIN_PASSWORD_LENGTH, SESSION_TTL_S, passwordErrors } from '../../src/domain/adminAuth';
import {
  SESSION_COOKIE,
  assertSameOrigin,
  changePassword,
  clearSessionCookie,
  hashPassword,
  issueSession,
  loginWithPassword,
  parseHash,
  parseInitialPasswords,
  readUser,
  sessionCookie,
  sessionIdentity,
  signSession,
  verifyPassword,
  verifySession,
} from '../../functions/api/admin/_lib/auth';
import type { Env } from '../../functions/api/admin/_lib/env';
import { HttpError } from '../../functions/api/admin/_lib/http';
import { onRequest } from '../../functions/api/admin/_middleware';
import { onRequestPost as loginRoute } from '../../functions/api/admin/auth/login';
import { onRequestPost as logoutRoute } from '../../functions/api/admin/auth/logout';
import { onRequestPost as passwordRoute } from '../../functions/api/admin/auth/password';
import { memoryKv, type MemoryKv } from './memoryKv';

/** Acceso por contraseña del panel (ADR-024): hashes, cookie firmada, bloqueo, cambio de contraseña y middleware. */

const SECRET = 'un-secreto-de-pruebas-con-mas-de-treinta-y-dos-caracteres';
const DIEGO = 'diego@example.com';
const WILIAM = 'wiliam@example.com';
const TEMP = 'Temporal-1234-abcd';
const ITER = 1000; // rápido en tests; el formato admite cualquier valor ≥ 1000

let kv: MemoryKv;
let clock = 1_800_000_000_000; // ms
const nowS = () => Math.floor(clock / 1000);

const fails = async (p: Promise<unknown>): Promise<HttpError> => {
  const e = await p.then(() => null).catch((err: unknown) => err);
  expect(e).toBeInstanceOf(HttpError);
  return e as HttpError;
};

async function envWith(over: Partial<Env> = {}, initial: Record<string, string> = { [DIEGO]: TEMP, [WILIAM]: TEMP }): Promise<Env> {
  const entries = await Promise.all(Object.entries(initial).map(async ([email, pwd]) => `${email}:${await hashPassword(pwd, ITER)}`));
  return {
    ADMIN_KV: kv as unknown as Env['ADMIN_KV'],
    SESSION_SECRET: SECRET,
    ADMIN_INITIAL_PASSWORDS: entries.join(', '),
    ADMIN_EMAILS: DIEGO,
    EDITOR_EMAILS: WILIAM,
    ...over,
  };
}

const req = (url: string, init: RequestInit & { ip?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.ip) headers.set('CF-Connecting-IP', init.ip);
  return new Request(url, { ...init, headers });
};
const postJson = (url: string, body: unknown, headers: Record<string, string> = {}) => req(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } });

beforeEach(() => {
  kv = memoryKv(() => clock);
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('política de contraseñas (dominio)', () => {
  it('exige longitud mínima, sin espacios en los extremos ni caracteres de control', () => {
    expect(passwordErrors('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toContainEqual(expect.stringContaining(`${MIN_PASSWORD_LENGTH} caracteres`));
    expect(passwordErrors(' Frase con espacio al inicio')).toContainEqual(expect.stringContaining('espacios'));
    expect(passwordErrors('abc\u0000defghijk')).toContainEqual(expect.stringContaining('control'));
    expect(passwordErrors(123)).toEqual(['La contraseña debe ser texto']);
  });

  it('rechaza el email, la actual y las triviales; acepta frases', () => {
    expect(passwordErrors('Diego@Example.com', { email: DIEGO })).toContainEqual(expect.stringContaining('email'));
    expect(passwordErrors(TEMP, { current: TEMP })).toContainEqual(expect.stringContaining('distinta de la actual'));
    for (const trivial of ['1234567890', '0987654321', 'aaaaaaaaaa', 'abababababab', 'qwertyuiop', 'abcdefghijkl']) {
      expect(passwordErrors(trivial), trivial).toContainEqual(expect.stringContaining('predecible'));
    }
    expect(passwordErrors('mi moto azul vuela 2026')).toEqual([]);
    expect(passwordErrors('Raiden#Callao2026')).toEqual([]);
  });
});

describe('hash de contraseña', () => {
  it('PBKDF2 con sal aleatoria: dos hashes distintos para la misma contraseña, ambos verifican', async () => {
    const a = await hashPassword('mi moto azul vuela 2026', ITER);
    const b = await hashPassword('mi moto azul vuela 2026', ITER);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^pbkdf2-sha256:1000:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/);
    await expect(verifyPassword('mi moto azul vuela 2026', a)).resolves.toBe(true);
    await expect(verifyPassword('mi moto azul vuela 2026', b)).resolves.toBe(true);
    await expect(verifyPassword('mi moto azul vuela 2025', a)).resolves.toBe(false);
  });

  it('normaliza Unicode (NFKC) y rechaza hashes malformados sin lanzar', async () => {
    const h = await hashPassword('café con leche 2026', ITER);
    await expect(verifyPassword('café con leche 2026', h)).resolves.toBe(true);
    for (const bad of ['', 'pbkdf2-sha256:1000:abc', 'bcrypt:10:x:y', 'pbkdf2-sha256:10:AAAA:BBBB', 'pbkdf2-sha256:1000:!!:??', `pbkdf2-sha256:1000:${'A'.repeat(22)}:${'A'.repeat(10)}`]) {
      expect(parseHash(bad), bad).toBeNull();
      await expect(verifyPassword('x', bad)).resolves.toBe(false);
    }
  });

  it('parseInitialPasswords: email en minúsculas, separadores variados, entradas rotas ignoradas con aviso', async () => {
    const h = await hashPassword(TEMP, ITER);
    const map = parseInitialPasswords(`Diego@Example.com:${h};\n ${WILIAM}:${h}, roto, sin-arroba:${h}, ${DIEGO}:pbkdf2-sha256:nope`);
    expect([...map.keys()]).toEqual([DIEGO, WILIAM]);
    expect(map.get(DIEGO)).toBe(h);
    expect(console.warn).toHaveBeenCalled();
    expect(parseInitialPasswords(undefined).size).toBe(0);
  });
});

describe('cookie de sesión', () => {
  const claims = { email: DIEGO, v: 1, iat: nowS(), exp: nowS() + SESSION_TTL_S };

  it('firma y verifica; otra clave, payload manipulado o firma recortada → null', async () => {
    const token = await signSession(claims, SECRET);
    await expect(verifySession(token, SECRET, nowS())).resolves.toEqual(claims);
    await expect(verifySession(token, SECRET + 'x', nowS())).resolves.toBeNull();
    const [payload, sig] = token.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...claims, email: WILIAM })).toString('base64url');
    await expect(verifySession(`${forged}.${sig}`, SECRET, nowS())).resolves.toBeNull();
    await expect(verifySession(`${payload}.${sig.slice(0, -2)}`, SECRET, nowS())).resolves.toBeNull();
    await expect(verifySession(payload, SECRET, nowS())).resolves.toBeNull();
    await expect(verifySession('', SECRET, nowS())).resolves.toBeNull();
    await expect(verifySession(`${payload}.%%%`, SECRET, nowS())).resolves.toBeNull();
  });

  it('caduca en exp y rechaza iat en el futuro', async () => {
    const token = await signSession(claims, SECRET);
    await expect(verifySession(token, SECRET, claims.exp)).resolves.toBeNull();
    await expect(verifySession(token, SECRET, claims.exp - 1)).resolves.toBeTruthy();
    const future = await signSession({ ...claims, iat: nowS() + 600 }, SECRET);
    await expect(verifySession(future, SECRET, nowS())).resolves.toBeNull();
  });

  it('Set-Cookie: HttpOnly, SameSite=Strict, Path=/api/admin; Secure solo en https; el logout la vacía', () => {
    const https = sessionCookie('tok', new Request('https://raiden.pe/api/admin/auth/login'));
    expect(https).toBe(`${SESSION_COOKIE}=tok; Path=/api/admin; Max-Age=${SESSION_TTL_S}; HttpOnly; SameSite=Strict; Secure`);
    const http = sessionCookie('tok', new Request('http://localhost:8788/api/admin/auth/login'));
    expect(http).not.toContain('Secure');
    expect(clearSessionCookie(new Request('https://raiden.pe/x'))).toContain('Max-Age=0');
  });
});

describe('loginWithPassword', () => {
  it('primera entrada con la contraseña temporal: crea el usuario en KV con mustChange y devuelve la identidad', async () => {
    const env = await envWith();
    const id = await loginWithPassword(env, req('https://raiden.pe/api/admin/auth/login', { ip: '1.1.1.1' }), ' Diego@Example.com ', TEMP);
    expect(id).toEqual({ email: DIEGO, mustChange: true, version: 1 });
    const stored = await readUser(kv, DIEGO);
    expect(stored).toMatchObject({ version: 1, mustChange: true });
    expect(stored!.hash).toMatch(/^pbkdf2-sha256:/);
    // Segunda entrada: ya desde KV, mismo resultado; la temporal del entorno deja de consultarse
    const again = await loginWithPassword({ ...env, ADMIN_INITIAL_PASSWORDS: '' }, req('https://raiden.pe/x'), DIEGO, TEMP);
    expect(again.mustChange).toBe(true);
  });

  it('mismo 401 para contraseña incorrecta y para email desconocido (no revela cuentas)', async () => {
    const env = await envWith();
    const bad = await fails(loginWithPassword(env, req('https://raiden.pe/x'), DIEGO, 'incorrecta-123'));
    const unknown = await fails(loginWithPassword(env, req('https://raiden.pe/x'), 'nadie@example.com', TEMP));
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.message).toBe(unknown.message);
    expect(await readUser(kv, 'nadie@example.com')).toBeNull();
    for (const invalid of ['', 'no-es-email', null, undefined]) expect((await fails(loginWithPassword(env, req('https://raiden.pe/x'), invalid, TEMP))).status).toBe(401);
    expect((await fails(loginWithPassword(env, req('https://raiden.pe/x'), DIEGO, ''))).status).toBe(401);
    expect((await fails(loginWithPassword(env, req('https://raiden.pe/x'), DIEGO, 42))).status).toBe(401);
  });

  it('bloqueo temporal por cuenta tras N fallos (423), que caduca con el TTL; un acierto limpia el contador', async () => {
    const env = await envWith();
    const r = req('https://raiden.pe/x', { ip: '2.2.2.2' });
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS_PER_ACCOUNT; i++) expect((await fails(loginWithPassword(env, r, DIEGO, 'mal-mal-mal'))).status).toBe(401);
    // Incluso con la contraseña correcta: bloqueado
    const locked = await fails(loginWithPassword(env, r, DIEGO, TEMP));
    expect(locked.status).toBe(423);
    expect(locked.message).toMatch(/Demasiados intentos/);
    // Otra cuenta desde la misma IP sigue pudiendo entrar (el tope por IP es mayor)
    await expect(loginWithPassword(env, r, WILIAM, TEMP)).resolves.toMatchObject({ email: WILIAM });
    clock += (LOGIN_LOCKOUT_S + 1) * 1000;
    await expect(loginWithPassword(env, r, DIEGO, TEMP)).resolves.toMatchObject({ email: DIEGO });
    expect(await kv.get(`login-fail:account:${DIEGO}`, 'text')).toBeNull();
  });

  it('sin ADMIN_KV o sin SESSION_SECRET → 500 de configuración (nunca abre)', async () => {
    const env = await envWith();
    expect((await fails(loginWithPassword({ ...env, ADMIN_KV: undefined }, req('https://raiden.pe/x'), DIEGO, TEMP))).status).toBe(500);
    expect((await fails(loginWithPassword({ ...env, SESSION_SECRET: 'corto' }, req('https://raiden.pe/x'), DIEGO, TEMP))).status).toBe(500);
  });
});

describe('sessionIdentity y changePassword', () => {
  it('la cookie emitida identifica; cambiar la contraseña sube la versión y deja fuera a la cookie antigua', async () => {
    const env = await envWith();
    const r = req('https://raiden.pe/api/admin/auth/login');
    const id = await loginWithPassword(env, r, DIEGO, TEMP);
    const setCookie = await issueSession(env, r, id, nowS());
    const cookie = setCookie.split(';')[0]!;
    const withCookie = req('https://raiden.pe/api/admin/me', { headers: { Cookie: `otra=1; ${cookie}` } });
    await expect(sessionIdentity(env, withCookie, nowS())).resolves.toEqual({ email: DIEGO, mustChange: true, version: 1 });

    const changed = await changePassword(env, DIEGO, TEMP, 'mi moto azul vuela 2026');
    expect(changed).toEqual({ email: DIEGO, mustChange: false, version: 2 });
    await expect(sessionIdentity(env, withCookie, nowS())).resolves.toBeNull(); // versión 1 ya no vale
    const fresh = (await issueSession(env, r, changed, nowS())).split(';')[0]!;
    await expect(sessionIdentity(env, req('https://raiden.pe/x', { headers: { Cookie: fresh } }), nowS())).resolves.toEqual({ email: DIEGO, mustChange: false, version: 2 });
    // La temporal ya no sirve; la nueva sí
    expect((await fails(loginWithPassword(env, r, DIEGO, TEMP))).status).toBe(401);
    await expect(loginWithPassword(env, r, DIEGO, 'mi moto azul vuela 2026')).resolves.toMatchObject({ mustChange: false, version: 2 });
  });

  it('cambio: actual incorrecta → 401; nueva que incumple la política → 422 con details; usuario inexistente → 401', async () => {
    const env = await envWith();
    await loginWithPassword(env, req('https://raiden.pe/x'), DIEGO, TEMP);
    expect((await fails(changePassword(env, DIEGO, 'no-es-la-actual', 'mi moto azul vuela 2026'))).status).toBe(401);
    const weak = await fails(changePassword(env, DIEGO, TEMP, 'corta'));
    expect(weak.status).toBe(422);
    expect(weak.details).toContainEqual(expect.stringContaining(`${MIN_PASSWORD_LENGTH} caracteres`));
    expect((await fails(changePassword(env, DIEGO, TEMP, TEMP))).details).toContainEqual(expect.stringContaining('distinta'));
    expect((await fails(changePassword(env, WILIAM, TEMP, 'mi moto azul vuela 2026'))).status).toBe(401); // nunca entró: no hay registro
    // Nada de lo anterior ha tocado el registro
    expect(await readUser(kv, DIEGO)).toMatchObject({ version: 1, mustChange: true });
  });

  it('sesión caducada, firmada con otro secreto o de un usuario borrado de KV → null', async () => {
    const env = await envWith();
    const r = req('https://raiden.pe/x');
    const id = await loginWithPassword(env, r, DIEGO, TEMP);
    const cookie = (await issueSession(env, r, id, nowS())).split(';')[0]!;
    const withCookie = req('https://raiden.pe/x', { headers: { Cookie: cookie } });
    await expect(sessionIdentity(env, withCookie, nowS() + SESSION_TTL_S + 1)).resolves.toBeNull();
    await expect(sessionIdentity({ ...env, SESSION_SECRET: `${SECRET}-otro` }, withCookie, nowS())).resolves.toBeNull();
    await kv.delete(`user:${DIEGO}`);
    await expect(sessionIdentity(env, withCookie, nowS())).resolves.toBeNull();
    await expect(sessionIdentity(env, req('https://raiden.pe/x'), nowS())).resolves.toBeNull();
  });
});

describe('assertSameOrigin (CSRF)', () => {
  it('con Origin distinto en POST/PUT/PATCH/DELETE → 403; GET, sin Origin u Origin propio pasan', () => {
    const self = 'https://raiden.pe';
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(() => assertSameOrigin(new Request(`${self}/api/admin/x`, { method, headers: { Origin: 'https://evil.example' } }))).toThrow(/origen/);
      expect(() => assertSameOrigin(new Request(`${self}/api/admin/x`, { method, headers: { Origin: self } }))).not.toThrow();
      expect(() => assertSameOrigin(new Request(`${self}/api/admin/x`, { method }))).not.toThrow();
    }
    expect(() => assertSameOrigin(new Request(`${self}/api/admin/x`, { headers: { Origin: 'https://evil.example' } }))).not.toThrow();
    // null (p. ej. desde un fichero local o redirección cross-site) no es el origen propio
    expect(() => assertSameOrigin(new Request(`${self}/api/admin/x`, { method: 'POST', headers: { Origin: 'null' } }))).toThrow();
  });
});

describe('rutas /auth/* y middleware (integración)', () => {
  type Ctx = Parameters<typeof onRequest>[0];
  const ORIGIN = 'https://raiden.pe';

  function run(request: Request, env: Env, next: () => Promise<Response> = async () => new Response('ok', { status: 200 })) {
    const data: Record<string, unknown> = {};
    const context = { request, env, data, params: {}, functionPath: new URL(request.url).pathname, waitUntil: () => {}, passThroughOnException: () => {}, next } as unknown as Ctx;
    return { data, response: onRequest(context) };
  }
  const route = (fn: typeof loginRoute, request: Request, env: Env, data: Record<string, unknown> = {}) =>
    fn({ request, env, data, params: {}, functionPath: '', waitUntil: () => {}, passThroughOnException: () => {}, next: async () => new Response('') } as unknown as Parameters<typeof loginRoute>[0]);

  it('login correcto → 200 con AdminUser (mustChangePassword) y Set-Cookie; el middleware deja pasar /auth/login sin sesión', async () => {
    const env = await envWith();
    const next = vi.fn(async () => new Response('login'));
    const res = await run(postJson(`${ORIGIN}/api/admin/auth/login`, { email: DIEGO, password: TEMP }, { Origin: ORIGIN }), env, next).response;
    expect(res.status).toBe(200);
    expect(next).toHaveBeenCalled();
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const login = await route(loginRoute, postJson(`${ORIGIN}/api/admin/auth/login`, { email: DIEGO, password: TEMP }), env);
    expect(login.status).toBe(200);
    const cookie = login.headers.get('Set-Cookie')!;
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+; Path=/api/admin;.*HttpOnly; SameSite=Strict; Secure$`));
    expect(await login.json()).toEqual({ email: DIEGO, role: 'admin', admins: [DIEGO], editors: [WILIAM], localMode: false, branch: 'main', mustChangePassword: true });
  });

  it('credenciales incorrectas → 401 sin cookie; cuerpo no JSON → 400 (sin Content-Type → 415); email con contraseña válida pero sin rol → 401 sin cookie', async () => {
    const env = await envWith({}, { [DIEGO]: TEMP, 'expulsado@example.com': TEMP });
    const bad = await route(loginRoute, postJson(`${ORIGIN}/api/admin/auth/login`, { email: DIEGO, password: 'mal-mal-mal' }), env);
    expect(bad.status).toBe(401);
    expect(bad.headers.get('Set-Cookie')).toBeNull();
    expect((await route(loginRoute, req(`${ORIGIN}/api/admin/auth/login`, { method: 'POST', body: 'no json', headers: { 'Content-Type': 'application/json' } }), env)).status).toBe(400);
    // Sin Content-Type JSON ni siquiera se lee el cuerpo (415): un formulario de otro sitio no puede intentar un login
    expect((await route(loginRoute, req(`${ORIGIN}/api/admin/auth/login`, { method: 'POST', body: '{}' }), env)).status).toBe(415);
    const noRole = await route(loginRoute, postJson(`${ORIGIN}/api/admin/auth/login`, { email: 'expulsado@example.com', password: TEMP }), env);
    expect(noRole.status).toBe(401);
    expect(noRole.headers.get('Set-Cookie')).toBeNull();
    expect(((await noRole.json()) as { error: string }).error).toMatch(/no tiene acceso/);
  });

  it('con la cookie el middleware resuelve el usuario; con contraseña temporal solo deja /me, /auth/password y /auth/logout', async () => {
    const env = await envWith();
    const login = await route(loginRoute, postJson(`${ORIGIN}/api/admin/auth/login`, { email: WILIAM, password: TEMP }), env);
    const cookie = login.headers.get('Set-Cookie')!.split(';')[0]!;
    const headers = { Cookie: cookie, Origin: ORIGIN };

    const me = run(req(`${ORIGIN}/api/admin/me`, { headers }), env);
    expect((await me.response).status).toBe(200);
    expect(me.data.user).toEqual({ email: WILIAM, role: 'editor', admins: [DIEGO], editors: [WILIAM], localMode: false, branch: 'main', mustChangePassword: true });

    const next = vi.fn(async () => new Response('ok'));
    const catalog = await run(req(`${ORIGIN}/api/admin/catalog`, { headers }), env, next).response;
    expect(catalog.status).toBe(403);
    expect(((await catalog.json()) as { error: string }).error).toMatch(/contraseña temporal/);
    expect(next).not.toHaveBeenCalled();

    // Cambia la contraseña: nueva cookie, mustChangePassword desaparece y el catálogo ya responde
    const { data, response: mw } = run(req(`${ORIGIN}/api/admin/auth/password`, { headers }), env);
    expect((await mw).status).toBe(200); // el middleware deja pasar /auth/password con la temporal
    const changed = await route(passwordRoute, postJson(`${ORIGIN}/api/admin/auth/password`, { currentPassword: TEMP, newPassword: 'mi moto azul vuela 2026' }, headers), env, data);
    expect(changed.status).toBe(200);
    // La respuesta al editor nunca lleva la lista de administradores (tampoco la del login)
    expect(await login.json()).toEqual({ email: WILIAM, role: 'editor', admins: [], editors: [WILIAM], localMode: false, branch: 'main', mustChangePassword: true });
    expect(await changed.json()).toEqual({ email: WILIAM, role: 'editor', admins: [], editors: [WILIAM], localMode: false, branch: 'main' });
    const cookie2 = changed.headers.get('Set-Cookie')!.split(';')[0]!;
    expect(cookie2).not.toBe(cookie);
    expect((await run(req(`${ORIGIN}/api/admin/catalog`, { headers: { Cookie: cookie2 } }), env).response).status).toBe(200);
    // La cookie antigua (versión 1) queda invalidada
    expect((await run(req(`${ORIGIN}/api/admin/me`, { headers: { Cookie: cookie } }), env).response).status).toBe(401);
  });

  it('sin cookie → 401; cookie manipulada → 401; Origin ajeno en una escritura → 403 antes de nada; logout borra la cookie sin exigir sesión', async () => {
    const env = await envWith();
    const next = vi.fn(async () => new Response('ok'));
    expect((await run(req(`${ORIGIN}/api/admin/me`), env, next).response).status).toBe(401);
    expect((await run(req(`${ORIGIN}/api/admin/me`, { headers: { Cookie: `${SESSION_COOKIE}=abc.def` } }), env, next).response).status).toBe(401);
    const csrf = await run(req(`${ORIGIN}/api/admin/products/x`, { method: 'PATCH', headers: { Origin: 'https://evil.example' } }), env, next).response;
    expect(csrf.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
    const out = await route(logoutRoute, req(`${ORIGIN}/api/admin/auth/logout`, { method: 'POST' }), env);
    expect(out.status).toBe(200);
    expect(out.headers.get('Set-Cookie')).toContain('Max-Age=0');
    // El middleware deja pasar /auth/logout sin cookie
    const pass = vi.fn(async () => new Response('bye'));
    expect((await run(req(`${ORIGIN}/api/admin/auth/logout`, { method: 'POST', headers: { Origin: ORIGIN } }), env, pass).response).status).toBe(200);
    expect(pass).toHaveBeenCalled();
  });

  it('sin ADMIN_KV / SESSION_SECRET el middleware responde 500 de configuración y no ejecuta la ruta', async () => {
    const next = vi.fn(async () => new Response('ok'));
    const res = await run(req(`${ORIGIN}/api/admin/me`), { ADMIN_EMAILS: DIEGO }, next).response;
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: 'config' });
    expect(next).not.toHaveBeenCalled();
  });

  it('en modo local /auth/password responde 403 (no hay contraseña que cambiar)', async () => {
    const env = await envWith({ ADMIN_LOCAL_USER: DIEGO });
    const { data, response } = run(req('http://localhost:8788/api/admin/auth/password', { method: 'POST', body: '{}' }), env);
    expect((await response).status).toBe(200);
    const res = await route(passwordRoute, postJson('http://localhost:8788/api/admin/auth/password', { currentPassword: 'a', newPassword: 'mi moto azul vuela 2026' }), env, data);
    expect(res.status).toBe(403);
  });
});
