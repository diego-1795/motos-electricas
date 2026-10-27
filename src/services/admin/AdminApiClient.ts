import type { AdminCatalog, AdminError, AdminErrorCode, AdminKind, AdminUser, DeleteBody, DeleteResult, DeployStatus, PartPatch, ProductPatch, PutBody, WriteResult } from '../../domain/admin';
import { LOCAL_USER_HEADER } from '../../domain/admin';
import type { Part, Product } from '../../domain/types';

/**
 * Cliente HTTP del panel de administración (ADR-018): único punto de `fetch` hacia
 * `/api/admin/*` (mismo origen, tras Cloudflare Access). Sin lógica de negocio:
 * serializa, deserializa y convierte los errores JSON del servidor en AdminApiError.
 */

export class AdminApiError extends Error {
  readonly status: number;
  readonly code: AdminErrorCode;
  readonly details: string[];

  constructor(status: number, code: AdminErrorCode, message: string, details: string[] = []) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Fetcher = typeof fetch;

/** Tipo de dato de cada colección del panel */
export type KindData<K extends AdminKind> = K extends 'products' ? Product : Part;
export type KindPatch<K extends AdminKind> = K extends 'products' ? ProductPatch : PartPatch;

const CODE_BY_STATUS: Record<number, AdminErrorCode> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'validation',
  500: 'config',
  502: 'upstream',
};

/** Solo se acepta un `code` del contrato; cualquier otro valor del cuerpo se ignora y se deduce del estado HTTP */
const KNOWN_CODES: ReadonlySet<string> = new Set<AdminErrorCode>(['unauthorized', 'forbidden', 'not_found', 'conflict', 'validation', 'bad_request', 'upstream', 'config']);

export const SESSION_EXPIRED_MESSAGE = 'La sesión de Cloudflare Access ha caducado: recarga la página para volver a identificarte';

export class AdminApiClient {
  private localUser: string | null = null;

  constructor(
    private readonly base = '/api/admin',
    private readonly fetcher: Fetcher = (...args) => fetch(...args),
  ) {}

  /** Modo local (wrangler pages dev): simula otro email con la cabecera x-admin-local-user. null = sin simulación. */
  setLocalUser(email: string | null): void {
    this.localUser = email;
  }

  getLocalUser(): string | null {
    return this.localUser;
  }

  me(): Promise<AdminUser> {
    return this.request<AdminUser>('GET', '/me');
  }

  catalog(): Promise<AdminCatalog> {
    return this.request<AdminCatalog>('GET', '/catalog');
  }

  deploy(): Promise<DeployStatus> {
    return this.request<DeployStatus>('GET', '/deploy');
  }

  patch<K extends AdminKind>(kind: K, slug: string, body: KindPatch<K>): Promise<WriteResult<KindData<K>>> {
    return this.request<WriteResult<KindData<K>>>('PATCH', `/${kind}/${encodeURIComponent(slug)}`, body);
  }

  put<K extends AdminKind>(kind: K, slug: string, body: PutBody<KindData<K>>): Promise<WriteResult<KindData<K>>> {
    return this.request<WriteResult<KindData<K>>>('PUT', `/${kind}/${encodeURIComponent(slug)}`, body);
  }

  remove(kind: AdminKind, slug: string, body: DeleteBody): Promise<DeleteResult> {
    return this.request<DeleteResult>('DELETE', `/${kind}/${encodeURIComponent(slug)}`, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.localUser) headers[LOCAL_USER_HEADER] = this.localUser;

    let res: Response;
    try {
      res = await this.fetcher(`${this.base}${path}`, {
        method,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        // El API nunca redirige: una redirección es Cloudflare Access mandando al login (sesión caducada).
        // Con 'follow' acabaría en un error CORS indistinguible de una caída del servidor.
        redirect: 'manual',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new AdminApiError(0, 'upstream', `No se pudo conectar con el servidor (${(e as Error).message})`);
    }

    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
      throw new AdminApiError(401, 'unauthorized', SESSION_EXPIRED_MESSAGE);
    }

    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    if (!res.ok) {
      const err = (json && typeof json === 'object' && !Array.isArray(json) ? json : {}) as Partial<AdminError>;
      const code: AdminErrorCode = typeof err.code === 'string' && KNOWN_CODES.has(err.code) ? err.code : (CODE_BY_STATUS[res.status] ?? 'upstream');
      const message = typeof err.error === 'string' && err.error ? err.error : res.status === 401 ? 'Sin sesión de acceso' : `Error ${res.status} del servidor`;
      const details = Array.isArray(err.details) ? err.details.filter((d): d is string => typeof d === 'string') : [];
      throw new AdminApiError(res.status, code, message, details);
    }
    // Un 200 que no es JSON (p. ej. una página HTML interpuesta) no es una respuesta del API
    if (json === null || typeof json !== 'object') {
      throw new AdminApiError(res.status, 'upstream', 'Respuesta no válida del servidor (no es JSON)');
    }
    return json as T;
  }
}

/** Instancia compartida por las islas del panel */
export const adminApi = new AdminApiClient();
