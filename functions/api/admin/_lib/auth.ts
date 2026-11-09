import {
  LOGIN_LOCKOUT_S,
  LOGIN_MAX_ATTEMPTS_PER_ACCOUNT,
  LOGIN_MAX_ATTEMPTS_PER_IP,
  SESSION_TTL_S,
  isEmail,
  normalizeEmail,
  passwordErrors,
  type SessionClaims,
} from '../../../../src/domain/adminAuth';
import type { Env } from './env';
import { HttpError, configError, unauthorized, validation } from './http';

/**
 * Acceso por contraseña al panel (ADR-024). Todo con WebCrypto (Workers y Node ≥ 20):
 *  - Contraseñas: PBKDF2-SHA256 (100 000 iteraciones, el máximo que admite Workers), sal de 16 bytes,
 *    serializadas como `pbkdf2-sha256:<iteraciones>:<sal b64url>:<hash b64url>`.
 *  - Usuarios: KV `ADMIN_KV`, clave `user:<email>` → UserRecord. La primera vez que alguien entra con
 *    su contraseña temporal (`ADMIN_INITIAL_PASSWORDS`, ya en hash) se crea su registro con
 *    `mustChange: true`; el panel le obliga a cambiarla antes de hacer nada más.
 *  - Sesión: cookie HttpOnly con `base64url(claims).base64url(HMAC-SHA256)` firmada con SESSION_SECRET.
 *    `v` (versión de la contraseña) va dentro: cambiarla invalida todas las sesiones anteriores.
 *  - Fuerza bruta: contadores en KV por cuenta y por IP con TTL; al agotarlos, bloqueo temporal (423).
 * Nunca se registran contraseñas, hashes ni cookies.
 */

export const PBKDF2_ITERATIONS = 100_000;
export const HASH_PREFIX = 'pbkdf2-sha256';
export const SESSION_COOKIE = 'raiden_admin';
/** La cookie solo viaja al API: la página /admin es estática y no la necesita. */
export const SESSION_COOKIE_PATH = '/api/admin';
const MIN_SECRET_LENGTH = 32;

/** Subconjunto de KVNamespace que usa el panel (también lo implementa el almacén en memoria de los tests). */
export interface KvLike {
  get(key: string, type: 'text'): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface UserRecord {
  /** `pbkdf2-sha256:<iter>:<sal>:<hash>` */
  hash: string;
  /** Sube en cada cambio de contraseña; la cookie lleva la versión con la que se creó. */
  version: number;
  /** true hasta que el usuario sustituye la contraseña temporal. */
  mustChange: boolean;
  updatedAt: string;
}

/* ---------- Codificación ---------- */

const enc = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('base64url inválido');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Comparación en tiempo constante (misma longitud) para hashes y firmas. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/* ---------- Contraseñas ---------- */

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `${HASH_PREFIX}:${iterations}:${toBase64Url(salt)}:${toBase64Url(hash)}`;
}

export interface ParsedHash {
  iterations: number;
  salt: Uint8Array;
  hash: Uint8Array;
}

export function parseHash(serialized: string): ParsedHash | null {
  const parts = serialized.trim().split(':');
  if (parts.length !== 4 || parts[0] !== HASH_PREFIX) return null;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 1_000_000) return null;
  try {
    const salt = fromBase64Url(parts[2]!);
    const hash = fromBase64Url(parts[3]!);
    if (salt.length < 8 || hash.length !== 32) return null;
    return { iterations, salt, hash };
  } catch {
    return null;
  }
}

export async function verifyPassword(password: string, serialized: string): Promise<boolean> {
  const parsed = parseHash(serialized);
  if (!parsed) return false;
  const candidate = await pbkdf2(password, parsed.salt, parsed.iterations);
  return timingSafeEqual(candidate, parsed.hash);
}

/* ---------- Contraseñas iniciales (variable de entorno) ---------- */

/**
 * `ADMIN_INITIAL_PASSWORDS`: `email:pbkdf2-sha256:<iter>:<sal>:<hash>` separados por coma, punto y coma,
 * salto de línea o espacio. Solo se consultan cuando el email aún no tiene registro en KV.
 * Entradas malformadas se ignoran (y se avisa por consola sin reproducir el valor).
 */
export function parseInitialPasswords(raw: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const item of (raw ?? '').split(/[\s,;]+/)) {
    if (!item) continue;
    const i = item.indexOf(':');
    const email = normalizeEmail(i > 0 ? item.slice(0, i) : '');
    const hash = i > 0 ? item.slice(i + 1) : '';
    if (!isEmail(email) || !parseHash(hash)) {
      console.warn('[admin] entrada de ADMIN_INITIAL_PASSWORDS ignorada (formato email:pbkdf2-sha256:iter:sal:hash)');
      continue;
    }
    out.set(email, hash);
  }
  return out;
}

