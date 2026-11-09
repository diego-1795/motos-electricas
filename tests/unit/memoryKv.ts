import type { KvLike } from '../../functions/api/admin/_lib/auth';

/**
 * KV en memoria con el subconjunto que usa el panel (ADR-024): `get` texto, `put` con TTL opcional y `delete`.
 * El reloj se inyecta (`now`) para probar la caducidad de los contadores de intentos sin esperar.
 */
export interface MemoryKv extends KvLike {
  data: Map<string, { value: string; expiresAt: number | null }>;
  now: () => number;
  puts: string[];
}

export function memoryKv(now: () => number = () => Date.now()): MemoryKv {
  const data = new Map<string, { value: string; expiresAt: number | null }>();
  const kv: MemoryKv = {
    data,
    now,
    puts: [],
    async get(key) {
      const entry = data.get(key);
      if (!entry) return null;
      if (entry.expiresAt !== null && entry.expiresAt <= now()) {
        data.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key, value, options) {
      kv.puts.push(key);
      data.set(key, { value, expiresAt: options?.expirationTtl ? now() + options.expirationTtl * 1000 : null });
    },
    async delete(key) {
      data.delete(key);
    },
  };
  return kv;
}
