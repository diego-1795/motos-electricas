import { issueSession, loginWithPassword } from '../_lib/auth';
import type { Data, Env } from '../_lib/env';
import { errorResponse, json, readJsonBody, unauthorized } from '../_lib/http';
import { buildAdminUser, hasRole } from '../_lib/user';

/**
 * POST /api/admin/auth/login  LoginBody { email, password } → AdminUser + cookie de sesión (ADR-024).
 * 401 credenciales incorrectas (mismo mensaje para email desconocido), 423 bloqueo temporal,
 * 403 email sin rol (no se emite cookie), 500 configuración.
 */
export const onRequestPost: PagesFunction<Env, any, Data> = async (context) => {
  try {
    const body = await readJsonBody(context.request, 4 * 1024);
    const identity = await loginWithPassword(context.env, context.request, body.email, body.password);
    // Sin rol no hay sesión: evita cookies válidas para cuentas que ya no están en las listas.
    if (!hasRole(context.env, identity.email)) throw unauthorized(`${identity.email} ya no tiene acceso al panel: pide al administrador que te añada`);
    const user = buildAdminUser(context.env, { ...identity, localMode: false });
    const cookie = await issueSession(context.env, context.request, identity);
    return json(user, 200, { 'Set-Cookie': cookie });
  } catch (e) {
    return errorResponse(e);
  }
};
