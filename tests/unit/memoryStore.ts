import type { CommitInfo } from '../../src/domain/admin';
import { ConflictError, serializeJson, type ContentEncoding, type ContentStore, type StoredFile } from '../../functions/api/admin/_lib/github';
import { NotFoundError } from '../../functions/api/admin/_lib/github';

/**
 * Almacén en memoria con el contrato de ContentStore (github.ts) para probar los handlers del panel
 * sin GitHub: shas que avanzan con cada escritura, conflictos por sha y directorios inexistentes → 404
 * (como la Contents API). Los valores de `seed` que no son texto se serializan como JSON.
 */

export interface MemoryWrite {
  path: string;
  content: string;
  message: string;
  sha?: string;
  encoding: ContentEncoding;
}

export interface MemoryStore extends ContentStore {
  files: Map<string, StoredFile>;
  writes: MemoryWrite[];
  removals: { path: string; message: string; sha: string }[];
  /** Directorios que existen aunque estén vacíos */
  dirs: Set<string>;
}

export function memoryStore(seed: Record<string, unknown>, dirs: string[] = []): MemoryStore {
  let counter = 0;
  const nextSha = () => `sha-${++counter}`;
  const files = new Map<string, StoredFile>();
  for (const [path, data] of Object.entries(seed)) files.set(path, { path, sha: nextSha(), content: typeof data === 'string' ? data : serializeJson(data) });
  const commit = (message: string): CommitInfo => ({ sha: `commit-${++counter}`, url: `https://github.com/x/y/commit/${counter}`, message });
  const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/'));
  const store: MemoryStore = {
    files,
    writes: [],
    removals: [],
    dirs: new Set(dirs),
    async list(dir) {
      const inDir = [...files.values()].filter((f) => dirOf(f.path) === dir);
      if (!inDir.length && !store.dirs.has(dir) && ![...files.keys()].some((p) => p.startsWith(dir + '/'))) throw new NotFoundError(`No existe ${dir}`);
      return inDir.map((f) => ({ path: f.path, sha: f.sha, name: f.path.slice(dir.length + 1) }));
    },
    async read(path) {
      return files.get(path) ?? null;
    },
    async write(path, content, message, sha, encoding = 'utf8') {
      const existing = files.get(path);
      if (!sha && existing) throw new ConflictError('ya existe');
      if (sha && (!existing || existing.sha !== sha)) throw new ConflictError('does not match');
      store.writes.push({ path, content, message, sha, encoding });
      const file = { path, sha: nextSha(), content };
      files.set(path, file);
      return { sha: file.sha, commit: commit(message) };
    },
    async remove(path, message, sha) {
      const existing = files.get(path);
      if (!existing || existing.sha !== sha) throw new ConflictError('does not match');
      store.removals.push({ path, message, sha });
      files.delete(path);
      return { commit: commit(message) };
    },
  };
  return store;
}
