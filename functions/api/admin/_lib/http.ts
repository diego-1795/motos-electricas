import type { AdminError, AdminErrorCode } from '../../../../src/domain/admin';
import { SLUG_RE } from '../../../../src/domain/catalogRules';

/**
 * Utilidades HTTP del panel: respuestas JSON con `Cache-Control: no-store`, errores
 * tipados (AdminError) y parseo seguro de cuerpos. Sin lógica de negocio.
 */

const STATUS: Record<AdminErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation: 422,
  upstream: 502,
  config: 500,
};

/** Error con código del contrato y estado HTTP; las rutas lo convierten en respuesta. */
export class HttpError extends Error {
  readonly code: AdminErrorCode;
  readonly status: number;
  readonly details: string[] | undefined;

  constructor(code: AdminErrorCode, message: string, details?: string[], status: number = STATUS[code]) {
    super(message);
    this.name = 'HttpError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toBody(): AdminError {
    const body: AdminError = { code: this.code, error: this.message };
    if (this.details?.length) body.details = this.details;
    return body;
  }
}

export const badRequest = (message: string, details?: string[]) => new HttpError('bad_request', message, details);
export const unauthorized = (message = 'Identidad no verificada: inicia sesión de nuevo') => new HttpError('unauthorized', message);
export const forbidden = (message = 'Tu rol no permite esta operación') => new HttpError('forbidden', message);
export const notFound = (message: string) => new HttpError('not_found', message);
export const conflict = (message: string, details?: string[]) => new HttpError('conflict', message, details);
export const validation = (message: string, details: string[]) => new HttpError('validation', message, details);
export const upstream = (message: string, details?: string[]) => new HttpError('upstream', message, details);
/** Configuración incompleta del servidor (variables de Pages). 500: no es culpa del cliente ni de GitHub. */
export const configError = (message: string) => new HttpError('config', `Configuración incompleta del panel: ${message}`, undefined, 500);

export const NO_STORE: Record<string, string> = { 'Cache-Control': 'no-store' };

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE, ...headers },
  });
}

export function error(code: AdminErrorCode, message: string, details?: string[]): Response {
  return errorResponse(new HttpError(code, message, details));
}

/** Convierte cualquier excepción en una respuesta AdminError. Nunca filtra tokens ni stacks. */
export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json(e.toBody(), e.status);
  const message = e instanceof Error ? e.message : String(e);
  console.error('[admin] error no controlado:', message);
  return json({ code: 'upstream', error: 'Error interno del panel' } satisfies AdminError, 500);
}

/** Ejecuta un handler y serializa su resultado (o su error) como JSON. */
export async function respond(fn: () => Promise<unknown> | unknown, status = 200): Promise<Response> {
  try {
    return json(await fn(), status);
  } catch (e) {
    return errorResponse(e);
  }
}

/** Tamaño máximo del cuerpo (una ficha completa ronda los 10 KB). Más → 413. */
export const MAX_BODY_BYTES = 256 * 1024;

const payloadTooLarge = () => new HttpError('bad_request', `El cuerpo de la petición supera el máximo de ${MAX_BODY_BYTES / 1024} KB`, undefined, 413);

/** Cuerpo JSON como objeto plano; JSON inválido o no-objeto → 400; demasiado grande → 413. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('Content-Length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw payloadTooLarge();
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw badRequest('No se pudo leer el cuerpo de la petición');
  }
  if (text.length > MAX_BODY_BYTES) throw payloadTooLarge();
  if (!text.trim()) throw badRequest('El cuerpo de la petición está vacío');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw badRequest('El cuerpo de la petición no es JSON válido');
  }
  if (!isPlainObject(parsed)) throw badRequest('El cuerpo de la petición debe ser un objeto JSON');
  return parsed;
}

export const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const MAX_SLUG_LENGTH = 80;

/** `:slug` de la ruta en kebab-case y de longitud acotada; cualquier otra cosa → 400 (evita rutas raras hacia GitHub). */
export function assertSlug(raw: unknown): string {
  const slug = Array.isArray(raw) ? raw.join('/') : String(raw ?? '');
  if (slug.length > MAX_SLUG_LENGTH) throw badRequest(`slug inválido: supera los ${MAX_SLUG_LENGTH} caracteres`);
  if (!SLUG_RE.test(slug)) throw badRequest(`slug "${slug}" inválido: debe ser kebab-case (a-z, 0-9 y guiones)`);
  return slug;
}
