/**
 * Interfaces de infraestructura. La lógica de negocio depende SOLO de estas
 * abstracciones; cada proveedor (Cloudflare R2/KV, Supabase Storage, S3,
 * Vercel Blob, Resend, SES…) se implementa como adapter en /services/infra/adapters.
 * En el MVP estático ninguna se usa en runtime; existen para que el backend
 * futuro (Workers / Edge Functions) no acople el dominio al proveedor.
 */

export interface StorageService {
  put(key: string, body: Blob | ArrayBuffer | string, contentType?: string): Promise<{ url: string }>;
  get(key: string): Promise<Blob | null>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface EmailService {
  send(msg: { to: string; subject: string; text: string; html?: string }): Promise<{ id: string }>;
}

export interface RateLimiter {
  /** Devuelve true si la petición está permitida */
  allow(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

/** Adapter en memoria para tests y desarrollo local */
export class MemoryCache implements CacheService {
  private store = new Map<string, { v: unknown; exp: number }>();
  async get<T>(key: string): Promise<T | null> {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.exp && e.exp < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e.v as T;
  }
  async set<T>(key: string, value: T, ttlSeconds = 0): Promise<void> {
    this.store.set(key, { v: value, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 });
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
