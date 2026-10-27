import type { AdminUser } from '../../../src/domain/admin';
import { parseEmailList, resolveRole } from '../../../src/domain/adminPolicy';
import { authenticate } from './_lib/access';
import { branchOf, type Data, type Env } from './_lib/env';
import { NO_STORE, errorResponse, forbidden } from './_lib/http';

/**
 * Middleware de /api/admin/* (ADR-018): identidad (Cloudflare Access o modo local),
 * rol en el servidor (ADMIN_EMAILS / EDITOR_EMAILS) y `Cache-Control: no-store` en todo.
 * Deja `context.data.user` para las rutas. 401 sin identidad, 403 sin rol, 500 sin configuración.
 */
export const onRequest: PagesFunction<Env, any, Data> = async (context) => {
  const { request, env } = context;
  try {
    const { email, localMode } = await authenticate(request, env);
    const admins = parseEmailList(env.ADMIN_EMAILS);
    const editors = parseEmailList(env.EDITOR_EMAILS);
    const role = resolveRole(email, { admins, editors });
    if (!role) throw forbidden(`${email} no figura en ADMIN_EMAILS ni EDITOR_EMAILS`);

    const user: AdminUser = { email, role, admins, editors, localMode, branch: branchOf(env) };
    context.data.user = user;

    const res = await context.next();
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(NO_STORE)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } catch (e) {
    return errorResponse(e);
  }
};
