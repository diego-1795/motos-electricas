import type { UploadResult } from '../../../../src/domain/admin';
import { canPerform, commitMessage } from '../../../../src/domain/adminPolicy';
import { uploadErrors, uploadTarget } from '../../../../src/domain/uploads';
import type { ContentStore, ListedFile } from './github';
import type { HandlerContext } from './handlers';
import { HttpError, badRequest, forbidden, isPlainObject, validation } from './http';

/**
 * Subida de PDF (manual / ficha técnica) al repositorio (ADR-023). Solo admin. Las imágenes no se
 * suben desde el panel (van por git en webp). Ruta blanca, cabecera real y tamaño los comprueba
 * src/domain/uploads.ts; aquí se decodifica el base64, se busca el sha si el fichero ya existe
 * (para sustituirlo) y se hace el commit. Un fichero nuevo no necesita sha.
 */

export function decodeBase64(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) throw badRequest('contentBase64 no es base64 válido');
  let bin: string;
  try {
    bin = atob(clean);
  } catch {
    throw badRequest('contentBase64 no es base64 válido');
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Lista un directorio que puede no existir todavía (public/docs se crea con la primera subida). */
async function listOrEmpty(store: ContentStore, dir: string): Promise<ListedFile[]> {
  try {
    return await store.list(dir);
  } catch (e) {
    if (e instanceof HttpError && e.code === 'not_found') return [];
    throw e;
  }
}

export async function uploadFile(ctx: HandlerContext, body: unknown): Promise<UploadResult> {
  if (!canPerform(ctx.user.role, 'upload')) throw forbidden('Solo el administrador puede subir ficheros');
  if (!isPlainObject(body)) throw badRequest('El cuerpo debe ser un objeto');
  const target = uploadTarget(body.path);
  if (!target) throw validation('Ruta de destino no permitida', ['path debe ser public/docs/<nombre>.pdf (minúsculas, números y guiones)']);
  if (typeof body.contentBase64 !== 'string' || !body.contentBase64.trim()) throw badRequest('Falta contentBase64 con el contenido del fichero');
  if (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string') throw badRequest('reason debe ser texto');

  const bytes = decodeBase64(body.contentBase64);
  const errors = uploadErrors(target, bytes);
  if (errors.length) throw validation(`No se puede subir ${target.path}`, errors);

  const dir = target.path.slice(0, target.path.lastIndexOf('/'));
  const existing = (await listOrEmpty(ctx.store, dir)).find((f) => f.path === target.path);
  const message = commitMessage('subir', target.path, ctx.user.email, { changes: [`${bytes.length} bytes${existing ? ' (sustituye al anterior)' : ''}`], reason: body.reason as string | undefined }, 'assets');
  const written = await ctx.store.write(target.path, body.contentBase64.replace(/\s+/g, ''), message, existing?.sha, 'base64');
  return { path: target.path, ref: target.ref, bytes: bytes.length, sha: written.sha, replaced: Boolean(existing), commit: written.commit };
}
