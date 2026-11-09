import { changePassword, issueSession } from '../_lib/auth';
import type { Data, Env } from '../_lib/env';
import { errorResponse, forbidden, json, readJsonBody } from '../_lib/http';
import { buildAdminUser } from '../_lib/user';

/**
 * POST /api/admin/auth/password  ChangePasswordBody { currentPassword, newPassword } → AdminUser + nueva cookie (ADR-024).
 * Sube la versión de la contraseña: cualquier otra sesión abierta deja de ser válida.
 * 401 contraseña actual incorrecta, 422 política, 403 en modo local (no hay contraseñas que cambiar).
 */
export const onRequestPost: PagesFunction<Env, any, Data> = async (context) => {
  try {
    const current = context.data.user;
    if (current.localMode) throw forbidden('En modo local no hay contraseña que cambiar');
    const body = await readJsonBody(context.request, 4 * 1024);
    const identity = await changePassword(context.env, current.email, body.currentPassword, body.newPassword);
    const user = buildAdminUser(context.env, { ...identity, localMode: false });
    const cookie = await issueSession(context.env, context.request, identity);
    return json(user, 200, { 'Set-Cookie': cookie });
  } catch (e) {
    return errorResponse(e);
  }
};
