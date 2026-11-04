import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { AdminCatalog, AdminKind, AdminUser, CatalogEntry, CommitInfo, DeleteResult, WriteResult } from '../../domain/admin';
import type { Part, Product } from '../../domain/types';
import type { AdminApiClient } from '../../services/admin/AdminApiClient';

/** Estado compartido del panel (lo provee AdminApp; lo consumen las islas hijas). */

export type Tone = 'info' | 'error';

export interface AdminCtx {
  user: AdminUser;
  catalog: AdminCatalog;
  api: AdminApiClient;
  /** Mensaje para la región aria-live (info → role=status, error → role=alert) */
  notify(text: string, tone?: Tone): void;
  /** Tras una escritura correcta: sustituye/añade la entrada y dispara el banner de publicación */
  applyWrite(kind: AdminKind, result: WriteResult<Product | Part>): void;
  /** Tras un borrado correcto */
  applyDelete(kind: AdminKind, slug: string, result: DeleteResult): void;
  /** Tras una escritura fuera del catálogo (blog, subidas): anuncia el mensaje y dispara el banner de publicación */
  announce(commit: CommitInfo, text: string): void;
  /** Convierte cualquier error en texto legible; un 409 avisa del conflicto y recarga el catálogo. */
  handleError(err: unknown): string;
  /** Vuelve a pedir el catálogo (conserva usuario y pestaña) */
  reload(): Promise<void>;
  /** Se incrementa en cada recarga del catálogo: las celdas descartan ediciones a medias */
  reloadSeq: number;
  /**
   * sha más reciente conocido de una ficha (se actualiza de forma síncrona con cada WriteResult y recarga,
   * sin esperar al re-render). Dos escrituras seguidas sobre la misma fila usan así el sha correcto.
   */
  latestSha(kind: AdminKind, slug: string): string | undefined;
}

export const AdminContext = createContext<AdminCtx | null>(null);

export function useAdmin(): AdminCtx {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin fuera de AdminApp');
  return ctx;
}

export const CONFLICT_MESSAGE = 'Alguien modificó esta ficha; se ha recargado';
/** Editor de ficha tras un 409: su formulario parte de la versión antigua y no debe volver a guardarse */
export const STALE_EDITOR_MESSAGE = 'Cierra el editor y vuelve a abrirlo para partir de la versión actual; después repite tus cambios.';

export const roleLabel: Record<AdminUser['role'], string> = { admin: 'Administrador', editor: 'Editor' };

export const kindLabel: Record<AdminKind, { singular: string; plural: string }> = {
  products: { singular: 'producto', plural: 'Productos' },
  repuestos: { singular: 'repuesto', plural: 'Repuestos' },
};

/** Pestañas del panel: colecciones del catálogo + blog (solo admin, ADR-023) */
export type AdminTab = AdminKind | 'blog';

/** Fichero (PDF) → base64 (sin el prefijo data:) para UploadBody.contentBase64 */
export async function fileToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function findEntry(catalog: AdminCatalog, kind: AdminKind, slug: string): CatalogEntry<Product | Part> | undefined {
  const list: CatalogEntry<Product | Part>[] = kind === 'products' ? catalog.products : catalog.repuestos;
  return list.find((e) => e.data.slug === slug);
}

/** Céntimos → texto editable en soles ("1200", "1200.50") */
export function centsToInput(cents: number): string {
  const s = (cents / 100).toFixed(2);
  return s.endsWith('.00') ? s.slice(0, -3) : s;
}

/**
 * Solo enlaces http(s) absolutos: las URL que llegan del API (commit de GitHub, despliegue de Pages)
 * se pintan en `href`, y un esquema distinto (javascript:, data:…) no debe llegar nunca al DOM.
 */
export function safeHttpUrl(u: string | undefined | null): string | undefined {
  if (typeof u !== 'string' || !u) return undefined;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Búsqueda sin tildes ni mayúsculas */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