/* ---------- Sesión (cookie firmada) ---------- */

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(claims: SessionClaims, secret: string): Promise<string> {
  const payload = toBase64Url(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload)));
  return `${payload}.${toBase64Url(sig)}`;
}

/** Devuelve los claims si la firma es válida y la sesión no ha caducado; null en cualquier otro caso. */
export async function verifySession(token: string, secret: string, now = nowSeconds()): Promise<SessionClaims | null> {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const payload = token.slice(0, dot);
  const sigText = token.slice(dot + 1);
  let sig: Uint8Array;
  try {
    sig = fromBase64Url(sigText);
  } catch {
    return null;
  }
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload)));
  if (!timingSafeEqual(sig, expected)) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
  } catch {
    return null;
  }
  if (typeof claims !== 'object' || claims === null) return null;
  const c = claims as Record<string, unknown>;
  if (typeof c.email !== 'string' || typeof c.v !== 'number' || typeof c.iat !== 'number' || typeof c.exp !== 'number') return null;
  if (c.exp <= now || c.iat > now + 60) return null;
  return { email: c.email, v: c.v, iat: c.iat, exp: c.exp };
}

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export function readSessionCookie(request: Request): string | null {
  const cookie = request.headers.get('Cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE && rest.length) return rest.join('=').trim();
  }
  return null;
}

/** Cabecera Set-Cookie de la sesión. `Secure` solo si la petición llegó por https (en localhost va por http). */
export function sessionCookie(token: string, request: Request, maxAgeS = SESSION_TTL_S): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=${SESSION_COOKIE_PATH}; Max-Age=${maxAgeS}; HttpOnly; SameSite=Strict${secure}`;
}

export function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=${SESSION_COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Strict${secure}`;
}

/* ---------- Configuración ---------- */

export function requireKv(env: Env): KvLike {
  if (!env.ADMIN_KV) throw configError('falta el binding KV ADMIN_KV (usuarios y sesiones del panel)');
  return env.ADMIN_KV as unknown as KvLike;
}

export function requireSecret(env: Env): string {
  const s = env.SESSION_SECRET?.trim() ?? '';
  if (s.length < MIN_SECRET_LENGTH) throw configError(`falta SESSION_SECRET (al menos ${MIN_SECRET_LENGTH} caracteres aleatorios)`);
  return s;
}

/** Con `ADMIN_KV` y `SESSION_SECRET` definidos el login por contraseña está activo. */
export const passwordAuthConfigured = (env: Env): boolean => Boolean(env.ADMIN_KV) && (env.SESSION_SECRET?.trim().length ?? 0) >= MIN_SECRET_LENGTH;

/* ---------- Usuarios en KV ---------- */

const userKey = (email: string) => `user:${email}`;

export async function readUser(kv: KvLike, email: string): Promise<UserRecord | null> {
  const raw = await kv.get(userKey(email), 'text');
  if (!raw) return null;
  try {
    const u = JSON.parse(raw) as Partial<UserRecord>;
    if (typeof u.hash !== 'string' || typeof u.version !== 'number') return null;
    return { hash: u.hash, version: u.version, mustChange: Boolean(u.mustChange), updatedAt: typeof u.updatedAt === 'string' ? u.updatedAt : '' };
  } catch {
    return null;
  }
}

export async function writeUser(kv: KvLike, email: string, record: UserRecord): Promise<void> {
  await kv.put(userKey(email), JSON.stringify(record));
}

/* ---------- Fuerza bruta ---------- */

const ipOf = (request: Request): string => request.headers.get('CF-Connecting-IP')?.trim() || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'desconocida';
const failKey = (scope: 'account' | 'ip', id: string) => `login-fail:${scope}:${id}`;

async function readCount(kv: KvLike, key: string): Promise<number> {
  const n = Number((await kv.get(key, 'text')) ?? '0');
  return Number.isFinite(n) ? n : 0;
}

export class LockedError extends HttpError {
  constructor() {
    super('forbidden', `Demasiados intentos fallidos: espera ${Math.round(LOGIN_LOCKOUT_S / 60)} minutos e inténtalo de nuevo`, undefined, 423);
    this.name = 'LockedError';
  }
}

async function assertNotLocked(kv: KvLike, email: string, ip: string): Promise<void> {
  const [byAccount, byIp] = await Promise.all([readCount(kv, failKey('account', email)), readCount(kv, failKey('ip', ip))]);
  if (byAccount >= LOGIN_MAX_ATTEMPTS_PER_ACCOUNT || byIp >= LOGIN_MAX_ATTEMPTS_PER_IP) throw new LockedError();
}

async function recordFailure(kv: KvLike, email: string, ip: string): Promise<void> {
  for (const key of [failKey('account', email), failKey('ip', ip)]) {
    const n = (await readCount(kv, key)) + 1;
    await kv.put(key, String(n), { expirationTtl: LOGIN_LOCKOUT_S });
  }
}

