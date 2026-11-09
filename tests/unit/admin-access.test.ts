import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_USER_HEADER } from '../../src/domain/admin';
import {
  AccessError,
  authenticate,
  extractToken,
  isLocalHost,
  localIdentity,
  normalizeTeamDomain,
  resetJwksCache,
  verifyAccessJwt,
  type AccessConfig,
} from '../../functions/api/admin/_lib/access';
import { hashPassword, issueSession, loginWithPassword } from '../../functions/api/admin/_lib/auth';
import type { Env } from '../../functions/api/admin/_lib/env';
import { HttpError } from '../../functions/api/admin/_lib/http';
import { onRequest } from '../../functions/api/admin/_middleware';
import { memoryKv } from './memoryKv';

/**
 * Identidad del panel (ADR-018, ADR-024): sesión por contraseña como vía normal, modo local en localhost y
 * Cloudflare Access como segunda barrera opcional (JWT RS256 verificado con WebCrypto contra el JWKS).
 */

const TEAM = 'raiden.cloudflareaccess.com';
const AUD = 'aud-de-prueba-1234567890abcdef';
const cfg: AccessConfig = { teamHost: TEAM, aud: AUD };
const NOW = 1_800_000_000; // segundos Unix fijos
const SECRET = 'secreto-de-pruebas-con-mas-de-treinta-y-dos-caracteres';
const TEMP = 'Temporal-1234-abcd';

const b64url = (bytes: Uint8Array | string): string => {
  const bin = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)) as Uint8Array);

let privateKey: CryptoKey;
let jwk: JsonWebKey & { kid: string };
let otherPrivateKey: CryptoKey;
const KID = 'kid-principal';

async function generatePair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
}

async function sign(claims: Record<string, unknown>, opts: { key?: CryptoKey; kid?: string; alg?: string } = {}): Promise<string> {
  const header = b64urlJson({ alg: opts.alg ?? 'RS256', typ: 'JWT', kid: opts.kid ?? KID });
  const payload = b64urlJson(claims);
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, opts.key ?? privateKey, data));
  return `${header}.${payload}.${b64url(sig)}`;
}

const validClaims = (over: Record<string, unknown> = {}) => ({
  aud: [AUD],
  iss: `https://${TEAM}`,
  email: 'Diego@Example.com',
  iat: NOW - 10,
  nbf: NOW - 10,
  exp: NOW + 3600,
  ...over,
});

/** Claims válidos "ahora" (para los tests que pasan por el middleware, que usa Date.now()). */
const freshClaims = (over: Record<string, unknown> = {}) => {
  const now = Math.floor(Date.now() / 1000);
  return validClaims({ iat: now - 10, nbf: now - 10, exp: now + 3600, ...over });
};

/** Env con login por contraseña activo y una cookie de sesión ya emitida para `email`. */
async function passwordEnv(email: string, over: Partial<Env> = {}): Promise<{ env: Env; cookie: string }> {
  const kv = memoryKv();
  const env: Env = { ADMIN_KV: kv as unknown as Env['ADMIN_KV'], SESSION_SECRET: SECRET, ADMIN_INITIAL_PASSWORDS: `${email}:${await hashPassword(TEMP, 1000)}`, ...over };
  const request = new Request('https://raiden.pages.dev/api/admin/auth/login');
  const identity = await loginWithPassword(env, request, email, TEMP);
  const cookie = (await issueSession(env, request, identity)).split(';')[0]!;
  return { env, cookie };
}

const jwksFetch = vi.fn();

beforeAll(async () => {
  const pair = await generatePair();
  privateKey = pair.privateKey;
  const exported = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  jwk = { ...exported, kid: KID, alg: 'RS256', use: 'sig' };
  otherPrivateKey = (await generatePair()).privateKey;
});

