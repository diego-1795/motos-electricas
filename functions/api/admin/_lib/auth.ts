import {
  LOGIN_LOCKOUT_S,
  LOGIN_MAX_ATTEMPTS_PER_ACCOUNT,
  LOGIN_MAX_ATTEMPTS_PER_IP,
  SESSION_TTL_S,
  isUsername,
  normalizeUsername,
  passwordErrors,
  type SessionClaims,
} from '../../../../src/domain/adminAuth';
import type { Env } from './env';
import { HttpError, configError, unauthorized, validation } from './http';

/**
 * Acceso por usuario y contraseña al panel (ADR-024, ADR-025). Todo con WebCrypto (Workers y Node ≥ 20):
 *  - Contraseñas: PBKDF2-SHA256 (100 000 iteraciones, el máximo que admite Workers), sal de 16 bytes,
 *    serializadas como `pbkdf2-sha256:<iteraciones>:<sal b64url>:<hash b64url>`.
 *  - Usuarios: KV `ADMIN_KV`, clave `user:<usuario>` → UserRecord. La primera vez que alguien entra con
 *    su contraseña temporal (`ADMIN_INITIAL_PASSWORDS`, ya en hash) se crea su registro con
 *    `mustChange: true`; el panel le obliga a cambiarla antes de hacer nada más.
 *  - Restablecer (ADR-025), sin email: el admin genera desde el panel una temporal para otro usuario
 *    (`resetPassword`), o se pone una entrada NUEVA en `ADMIN_INITIAL_PASSWORDS` (el registro recuerda en
 *    `seed` la entrada con la que se creó; si la del entorno cambia, solo vale la nueva temporal).
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
  /** Entrada de ADMIN_INITIAL_PASSWORDS ya aplicada (ADR-025): otra distinta en el entorno restablece la contraseña. */
  seed?: string;
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
 * `ADMIN_INITIAL_PASSWORDS`: `usuario:pbkdf2-sha256:<iter>:<sal>:<hash>` separados por coma, punto y coma,
 * salto de línea o espacio. Valen cuando el usuario aún no tiene registro en KV o cuando la entrada es
 * distinta de la que creó su registro (restablecimiento por entorno, ADR-025).
 * Entradas malformadas se ignoran (y se avisa por consola sin reproducir el valor).
 */
