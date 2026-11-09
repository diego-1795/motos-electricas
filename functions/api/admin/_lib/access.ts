import { LOCAL_USER_HEADER } from '../../../../src/domain/admin';
import { passwordAuthConfigured, sessionIdentity } from './auth';
import type { Env } from './env';
import { configError, forbidden, unauthorized } from './http';

/**
 * Autenticación del panel (ADR-018, ADR-024). Orden:
 *  1. Local (`wrangler pages dev`): identidad simulada SOLO si ADMIN_LOCAL_USER está definido,
 *     NODE_ENV !== 'production' y el host es localhost / 127.0.0.1 / [::1].
 *  2. Sesión por contraseña: cookie firmada emitida por POST /auth/login (auth.ts). Es la vía normal.
 *  3. Cloudflare Access (opcional, segunda barrera): si CF_ACCESS_TEAM_DOMAIN y CF_ACCESS_AUD están
 *     definidos se exige además el JWT (`Cf-Access-Jwt-Assertion` o cookie `CF_Authorization`),
 *     verificado RS256 con WebCrypto contra el JWKS del equipo, y su email debe ser el de la sesión.
 * Nunca se registra el JWT, la cookie ni el token completo.
 */

export const JWT_HEADER = 'Cf-Access-Jwt-Assertion';
export const JWT_COOKIE = 'CF_Authorization';
const CLOCK_SKEW_S = 60;
const JWKS_TTL_MS = 60 * 60 * 1000;

export interface AccessConfig {
  /** Host completo del equipo: `raiden.cloudflareaccess.com` */
  teamHost: string;
  aud: string;
}

export interface Identity {
  email: string;
  localMode: boolean;
  /** true mientras la contraseña siga siendo la temporal (ADR-024) */
  mustChange: boolean;
}

export class AccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessError';
  }
}

/* ---------- Configuración ---------- */

/** `raiden`, `raiden.cloudflareaccess.com`, `https://raiden.cloudflareaccess.com/` → `raiden.cloudflareaccess.com` */
export function normalizeTeamDomain(raw: string | undefined): string | null {
  let s = (raw ?? '').trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!s) return null;
  return s.includes('.') ? s : `${s}.cloudflareaccess.com`;
}

export function accessConfig(env: Env): AccessConfig | null {
  const teamHost = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  const aud = env.CF_ACCESS_AUD?.trim();
  if (!teamHost || !aud) return null;
  return { teamHost, aud };
}

export const issuerOf = (cfg: AccessConfig): string => `https://${cfg.teamHost}`;
export const jwksUrlOf = (cfg: AccessConfig): string => `https://${cfg.teamHost}/cdn-cgi/access/certs`;

/* ---------- Modo local ---------- */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname.toLowerCase());
}

/** Email simulado si (y solo si) se cumplen las tres condiciones del modo local; si no, null. */
export function localIdentity(request: Request, env: Env): string | null {
  const configured = env.ADMIN_LOCAL_USER?.trim();
  if (!configured) return null;
  if ((env.NODE_ENV ?? '').toLowerCase() === 'production') return null;
  const hostname = new URL(request.url).hostname;
  if (!isLocalHost(hostname)) {
    console.warn(`[admin] ADMIN_LOCAL_USER definido pero el host "${hostname}" no es local: se ignora y se exige Cloudflare Access`);
    return null;
  }
  const override = request.headers.get(LOCAL_USER_HEADER)?.trim();
  return override || configured;
}

/* ---------- JWT ---------- */

export function extractToken(request: Request): string | null {
  const header = request.headers.get(JWT_HEADER)?.trim();
  if (header) return header;
  const cookie = request.headers.get('Cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === JWT_COOKIE && rest.length) return rest.join('=').trim();
  }
  return null;
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson(segment: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('no es un objeto');
    return parsed as Record<string, unknown>;
  } catch {
    throw new AccessError('JWT malformado');
  }
}

interface Jwk extends JsonWebKey {
  kid?: string;
}

interface JwksCacheEntry {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
}

const jwksCache = new Map<string, JwksCacheEntry>();

/** Solo para tests. */
export function resetJwksCache(): void {
  jwksCache.clear();
}