beforeEach(() => {
  resetJwksCache();
  jwksFetch.mockReset();
  jwksFetch.mockImplementation(async (url: string) => {
    expect(url).toBe(`https://${TEAM}/cdn-cgi/access/certs`);
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', jwksFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeTeamDomain', () => {
  it('acepta el nombre corto, el host completo o una URL', () => {
    expect(normalizeTeamDomain('raiden')).toBe(TEAM);
    expect(normalizeTeamDomain('Raiden.cloudflareaccess.com')).toBe(TEAM);
    expect(normalizeTeamDomain('https://raiden.cloudflareaccess.com/')).toBe(TEAM);
    expect(normalizeTeamDomain(' ')).toBeNull();
    expect(normalizeTeamDomain(undefined)).toBeNull();
  });
});

describe('verifyAccessJwt', () => {
  it('JWT válido → email normalizado', async () => {
    const token = await sign(validClaims());
    await expect(verifyAccessJwt(token, cfg, { now: NOW })).resolves.toEqual({ email: 'diego@example.com' });
    expect(jwksFetch).toHaveBeenCalledTimes(1);
  });

  it('acepta aud como string y cachea el JWKS entre verificaciones', async () => {
    await verifyAccessJwt(await sign(validClaims({ aud: AUD })), cfg, { now: NOW });
    await verifyAccessJwt(await sign(validClaims()), cfg, { now: NOW });
    expect(jwksFetch).toHaveBeenCalledTimes(1);
  });

  it('aud incorrecto → rechazo', async () => {
    const token = await sign(validClaims({ aud: ['otra-app'] }));
    await expect(verifyAccessJwt(token, cfg, { now: NOW })).rejects.toThrow(/aud/);
  });

  it('iss incorrecto → rechazo', async () => {
    const token = await sign(validClaims({ iss: 'https://otro.cloudflareaccess.com' }));
    await expect(verifyAccessJwt(token, cfg, { now: NOW })).rejects.toThrow(/iss/);
  });

  it('expirado → rechazo (con 60 s de tolerancia)', async () => {
    await expect(verifyAccessJwt(await sign(validClaims({ exp: NOW - 120 })), cfg, { now: NOW })).rejects.toThrow(/caducado/);
    await expect(verifyAccessJwt(await sign(validClaims({ exp: NOW - 30 })), cfg, { now: NOW })).resolves.toBeTruthy();
  });

  it('nbf en el futuro → rechazo', async () => {
    await expect(verifyAccessJwt(await sign(validClaims({ nbf: NOW + 300 })), cfg, { now: NOW })).rejects.toThrow(/todavía no válido/);
  });

  it('firma con otra clave → rechazo', async () => {
    const token = await sign(validClaims(), { key: otherPrivateKey });
    await expect(verifyAccessJwt(token, cfg, { now: NOW })).rejects.toThrow(/firma/);
  });

  it('payload manipulado tras firmar → rechazo', async () => {
    const token = await sign(validClaims());
    const [h, , s] = token.split('.');
    const tampered = `${h}.${b64urlJson(validClaims({ email: 'intruso@example.com' }))}.${s}`;
    await expect(verifyAccessJwt(tampered, cfg, { now: NOW })).rejects.toThrow(/firma/);
  });

  it('kid desconocido → refresca el JWKS una vez y rechaza', async () => {
    const token = await sign(validClaims(), { kid: 'kid-rotado' });
    await verifyAccessJwt(await sign(validClaims()), cfg, { now: NOW }); // llena la caché
    await expect(verifyAccessJwt(token, cfg, { now: NOW })).rejects.toThrow(/kid/);
    expect(jwksFetch).toHaveBeenCalledTimes(2);
  });

  it('kid rotado que aparece al refrescar → acepta', async () => {
    await verifyAccessJwt(await sign(validClaims()), cfg, { now: NOW });
    const rotated = await generatePair();
    const rotatedJwk = { ...((await crypto.subtle.exportKey('jwk', rotated.publicKey)) as JsonWebKey), kid: 'kid-nuevo' };
    jwksFetch.mockImplementation(async () => new Response(JSON.stringify({ keys: [jwk, rotatedJwk] })));
    const token = await sign(validClaims(), { key: rotated.privateKey, kid: 'kid-nuevo' });
    await expect(verifyAccessJwt(token, cfg, { now: NOW })).resolves.toEqual({ email: 'diego@example.com' });
  });

  it('alg distinto de RS256, sin kid, sin email o malformado → rechazo', async () => {
    await expect(verifyAccessJwt(await sign(validClaims(), { alg: 'HS256' }), cfg, { now: NOW })).rejects.toThrow(/algoritmo/);
    await expect(verifyAccessJwt(await sign(validClaims(), { kid: '' }), cfg, { now: NOW })).rejects.toThrow(/kid/);
    await expect(verifyAccessJwt(await sign(validClaims({ email: undefined })), cfg, { now: NOW })).rejects.toThrow(/email/);
    await expect(verifyAccessJwt('no.es.un.jwt', cfg)).rejects.toBeInstanceOf(AccessError);
    await expect(verifyAccessJwt('abc', cfg)).rejects.toThrow(/malformado/);
  });

  it('alg "none" (sin firma), sin alg, o firma que no es base64 → AccessError (401), nunca un 500', async () => {
    const payload = b64urlJson(validClaims());
    const none = `${b64urlJson({ alg: 'none', kid: KID })}.${payload}.`;
    await expect(verifyAccessJwt(none, cfg, { now: NOW })).rejects.toThrow(/algoritmo/);
    const sinAlg = `${b64urlJson({ kid: KID })}.${payload}.${b64url('x')}`;
    await expect(verifyAccessJwt(sinAlg, cfg, { now: NOW })).rejects.toThrow(/algoritmo/);
    // Cabecera correcta pero firma vacía o con caracteres fuera de base64url: no llega a WebCrypto
    const header = b64urlJson({ alg: 'RS256', kid: KID });
    await expect(verifyAccessJwt(`${header}.${payload}.`, cfg, { now: NOW })).rejects.toThrow(/sin firma/);
    const bad = await verifyAccessJwt(`${header}.${payload}.%%%no-base64%%%`, cfg, { now: NOW }).catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(AccessError);
    expect(jwksFetch).not.toHaveBeenCalled(); // se rechaza antes de descargar el JWKS
  });

  it('JWKS inaccesible, con error HTTP, o que no es JSON → AccessError (cierre por defecto)', async () => {
    jwksFetch.mockImplementation(async () => new Response('<html>oops</html>', { status: 200 }));
    await expect(verifyAccessJwt(await sign(validClaims()), cfg, { now: NOW })).rejects.toThrow(/JWKS de Access no es JSON/);
    resetJwksCache();
    jwksFetch.mockImplementation(async () => new Response('', { status: 503 }));
    await expect(verifyAccessJwt(await sign(validClaims()), cfg, { now: NOW })).rejects.toThrow(/respondió 503/);
    resetJwksCache();
    jwksFetch.mockImplementation(async () => {
      throw new Error('ENOTFOUND');
    });
    await expect(verifyAccessJwt(await sign(validClaims()), cfg, { now: NOW })).rejects.toThrow(/no se pudo descargar/);
    resetJwksCache();
    jwksFetch.mockImplementation(async () => new Response(JSON.stringify({ keys: 'nada' })));
    await expect(verifyAccessJwt(await sign(validClaims()), cfg, { now: NOW })).rejects.toThrow(/kid desconocido/);
  });

  it('aud debe coincidir exactamente: ni prefijo, ni lista con otra app sin la nuestra', async () => {
    await expect(verifyAccessJwt(await sign(validClaims({ aud: `${AUD}x` })), cfg, { now: NOW })).rejects.toThrow(/aud/);
    await expect(verifyAccessJwt(await sign(validClaims({ aud: AUD.slice(0, 10) })), cfg, { now: NOW })).rejects.toThrow(/aud/);
    await expect(verifyAccessJwt(await sign(validClaims({ aud: undefined })), cfg, { now: NOW })).rejects.toThrow(/aud/);
    await expect(verifyAccessJwt(await sign(validClaims({ aud: ['otra', AUD] })), cfg, { now: NOW })).resolves.toBeTruthy();
  });

  it('iss debe ser exactamente https://<equipo>: ni http, ni sufijo, ni subdominio', async () => {
    for (const iss of [`http://${TEAM}`, `https://${TEAM}/`, `https://evil.${TEAM}`, `https://${TEAM}.evil.com`, undefined]) {
      await expect(verifyAccessJwt(await sign(validClaims({ iss })), cfg, { now: NOW }), String(iss)).rejects.toThrow(/iss/);
    }
  });

  it('exp ausente o no numérico → rechazo', async () => {
    await expect(verifyAccessJwt(await sign(validClaims({ exp: undefined })), cfg, { now: NOW })).rejects.toThrow(/caducado/);
    await expect(verifyAccessJwt(await sign(validClaims({ exp: String(NOW + 3600) })), cfg, { now: NOW })).rejects.toThrow(/caducado/);
  });

  it('la cookie CF_Authorization se verifica igual que la cabecera (con la sesión por contraseña ya abierta)', async () => {
    const { env, cookie } = await passwordEnv('diego@example.com', { CF_ACCESS_TEAM_DOMAIN: 'raiden', CF_ACCESS_AUD: AUD });
    const now = Math.floor(Date.now() / 1000);
    const ok = new Request('https://raiden.pages.dev/api/admin/me', { headers: { Cookie: `${cookie}; CF_Authorization=${await sign(freshClaims())}` } });
    await expect(authenticate(ok, env, { now })).resolves.toEqual({ email: 'diego@example.com', localMode: false, mustChange: true });
    const forged = new Request('https://raiden.pages.dev/api/admin/me', { headers: { Cookie: `${cookie}; CF_Authorization=${await sign(freshClaims(), { key: otherPrivateKey })}` } });
    await expect(authenticate(forged, env, { now })).rejects.toMatchObject({ status: 401 });
  });
});

describe('extractToken', () => {
  it('prefiere la cabecera y cae a la cookie CF_Authorization', () => {
    expect(extractToken(new Request('https://x.test/', { headers: { 'Cf-Access-Jwt-Assertion': 'tok-h', Cookie: 'CF_Authorization=tok-c' } }))).toBe('tok-h');
    expect(extractToken(new Request('https://x.test/', { headers: { Cookie: 'a=1; CF_Authorization=tok-c; b=2' } }))).toBe('tok-c');
    expect(extractToken(new Request('https://x.test/'))).toBeNull();
  });
});

describe('modo local', () => {
  const localEnv: Env = { ADMIN_LOCAL_USER: 'diegoo.1795@gmail.com', NODE_ENV: 'development' };
  const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

  it('isLocalHost solo acepta localhost, 127.0.0.1 y [::1]', () => {
    expect(isLocalHost('localhost')).toBe(true);
    expect(isLocalHost('127.0.0.1')).toBe(true);
    expect(isLocalHost('[::1]')).toBe(true);
    expect(isLocalHost('raiden.pages.dev')).toBe(false);
    expect(isLocalHost('localhost.evil.com')).toBe(false);
  });

  it('activo solo con host local + ADMIN_LOCAL_USER + NODE_ENV ≠ production', () => {
    expect(localIdentity(req('http://localhost:8788/api/admin/me'), localEnv)).toBe('diegoo.1795@gmail.com');
    expect(localIdentity(req('http://127.0.0.1:8788/api/admin/me'), localEnv)).toBe('diegoo.1795@gmail.com');
    expect(localIdentity(req('http://[::1]:8788/api/admin/me'), localEnv)).toBe('diegoo.1795@gmail.com');
    expect(localIdentity(req('http://localhost:8788/api/admin/me'), { ...localEnv, NODE_ENV: 'production' })).toBeNull();
    expect(localIdentity(req('http://localhost:8788/api/admin/me'), { NODE_ENV: 'development' })).toBeNull();
  });

  it('con host no local se ignora ADMIN_LOCAL_USER y se avisa por console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(localIdentity(req('https://raiden.pages.dev/api/admin/me'), localEnv)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no es local'));
    warn.mockRestore();
  });

  it('la cabecera x-admin-local-user solo cuenta en modo local', async () => {
    expect(localIdentity(req('http://localhost:8788/x', { [LOCAL_USER_HEADER]: 'wiliam@example.com' }), localEnv)).toBe('wiliam@example.com');
    // Producción: la cabecera no otorga identidad; sin sesión → 401
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { env } = await passwordEnv('diego@example.com', { ...localEnv });
    await expect(authenticate(req('https://raiden.pages.dev/api/admin/me', { [LOCAL_USER_HEADER]: 'wiliam@example.com' }), env)).rejects.toMatchObject({ status: 401 });
    warn.mockRestore();
  });
});

describe('authenticate', () => {
  it('modo local → localMode: true y email en minúsculas', async () => {
    const env: Env = { ADMIN_LOCAL_USER: 'Diegoo.1795@gmail.com' };
    await expect(authenticate(new Request('http://localhost:8788/api/admin/me'), env)).resolves.toEqual({ email: 'diegoo.1795@gmail.com', localMode: true, mustChange: false });
  });

  it('sesión por contraseña válida → identidad (sin Access configurado no se exige JWT)', async () => {
    const { env, cookie } = await passwordEnv('diego@example.com');
    const request = new Request('https://raiden.pages.dev/api/admin/me', { headers: { Cookie: cookie } });
    await expect(authenticate(request, env)).resolves.toEqual({ email: 'diego@example.com', localMode: false, mustChange: true });
  });

  it('sin cookie → 401; cookie manipulada → 401 unauthorized', async () => {
    const { env, cookie } = await passwordEnv('diego@example.com');
    await expect(authenticate(new Request('https://raiden.pages.dev/api/admin/me'), env)).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    const bad = new Request('https://raiden.pages.dev/api/admin/me', { headers: { Cookie: `${cookie}x` } });
    await expect(authenticate(bad, env)).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
  });

  it('con Access configurado: sesión sin JWT → 401; JWT de otro email → 403; solo JWT sin sesión → 401; ambos coherentes → identidad', async () => {
    const { env, cookie } = await passwordEnv('diego@example.com', { CF_ACCESS_TEAM_DOMAIN: 'raiden', CF_ACCESS_AUD: AUD });
    const now = Math.floor(Date.now() / 1000);
    await expect(authenticate(new Request('https://raiden.pages.dev/api/admin/me', { headers: { Cookie: cookie } }), env, { now })).rejects.toMatchObject({ status: 401 });
    const other = new Request('https://raiden.pages.dev/api/admin/me', { headers: { Cookie: cookie, 'Cf-Access-Jwt-Assertion': await sign(freshClaims({ email: 'intruso@example.com' })) } });
    await expect(authenticate(other, env, { now })).rejects.toMatchObject({ status: 403 });
    // Access es segunda barrera, no sustituto: el JWT solo no abre
    await expect(authenticate(new Request('https://raiden.pages.dev/api/admin/me', { headers: { 'Cf-Access-Jwt-Assertion': await sign(freshClaims()) } }), env, { now })).rejects.toMatchObject({ status: 401 });
    const both = new Request('https://raiden.pages.dev/api/admin/me', { headers: { Cookie: cookie, 'Cf-Access-Jwt-Assertion': await sign(freshClaims()) } });
    await expect(authenticate(both, env, { now })).resolves.toEqual({ email: 'diego@example.com', localMode: false, mustChange: true });
  });

  it('sin ADMIN_KV / SESSION_SECRET en producción → 500 de configuración, nunca abre el panel', async () => {
    const request = new Request('https://raiden.pages.dev/api/admin/me');
    const err = await authenticate(request, { CF_ACCESS_TEAM_DOMAIN: 'raiden', CF_ACCESS_AUD: AUD }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 500 });
    expect((err as HttpError).message).toMatch(/ADMIN_KV/);
    await expect(authenticate(request, {})).rejects.toMatchObject({ status: 500 });
  });

  it('con ADMIN_LOCAL_USER definido por error en producción (host no local) se sigue exigiendo la sesión', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { env, cookie } = await passwordEnv('diego@example.com', { ADMIN_LOCAL_USER: 'diegoo.1795@gmail.com', NODE_ENV: 'development' });
    await expect(authenticate(new Request('https://raiden.pages.dev/api/admin/me'), env)).rejects.toMatchObject({ status: 401 });
    const withSession = new Request('https://raiden.pages.dev/api/admin/me', { headers: { Cookie: cookie, [LOCAL_USER_HEADER]: 'intruso@example.com' } });
    // La identidad es la de la sesión, nunca la de la cabecera local
    await expect(authenticate(withSession, env)).resolves.toEqual({ email: 'diego@example.com', localMode: false, mustChange: true });
    warn.mockRestore();
  });
});

