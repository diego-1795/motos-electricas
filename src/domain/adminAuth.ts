/**
 * Reglas puras del acceso por contraseña al panel (ADR-024). Sin crypto ni I/O: la parte
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
  email: string;
  password: string;
}

/** Cuerpo de POST /api/admin/auth/password */
export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

/** Claims de la cookie de sesión. `v` = versión de la contraseña: cambiarla invalida las sesiones anteriores. */
export interface SessionClaims {
  email: string;
  v: number;
  /** Segundos Unix */
  iat: number;
  exp: number;
}

export const normalizeEmail = (raw: unknown): string => (typeof raw === 'string' ? raw.trim().toLowerCase() : '');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (s: string): boolean => s.length <= 254 && EMAIL_RE.test(s);

/**
 * Política de contraseñas: longitud mínima, sin espacios en los extremos, distinta del email y de la
 * contraseña actual, y no trivial (todo el mismo carácter o secuencias tipo "1234567890").
 * Devuelve la lista de errores (vacía = válida).
 */
export function passwordErrors(password: unknown, ctx: { email?: string; current?: string } = {}): string[] {
  if (typeof password !== 'string') return ['La contraseña debe ser texto'];
  const errors: string[] = [];
  if (password !== password.trim()) errors.push('La contraseña no puede empezar ni terminar con espacios');
  if (password.length < MIN_PASSWORD_LENGTH) errors.push(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
  if (password.length > MAX_PASSWORD_LENGTH) errors.push(`La contraseña no puede superar los ${MAX_PASSWORD_LENGTH} caracteres`);
  if (/[\u0000-\u001f\u007f]/.test(password)) errors.push('La contraseña no puede contener caracteres de control');
  const lower = password.toLowerCase();
  const email = normalizeEmail(ctx.email);
  if (email && (lower === email || lower === email.split('@')[0])) errors.push('La contraseña no puede ser tu email');
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

/** Resultado de un intento de login tal como lo interpreta el panel. */
export type LoginFailure = 'invalid_credentials' | 'locked' | 'no_role';
