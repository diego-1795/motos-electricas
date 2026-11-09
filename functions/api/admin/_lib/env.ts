import type { AdminUser } from '../../../../src/domain/admin';

/**
 * Variables de entorno de las Pages Functions del panel (ADR-018, ADR-024).
 * Se definen en Cloudflare Pages → Settings → Environment variables (y el binding KV en Settings →
 * Functions → KV namespace bindings); en local, en `.dev.vars` y `--kv ADMIN_KV` (ver `.dev.vars.example`).
 * Ninguna es `PUBLIC_*`: nunca llegan al navegador.
 */
export interface Env {
  /** Emails con rol admin (coma, punto y coma o espacio como separador) */
  ADMIN_EMAILS?: string;
  /** Emails con rol editor */
  EDITOR_EMAILS?: string;
  /** KV con usuarios (`user:<email>`) y contadores de intentos fallidos (ADR-024) */
  ADMIN_KV?: KVNamespace;
  /** Secreto (≥ 32 caracteres aleatorios) con el que se firma la cookie de sesión (ADR-024) */
  SESSION_SECRET?: string;
  /** Contraseñas temporales ya en hash: `email:pbkdf2-sha256:<iter>:<sal>:<hash>` separadas por coma (ADR-024) */
  ADMIN_INITIAL_PASSWORDS?: string;
  /** Opcional: equipo de Cloudflare Access (`raiden` o `raiden.cloudflareaccess.com`) como segunda barrera */
  CF_ACCESS_TEAM_DOMAIN?: string;
  /** Opcional: Application Audience (AUD) tag de la aplicación de Access */
  CF_ACCESS_AUD?: string;
  /** Token fine-grained con permiso Contents (read/write) solo sobre el repo (secreto) */
  GITHUB_TOKEN?: string;
  /** owner/repo; por defecto diego-1795/motos-electricas */
  GITHUB_REPO?: string;
  /** Rama sobre la que se escribe; por defecto main */
  GITHUB_BRANCH?: string;
  /** Identidad simulada SOLO con `wrangler pages dev` en localhost. Nunca en Pages. */
  ADMIN_LOCAL_USER?: string;
  NODE_ENV?: string;
  /** Opcionales: estado del último despliegue vía API de Pages */
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_PAGES_PROJECT?: string;
}

/** `context.data` que el middleware deja a las rutas (tipo alias: PagesFunction exige Record<string, unknown>) */
export type Data = { user: AdminUser };

export const DEFAULT_REPO = 'diego-1795/motos-electricas';
export const DEFAULT_BRANCH = 'main';

export const repoOf = (env: Env): string => env.GITHUB_REPO?.trim() || DEFAULT_REPO;
export const branchOf = (env: Env): string => env.GITHUB_BRANCH?.trim() || DEFAULT_BRANCH;