describe('middleware /api/admin/* (integración)', () => {
  const lists = { ADMIN_EMAILS: 'Diego@example.com', EDITOR_EMAILS: 'wiliam@example.com' };

  type Ctx = Parameters<typeof onRequest>[0];
  function run(request: Request, env: Env, next: () => Promise<Response> = async () => new Response('ok', { status: 200 })) {
    const data: Record<string, unknown> = {};
    const context = {
      request,
      env,
      data,
      params: {},
      functionPath: '/api/admin/me',
      waitUntil: () => {},
      passThroughOnException: () => {},
      next,
    } as unknown as Ctx;
    return { data, response: onRequest(context) };
  }

  it('sin sesión → 401 JSON con no-store y sin ejecutar la ruta', async () => {
    const { env } = await passwordEnv('diego@example.com', lists);
    const next = vi.fn(async () => new Response('ok'));
    const res = await run(new Request('https://raiden.pages.dev/api/admin/me'), env, next).response;
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ code: 'unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('sesión válida pero email fuera de las listas → 403 y la ruta no se ejecuta', async () => {
    const next = vi.fn(async () => new Response('ok'));
    const { env, cookie } = await passwordEnv('intruso@example.com', lists);
    const res = await run(new Request('https://raiden.pages.dev/api/admin/me', { headers: { Cookie: cookie } }), env, next).response;
    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(next).not.toHaveBeenCalled();
  });

  it('admin válido → la ruta recibe el usuario con rol resuelto en servidor y la respuesta lleva no-store', async () => {
    const { env, cookie } = await passwordEnv('diego@example.com', lists);
    const { data, response } = run(new Request('https://raiden.pages.dev/api/admin/me', { headers: { Cookie: cookie } }), env);
    const res = await response;
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(data.user).toEqual({ email: 'diego@example.com', role: 'admin', admins: ['diego@example.com'], editors: ['wiliam@example.com'], localMode: false, branch: 'main', mustChangePassword: true });
  });

  it('con Access configurado además de la sesión: sin JWT → 401; con JWT coherente → 200', async () => {
    const { env, cookie } = await passwordEnv('diego@example.com', { ...lists, CF_ACCESS_TEAM_DOMAIN: 'raiden', CF_ACCESS_AUD: AUD });
    const next = vi.fn(async () => new Response('ok'));
    expect((await run(new Request('https://raiden.pages.dev/api/admin/me', { headers: { Cookie: cookie } }), env, next).response).status).toBe(401);
    expect(next).not.toHaveBeenCalled();
    const ok = await run(new Request('https://raiden.pages.dev/api/admin/me', { headers: { Cookie: cookie, 'Cf-Access-Jwt-Assertion': await sign(freshClaims()) } }), env, next).response;
    expect(ok.status).toBe(200);
  });

  it('sin configuración del login (ADMIN_KV / SESSION_SECRET) → 500 de configuración (nunca deja pasar)', async () => {
    const next = vi.fn(async () => new Response('ok'));
    const res = await run(new Request('https://raiden.pages.dev/api/admin/me'), { ADMIN_EMAILS: 'diego@example.com' }, next).response;
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: 'config' });
    expect(next).not.toHaveBeenCalled();
  });

  it('excepción inesperada en la ruta → 500 genérico sin stack ni detalles', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { env, cookie } = await passwordEnv('diego@example.com', lists);
    const res = await run(new Request('https://raiden.pages.dev/api/admin/me', { headers: { Cookie: cookie } }), env, async () => {
      throw new Error('secreto interno ghp_xxx');
    }).response;
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; details?: unknown };
    expect(body.error).toBe('Error interno del panel');
    expect(body.details).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('ghp_xxx');
    error.mockRestore();
  });
});
