import type { CommitInfo } from '../../../../src/domain/admin';
import { branchOf, repoOf, type Env } from './env';
import { HttpError, configError } from './http';

/**
 * Almacén de contenido sobre la Contents API de GitHub (ADR-018). La interfaz `ContentStore`
 * es inyectable para testear los handlers con un almacén en memoria.
 * El token solo viaja en la cabecera Authorization: nunca se registra ni se devuelve.
 */

export interface StoredFile {
  path: string;
  sha: string;
  content: string;
}

export interface ListedFile {
  path: string;
  sha: string;
  name: string;
}

export interface ContentStore {
  list(dir: string): Promise<ListedFile[]>;
  read(path: string): Promise<StoredFile | null>;
  /** Sin sha = crear; con sha = actualizar. sha desfasado (o fichero ya existente al crear) → ConflictError. */
  write(path: string, content: string, message: string, sha?: string): Promise<{ sha: string; commit: CommitInfo }>;
  remove(path: string, message: string, sha: string): Promise<{ commit: CommitInfo }>;
}

export class ConflictError extends HttpError {
  constructor(message: string, details?: string[]) {
    super('conflict', message, details);
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super('not_found', message);
    this.name = 'NotFoundError';
  }
}

export class UpstreamError extends HttpError {
  constructor(message: string, details?: string[]) {
    super('upstream', message, details);
    this.name = 'UpstreamError';
  }
}

/* ---------- Codificación ---------- */

export function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/** Mismo formato que los JSON del repositorio (2 espacios + salto final). */
export const serializeJson = (data: unknown): string => JSON.stringify(data, null, 2) + '\n';

/* ---------- Implementación GitHub ---------- */

interface GitHubCommit {
  sha: string;
  html_url?: string;
  message?: string;
}

interface GitHubContent {
  name: string;
  path: string;
  sha: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  content?: string;
  encoding?: string;
}

interface GitHubWriteResponse {
  content: { sha: string; path: string } | null;
  commit: GitHubCommit;
}

const toCommitInfo = (c: GitHubCommit, fallbackMessage: string): CommitInfo => ({
  sha: c.sha,
  url: c.html_url ?? '',
  message: c.message ?? fallbackMessage,
});

async function githubMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export function githubStore(env: Env, fetchImpl: typeof fetch = fetch): ContentStore {
  const token = env.GITHUB_TOKEN?.trim();
  if (!token) throw configError('falta GITHUB_TOKEN (token fine-grained con permiso Contents sobre el repositorio)');
  const repo = repoOf(env);
  const branch = branchOf(env);
  const base = `https://api.github.com/repos/${repo}/contents/`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'raiden-admin',
    'Content-Type': 'application/json',
  };

  const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

  async function call(method: 'GET' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<Response> {
    const url = `${base}${encodePath(path)}${method === 'GET' ? `?ref=${encodeURIComponent(branch)}` : ''}`;
    try {
      return await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      throw new UpstreamError(`No se pudo contactar con GitHub (${e instanceof Error ? e.message : 'fetch'})`);
    }
  }

  async function fail(res: Response, path: string): Promise<never> {
    const message = await githubMessage(res);
    if (res.status === 409) throw new ConflictError(`Conflicto en GitHub para ${path}: ${message}`);
    if (res.status === 422 && /does not match|sha/i.test(message)) throw new ConflictError(`El fichero ${path} cambió en el repositorio: recarga e inténtalo de nuevo (${message})`);
    if (res.status === 404) throw new NotFoundError(`No existe ${path} en la rama ${branch}`);
    if (res.status === 401 || res.status === 403) throw new UpstreamError(`GitHub rechazó el token (${res.status}): revisa GITHUB_TOKEN y su permiso Contents sobre ${repo}`);
    throw new UpstreamError(`GitHub respondió ${res.status} para ${path}: ${message}`);
  }

  return {
    async list(dir) {
      const res = await call('GET', dir);
      if (!res.ok) return fail(res, dir);
      const body = (await res.json()) as GitHubContent[] | GitHubContent;
      if (!Array.isArray(body)) throw new UpstreamError(`${dir} no es un directorio en la rama ${branch}`);
      return body.filter((f) => f.type === 'file').map((f) => ({ path: f.path, sha: f.sha, name: f.name }));
    },

    async read(path) {
      const res = await call('GET', path);
      if (res.status === 404) return null;
      if (!res.ok) return fail(res, path);
      const body = (await res.json()) as GitHubContent;
      if (body.type !== 'file' || typeof body.content !== 'string') throw new UpstreamError(`${path} no es un fichero legible`);
      if (body.encoding && body.encoding !== 'base64') throw new UpstreamError(`${path}: codificación ${body.encoding} no admitida`);
      return { path: body.path, sha: body.sha, content: decodeBase64Utf8(body.content) };
    },

    async write(path, content, message, sha) {
      const payload: Record<string, string> = { message, content: encodeUtf8Base64(content), branch };
      if (sha) payload.sha = sha;
      const res = await call('PUT', path, payload);
      if (!res.ok) return fail(res, path);
      const body = (await res.json()) as GitHubWriteResponse;
      if (!body.content?.sha) throw new UpstreamError(`GitHub no devolvió el sha del fichero ${path}`);
      return { sha: body.content.sha, commit: toCommitInfo(body.commit, message) };
    },

    async remove(path, message, sha) {
      const res = await call('DELETE', path, { message, sha, branch });
      if (!res.ok) return fail(res, path);
      const body = (await res.json()) as GitHubWriteResponse;
      return { commit: toCommitInfo(body.commit, message) };
    },
  };
}
