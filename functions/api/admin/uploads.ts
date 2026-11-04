import { canPerform } from '../../../src/domain/adminPolicy';
import type { Data, Env } from './_lib/env';
import { githubStore } from './_lib/github';
import { MAX_UPLOAD_BODY_BYTES, forbidden, readJsonBody, respond } from './_lib/http';
import { uploadFile } from './_lib/uploads';

/**
 * POST /api/admin/uploads  UploadBody { path, contentBase64, reason? } → UploadResult (solo admin, ADR-023).
 * Cuerpo hasta MAX_UPLOAD_BODY_BYTES; el rol se comprueba antes de leer el cuerpo.
 */
export const onRequestPost: PagesFunction<Env, any, Data> = (context) =>
  respond(async () => {
    if (!canPerform(context.data.user.role, 'upload')) throw forbidden('Solo el administrador puede subir ficheros');
    const body = await readJsonBody(context.request, MAX_UPLOAD_BODY_BYTES);
    return uploadFile({ store: githubStore(context.env), user: context.data.user }, body);
  });
