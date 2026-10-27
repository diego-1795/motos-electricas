import type { Part, Product } from './types';

/**
 * Contrato del panel de administración (ADR-018) entre las Pages Functions
 * (functions/api/admin/*) y las islas Preact (src/islands/admin/*).
 * Solo tipos: sin lógica ni dependencias. La política de roles está en adminPolicy.ts.
 *
 * Rutas (mismo origen, tras Cloudflare Access):
 *   GET    /api/admin/me                     → AdminUser
 *   GET    /api/admin/catalog                → AdminCatalog
 *   PATCH  /api/admin/products/:slug         ProductPatch  → WriteResult<Product>   (admin y editor)
 *   PATCH  /api/admin/repuestos/:slug        PartPatch     → WriteResult<Part>      (admin y editor)
 *   PUT    /api/admin/products/:slug         PutBody<Product> → WriteResult<Product> (solo admin; crea si no hay sha)
 *   PUT    /api/admin/repuestos/:slug        PutBody<Part>    → WriteResult<Part>    (solo admin)
 *   DELETE /api/admin/products/:slug         DeleteBody    → DeleteResult           (solo admin)
 *   DELETE /api/admin/repuestos/:slug        DeleteBody    → DeleteResult           (solo admin)
 *   GET    /api/admin/deploy                 → DeployStatus
 * Errores: AdminError con el código HTTP correspondiente (401, 403, 404, 409, 422, 502).
 */

export type AdminRole = 'admin' | 'editor';

/** Colecciones gestionables desde el panel (carpetas de src/content) */
export type AdminKind = 'products' | 'repuestos';

export interface AdminUser {
  email: string;
  role: AdminRole;
  /** Listas de ADMIN_EMAILS / EDITOR_EMAILS (solo lectura: se cambian en Cloudflare) */
  admins: string[];
  editors: string[];
  /** true cuando la identidad viene de ADMIN_LOCAL_USER (wrangler pages dev), nunca en producción */
  localMode: boolean;
  /** Rama de GitHub sobre la que se escribe (GITHUB_BRANCH, por defecto main) */
  branch: string;
}

/** Fichero del repositorio: datos + sha del blob (control de concurrencia) */
export interface CatalogEntry<T> {
  data: T;
  sha: string;
  /** Ruta en el repo, p. ej. src/content/products/golden-eagle.json */
  path: string;
}

export interface AdminCatalog {
  products: CatalogEntry<Product>[];
  repuestos: CatalogEntry<Part>[];
  branch: string;
}

/** Lo ÚNICO que puede cambiar un editor: precios por variante (céntimos) y visibilidad. */
export interface ProductPatch {
  /** sha actual del fichero; 409 si ya no coincide */
  sha: string;
  /** Motivo opcional, va al cuerpo del commit */
  reason?: string;
  hidden?: boolean;
  /** variantId → importe en céntimos de sol */
  prices?: Record<string, number>;
}

export interface PartPatch {
  sha: string;
  reason?: string;
  hidden?: boolean;
  /** Importe en céntimos de sol */
  price?: number;
}

/** Ficha completa (solo admin). Sin sha = crear; con sha = sustituir. */
export interface PutBody<T> {
  sha?: string;
  reason?: string;
  data: T;
}

export interface DeleteBody {
  sha: string;
  reason?: string;
}

export interface CommitInfo {
  sha: string;
  url: string;
  message: string;
}

export interface WriteResult<T> {
  /** Nuevo sha del blob tras escribir */
  sha: string;
  path: string;
  data: T;
  /** null cuando un PATCH no cambia nada: no se crea commit ni se dispara build */
  commit: CommitInfo | null;
}

export interface DeleteResult {
  path: string;
  commit: CommitInfo;
}

/** 'config' = variables de entorno del panel incompletas (HTTP 500); 'upstream' = fallo de GitHub o de la API de Pages (502) */
export type AdminErrorCode = 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'validation' | 'bad_request' | 'upstream' | 'config';

export interface AdminError {
  code: AdminErrorCode;
  error: string;
  /** Lista de errores de validación (esquema + reglas), si aplica */
  details?: string[];
}

export type DeployState = 'queued' | 'building' | 'success' | 'failure' | 'unknown';

export interface DeployStatus {
  /** false si no hay credenciales de la API de Pages: el panel muestra "publicando… ~3 min" */
  available: boolean;
  state?: DeployState;
  createdAt?: string;
  url?: string;
  commitSha?: string;
  commitMessage?: string;
}

/** Cabecera del modo local (solo wrangler pages dev; ver docs/19-deployment.md) */
export const LOCAL_USER_HEADER = 'x-admin-local-user';
