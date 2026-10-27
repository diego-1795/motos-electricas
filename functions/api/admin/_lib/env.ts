import type { AdminUser } from '../../../../src/domain/admin';

/**
 * Variables de entorno de las Pages Functions del panel (ADR-018).
 * Se definen en Cloudflare Pages → Settings → Environment variables; en local, en `.dev.vars`
 * (ver `.dev.vars.example`). Ninguna es `PUBLIC_*`: nunca llegan al navegador.
 */
export interface Env {
  /** Emails con rol admin (coma, punto y coma o espacio como separador) */
  ADMIN_EMAILS?: string;
  /** Emails con rol editor */
  EDITOR_EMAILS?: string;
  /** Equipo de Cloudflare Access: `raiden` o `raiden.cloudflareaccess.com` */
  CF_ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag de la aplicación de Access */
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