async function importJwk(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

async function loadJwks(cfg: AccessConfig, fetchImpl: typeof fetch): Promise<Map<string, CryptoKey>> {
  const url = jwksUrlOf(cfg);
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  } catch (e) {
    throw new AccessError(`no se pudo descargar el JWKS de Access (${e instanceof Error ? e.message : 'fetch'})`);
  }
  if (!res.ok) throw new AccessError(`el JWKS de Access respondió ${res.status}`);
  let body: { keys?: Jwk[] };
  try {
    body = (await res.json()) as { keys?: Jwk[] };
  } catch {
    throw new AccessError('el JWKS de Access no es JSON válido');
  }
  const keys = new Map<string, CryptoKey>();
  for (const jwk of Array.isArray(body?.keys) ? body.keys : []) {
    if (!jwk.kid || (jwk.kty && jwk.kty !== 'RSA')) continue;
    try {
      keys.set(jwk.kid, await importJwk(jwk));
    } catch {
      // clave no importable: se ignora, el kid no se encontrará
    }
  }
  jwksCache.set(cfg.teamHost, { keys, fetchedAt: Date.now() });
  return keys;
}

async function keyFor(kid: string, cfg: AccessConfig, fetchImpl: typeof fetch): Promise<CryptoKey> {
  const cached = jwksCache.get(cfg.teamHost);
  const fresh = cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS;
  let keys = fresh ? cached.keys : await loadJwks(cfg, fetchImpl);
  let key = keys.get(kid);
  if (!key && fresh) {
    // rotación de claves: refrescar una vez
    keys = await loadJwks(cfg, fetchImpl);
    key = keys.get(kid);
  }
  if (!key) throw new AccessError('kid desconocido en el JWKS de Access');
  return key;
}

export interface VerifyOptions {
  /** Segundos Unix "ahora" (tests) */
  now?: number;
  fetchImpl?: typeof fetch;
}

/** Verifica firma y claims; devuelve el email. Lanza AccessError si algo no cuadra. */
export async function verifyAccessJwt(token: string, cfg: AccessConfig, opts: VerifyOptions = {}): Promise<{ email: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AccessError('JWT malformado');
  const [h, p, s] = parts as [string, string, string];
  const header = decodeJson(h);
  if (header.alg !== 'RS256') throw new AccessError('algoritmo del JWT no admitido');
  if (typeof header.kid !== 'string' || !header.kid) throw new AccessError('JWT sin kid');

  // Firma: cualquier fallo de decodificación es un JWT malformado (401), nunca un 500.
  let signature: Uint8Array;
  try {
    signature = base64UrlToBytes(s);
  } catch {
    throw new AccessError('JWT malformado');
  }
  if (!signature.length) throw new AccessError('JWT sin firma');

  const key = await keyFor(header.kid, cfg, opts.fetchImpl ?? fetch);
  const data = new TextEncoder().encode(`${h}.${p}`);
  const ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signature as BufferSource, data as BufferSource);
  if (!ok) throw new AccessError('firma del JWT inválida');

  const claims = decodeJson(p);
  const audList = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audList.includes(cfg.aud)) throw new AccessError('aud del JWT no coincide con CF_ACCESS_AUD');
  if (claims.iss !== issuerOf(cfg)) throw new AccessError('iss del JWT no coincide con el equipo de Access');

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S < now) throw new AccessError('JWT caducado');
  if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_S > now) throw new AccessError('JWT todavía no válido');

  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (!email) throw new AccessError('JWT sin claim email');
  return { email };
}

/* ---------- Punto de entrada ---------- */

/**
 * Identidad de la petición: modo local, o sesión por contraseña (+ Access si está configurado). Lanza HttpError:
 * 500 si faltan ADMIN_KV / SESSION_SECRET, 401 sin sesión válida (o sin JWT válido cuando Access está activo),
 * 403 si el JWT de Access pertenece a otro email que la sesión.
 */
export async function authenticate(request: Request, env: Env, opts: VerifyOptions = {}): Promise<Identity> {
  const local = localIdentity(request, env);
  if (local) return { email: local.toLowerCase(), localMode: true, mustChange: false };

  if (!passwordAuthConfigured(env)) throw configError('faltan ADMIN_KV (binding KV) y/o SESSION_SECRET (ADR-024)');
  const session = await sessionIdentity(env, request, opts.now);
  if (!session) throw unauthorized('Inicia sesión con tu email y contraseña');

  const cfg = accessConfig(env);
  if (cfg) {
    const token = extractToken(request);
    if (!token) throw unauthorized('Falta el JWT de Cloudflare Access');
    try {
      const { email } = await verifyAccessJwt(token, cfg, opts);
      if (email !== session.email) throw forbidden('La sesión de Cloudflare Access pertenece a otro usuario');
    } catch (e) {
      if (e instanceof AccessError) throw unauthorized(`JWT de Access rechazado: ${e.message}`);
      throw e;
    }
  }
  return { email: session.email, localMode: false, mustChange: session.mustChange };
}