async function clearFailures(kv: KvLike, email: string, ip: string): Promise<void> {
  await Promise.all([kv.delete(failKey('account', email)), kv.delete(failKey('ip', ip))]);
}

/* ---------- Casos de uso ---------- */

export interface PasswordIdentity {
  email: string;
  mustChange: boolean;
  version: number;
}

/**
 * Login: comprueba bloqueo, busca el usuario en KV (o su contraseña temporal en el entorno), verifica la
 * contraseña y devuelve la identidad. Lanza 401 (credenciales), 423 (bloqueo) o 500 (configuración).
 * El mismo mensaje para "email desconocido" y "contraseña incorrecta": no revela qué cuentas existen.
 */
export async function loginWithPassword(env: Env, request: Request, rawEmail: unknown, password: unknown): Promise<PasswordIdentity> {
  const kv = requireKv(env);
  requireSecret(env);
  const email = normalizeEmail(rawEmail);
  if (!isEmail(email) || typeof password !== 'string' || !password) throw unauthorized('Email o contraseña incorrectos');
  const ip = ipOf(request);
  await assertNotLocked(kv, email, ip);

  let user = await readUser(kv, email);
  if (!user) {
    // Primera entrada: contraseña temporal del entorno → se crea el registro con mustChange
    const initial = parseInitialPasswords(env.ADMIN_INITIAL_PASSWORDS).get(email);
    if (initial && (await verifyPassword(password, initial))) {
      user = { hash: initial, version: 1, mustChange: true, updatedAt: new Date().toISOString() };
      await writeUser(kv, email, user);
      await clearFailures(kv, email, ip);
      return { email, mustChange: true, version: user.version };
    }
    // Coste parecido al de una verificación real para no distinguir cuentas por tiempo de respuesta
    await pbkdf2(password, new Uint8Array(16), PBKDF2_ITERATIONS);
    await recordFailure(kv, email, ip);
    throw unauthorized('Email o contraseña incorrectos');
  }

  if (!(await verifyPassword(password, user.hash))) {
    await recordFailure(kv, email, ip);
    throw unauthorized('Email o contraseña incorrectos');
  }
  await clearFailures(kv, email, ip);
  return { email, mustChange: user.mustChange, version: user.version };
}

/** Emite la cookie de sesión para una identidad ya verificada. */
export async function issueSession(env: Env, request: Request, identity: PasswordIdentity, now = nowSeconds()): Promise<string> {
  const token = await signSession({ email: identity.email, v: identity.version, iat: now, exp: now + SESSION_TTL_S }, requireSecret(env));
  return sessionCookie(token, request);
}

/**
 * Identidad a partir de la cookie: firma, caducidad y que la versión coincida con la del usuario en KV
 * (una contraseña cambiada deja fuera a las sesiones antiguas). null si no hay sesión válida.
 */
export async function sessionIdentity(env: Env, request: Request, now = nowSeconds()): Promise<PasswordIdentity | null> {
  const token = readSessionCookie(request);
  if (!token) return null;
  const claims = await verifySession(token, requireSecret(env), now);
  if (!claims) return null;
  const user = await readUser(requireKv(env), claims.email);
  if (!user || user.version !== claims.v) return null;
  return { email: claims.email, mustChange: user.mustChange, version: user.version };
}

/**
 * Cambio de contraseña: exige la actual, aplica la política, sube la versión (invalida las demás
 * sesiones) y devuelve la nueva identidad para reemitir la cookie. 401 si la actual no es correcta, 422 si
 * la nueva no cumple la política.
 */
export async function changePassword(env: Env, email: string, currentPassword: unknown, newPassword: unknown): Promise<PasswordIdentity> {
  const kv = requireKv(env);
  const user = await readUser(kv, email);
  if (!user || typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, user.hash))) {
    throw unauthorized('La contraseña actual no es correcta');
  }
  const errors = passwordErrors(newPassword, { email, current: currentPassword });
  if (errors.length) throw validation('La contraseña nueva no es válida', errors);
  const next: UserRecord = { hash: await hashPassword(newPassword as string), version: user.version + 1, mustChange: false, updatedAt: new Date().toISOString() };
  await writeUser(kv, email, next);
  return { email, mustChange: false, version: next.version };
}

/**
 * Protección CSRF para métodos con efectos: si el navegador envía `Origin`, debe ser el propio origen.
 * (La cookie ya es SameSite=Strict; esto es la segunda barrera.) Sin `Origin` (clientes no navegador) se deja pasar.
 */
export function assertSameOrigin(request: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('Origin');
  if (!origin) return;
  if (origin !== new URL(request.url).origin) throw new HttpError('forbidden', 'Petición rechazada: el origen no coincide con el del panel');
}