export function parseInitialPasswords(raw: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const item of (raw ?? '').split(/[\s,;]+/)) {
    if (!item) continue;
    const i = item.indexOf(':');
    const username = normalizeUsername(i > 0 ? item.slice(0, i) : '');
    const hash = i > 0 ? item.slice(i + 1) : '';
    if (!isUsername(username) || !parseHash(hash)) {
      console.warn('[admin] entrada de ADMIN_INITIAL_PASSWORDS ignorada (formato usuario:pbkdf2-sha256:iter:sal:hash)');
      continue;
    }
    out.set(username, hash);
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
  if (typeof c.sub !== 'string' || typeof c.v !== 'number' || typeof c.iat !== 'number' || typeof c.exp !== 'number') return null;
  if (c.exp <= now || c.iat > now + 60) return null;
  return { sub: c.sub, v: c.v, iat: c.iat, exp: c.exp };
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

const userKey = (username: string) => `user:${username}`;

export async function readUser(kv: KvLike, username: string): Promise<UserRecord | null> {
  const raw = await kv.get(userKey(username), 'text');
  if (!raw) return null;
  try {
    const u = JSON.parse(raw) as Partial<UserRecord>;
    if (typeof u.hash !== 'string' || typeof u.version !== 'number') return null;
    const record: UserRecord = { hash: u.hash, version: u.version, mustChange: Boolean(u.mustChange), updatedAt: typeof u.updatedAt === 'string' ? u.updatedAt : '' };
    if (typeof u.seed === 'string') record.seed = u.seed;
    return record;
  } catch {
    return null;
  }
}

export async function writeUser(kv: KvLike, username: string, record: UserRecord): Promise<void> {
  await kv.put(userKey(username), JSON.stringify(record));
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

async function assertNotLocked(kv: KvLike, username: string, ip: string): Promise<void> {
  const [byAccount, byIp] = await Promise.all([readCount(kv, failKey('account', username)), readCount(kv, failKey('ip', ip))]);
  if (byAccount >= LOGIN_MAX_ATTEMPTS_PER_ACCOUNT || byIp >= LOGIN_MAX_ATTEMPTS_PER_IP) throw new LockedError();
}

async function recordFailure(kv: KvLike, username: string, ip: string): Promise<void> {
  for (const key of [failKey('account', username), failKey('ip', ip)]) {
    const n = (await readCount(kv, key)) + 1;
    await kv.put(key, String(n), { expirationTtl: LOGIN_LOCKOUT_S });
  }
}

async function clearFailures(kv: KvLike, username: string, ip: string): Promise<void> {
  await Promise.all([kv.delete(failKey('account', username)), kv.delete(failKey('ip', ip))]);
}

/* ---------- Casos de uso ---------- */

export interface PasswordIdentity {
  username: string;
  mustChange: boolean;
  version: number;
}

const INVALID_CREDENTIALS = 'Usuario o contraseña incorrectos';

/**
 * Login: comprueba bloqueo, busca el usuario en KV y su entrada en el entorno, verifica la contraseña y
 * devuelve la identidad. Lanza 401 (credenciales), 423 (bloqueo) o 500 (configuración).
 * El mismo mensaje para "usuario desconocido" y "contraseña incorrecta": no revela qué cuentas existen.
 *
 * Si `ADMIN_INITIAL_PASSWORDS` trae para el usuario una entrada que su registro aún no ha aplicado (primera
 * entrada o restablecimiento por entorno), SOLO vale esa contraseña temporal: la anterior queda anulada.
 */
export async function loginWithPassword(env: Env, request: Request, rawUsername: unknown, password: unknown): Promise<PasswordIdentity> {
  const kv = requireKv(env);
  requireSecret(env);
  const username = normalizeUsername(rawUsername);
  if (!isUsername(username) || typeof password !== 'string' || !password) throw unauthorized(INVALID_CREDENTIALS);
  const ip = ipOf(request);
  await assertNotLocked(kv, username, ip);

  const user = await readUser(kv, username);
  const initial = parseInitialPasswords(env.ADMIN_INITIAL_PASSWORDS).get(username);
  const pendingSeed = initial !== undefined && (!user || user.seed !== initial) ? initial : undefined;

  let ok: boolean;
  if (pendingSeed) {
    ok = await verifyPassword(password, pendingSeed);
    if (ok) {
      const next: UserRecord = { hash: pendingSeed, version: (user?.version ?? 0) + 1, mustChange: true, updatedAt: new Date().toISOString(), seed: pendingSeed };
      await writeUser(kv, username, next);
      await clearFailures(kv, username, ip);
      return { username, mustChange: true, version: next.version };
    }
  } else if (user) {
    ok = await verifyPassword(password, user.hash);
  } else {
    // Coste parecido al de una verificación real para no distinguir cuentas por tiempo de respuesta
    await pbkdf2(password, new Uint8Array(16), PBKDF2_ITERATIONS);
    ok = false;
  }
  if (!ok || !user) {
    await recordFailure(kv, username, ip);
    throw unauthorized(INVALID_CREDENTIALS);
  }
  await clearFailures(kv, username, ip);
  return { username, mustChange: user.mustChange, version: user.version };
}

/** Emite la cookie de sesión para una identidad ya verificada. */
export async function issueSession(env: Env, request: Request, identity: PasswordIdentity, now = nowSeconds()): Promise<string> {
  const token = await signSession({ sub: identity.username, v: identity.version, iat: now, exp: now + SESSION_TTL_S }, requireSecret(env));
  return sessionCookie(token, request);
}

/**
 * Identidad a partir de la cookie: firma, caducidad y que la versión coincida con la del usuario en KV
 * (una contraseña cambiada o restablecida deja fuera a las sesiones antiguas). null si no hay sesión válida.
 */
export async function sessionIdentity(env: Env, request: Request, now = nowSeconds()): Promise<PasswordIdentity | null> {
  const token = readSessionCookie(request);
  if (!token) return null;
  const claims = await verifySession(token, requireSecret(env), now);
  if (!claims) return null;
  const user = await readUser(requireKv(env), claims.sub);
  if (!user || user.version !== claims.v) return null;
  return { username: claims.sub, mustChange: user.mustChange, version: user.version };
}

/**
 * Cambio de contraseña: exige la actual, aplica la política, sube la versión (invalida las demás
 * sesiones) y devuelve la nueva identidad para reemitir la cookie. 401 si la actual no es correcta, 422 si
 * la nueva no cumple la política.
 */
export async function changePassword(env: Env, username: string, currentPassword: unknown, newPassword: unknown): Promise<PasswordIdentity> {
  const kv = requireKv(env);
  const user = await readUser(kv, username);
  if (!user || typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, user.hash))) {
    throw unauthorized('La contraseña actual no es correcta');
  }
  const errors = passwordErrors(newPassword, { username, current: currentPassword });
  if (errors.length) throw validation('La contraseña nueva no es válida', errors);
  const next: UserRecord = { hash: await hashPassword(newPassword as string), version: user.version + 1, mustChange: false, updatedAt: new Date().toISOString() };
  if (user.seed !== undefined) next.seed = user.seed;
  await writeUser(kv, username, next);
  return { username, mustChange: false, version: next.version };
}

/* ---------- Restablecer (ADR-025) ---------- */

const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** Contraseña temporal aleatoria: 16 caracteres sin ambiguos (0/O, 1/l/I) en grupos de 4 (~93 bits). */
export function generateTempPassword(): string {
  const chars: string[] = [];
  while (chars.length < 16) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      // Rechazo de módulo para no sesgar la distribución
      if (chars.length < 16 && b < 256 - (256 % TEMP_ALPHABET.length)) chars.push(TEMP_ALPHABET[b % TEMP_ALPHABET.length]!);
    }
  }
  return chars.join('').replace(/(.{4})(?=.)/g, '$1-');
}

/**
 * El admin restablece la contraseña de OTRO usuario: genera una temporal, la guarda en hash con
 * `mustChange: true` y sube la versión (cierra sus sesiones). Devuelve la temporal en claro, que se muestra
 * una sola vez al admin. Conserva `seed` (o adopta la entrada actual del entorno) para que una entrada ya
 * aplicada de ADMIN_INITIAL_PASSWORDS no vuelva a valer.
 */
export async function resetPassword(env: Env, username: string): Promise<{ username: string; temporaryPassword: string }> {
  const kv = requireKv(env);
  const user = await readUser(kv, username);
  const temporaryPassword = generateTempPassword();
  const next: UserRecord = { hash: await hashPassword(temporaryPassword), version: (user?.version ?? 0) + 1, mustChange: true, updatedAt: new Date().toISOString() };
  const seed = user ? user.seed : parseInitialPasswords(env.ADMIN_INITIAL_PASSWORDS).get(username);
  if (seed !== undefined) next.seed = seed;
  await writeUser(kv, username, next);
  await kv.delete(failKey('account', username));
  return { username, temporaryPassword };
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
