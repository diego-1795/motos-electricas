/**
 * Reglas puras del acceso por usuario y contraseña al panel (ADR-024, ADR-025). Sin crypto ni I/O: la parte
 * criptográfica (PBKDF2, HMAC de la cookie, KV) vive en functions/api/admin/_lib/auth.ts.
 * Las islas usan estas mismas funciones para validar antes de enviar.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/** Duración de la sesión (cookie firmada): 12 horas desde el login. */
export const SESSION_TTL_S = 12 * 60 * 60;

/** Intentos fallidos permitidos antes de bloquear temporalmente (por cuenta y por IP). */
export const LOGIN_MAX_ATTEMPTS_PER_ACCOUNT = 5;
export const LOGIN_MAX_ATTEMPTS_PER_IP = 20;
/** Ventana del bloqueo temporal tras agotar los intentos. */
export const LOGIN_LOCKOUT_S = 15 * 60;

/** Cuerpo de POST /api/admin/auth/login */
export interface LoginBody {
  username: string;
  password: string;
}

/** Cuerpo de POST /api/admin/auth/password */
export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

/** Claims de la cookie de sesión. `v` = versión de la contraseña: cambiarla invalida las sesiones anteriores. */
export interface SessionClaims {
  /** Nombre de usuario (ADR-025) */
  sub: string;
  v: number;
  /** Segundos Unix */
  iat: number;
  exp: number;
}

/** Usuario del panel (ADR-025): sin distinguir mayúsculas y sin espacios en los extremos. */
export const normalizeUsername = (raw: unknown): string => (typeof raw === 'string' ? raw.trim().toLowerCase() : '');

/** 2–32 caracteres: a-z, 0-9, punto, guion y guion bajo; empieza por letra o número. */
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;

export const isUsername = (s: string): boolean => USERNAME_RE.test(s);

/**
 * Política de contraseñas: longitud mínima, sin espacios en los extremos, distinta del usuario y de la
 * contraseña actual, y no trivial (todo el mismo carácter o secuencias tipo "1234567890").
 * Devuelve la lista de errores (vacía = válida).
 */
export function passwordErrors(password: unknown, ctx: { username?: string; current?: string } = {}): string[] {
  if (typeof password !== 'string') return ['La contraseña debe ser texto'];
  const errors: string[] = [];
  if (password !== password.trim()) errors.push('La contraseña no puede empezar ni terminar con espacios');
  if (password.length < MIN_PASSWORD_LENGTH) errors.push(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
  if (password.length > MAX_PASSWORD_LENGTH) errors.push(`La contraseña no puede superar los ${MAX_PASSWORD_LENGTH} caracteres`);
  if (/[\u0000-\u001f\u007f]/.test(password)) errors.push('La contraseña no puede contener caracteres de control');
  const lower = password.toLowerCase();
  const username = normalizeUsername(ctx.username);
  if (username && lower === username) errors.push('La contraseña no puede ser tu usuario');
  if (ctx.current !== undefined && password === ctx.current) errors.push('La contraseña nueva debe ser distinta de la actual');
  if (password.length >= MIN_PASSWORD_LENGTH && isTrivial(lower)) errors.push('La contraseña es demasiado predecible (repeticiones o secuencias)');
  return errors;
}

const SEQUENCES = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

function isTrivial(lower: string): boolean {
  if (new Set(lower).size <= 2) return true;
  for (const seq of SEQUENCES) {
    // Secuencias cíclicas en ambos sentidos ("1234567890", "0987654321", "cdefghijklmn")
    const rev = [...seq].reverse().join('');
    if (lower.length <= seq.length && ((seq + seq).includes(lower) || (rev + rev).includes(lower))) return true;
  }
  return /^(.+?)\1+$/.test(lower);
}
