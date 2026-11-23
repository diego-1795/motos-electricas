import type { AdminUser, ResetPasswordResult } from '../../../../src/domain/admin';
import { isUsername, normalizeUsername } from '../../../../src/domain/adminAuth';
import { canPerform } from '../../../../src/domain/adminPolicy';
import { resetPassword } from './auth';
import type { Env } from './env';
import { badRequest, forbidden, isPlainObject, notFound } from './http';
import { hasRole } from './user';

/**
 * POST /api/admin/users/reset (ADR-025): el admin restablece la contraseña de OTRO usuario del panel.
 * - 403 si quien lo pide no es admin, o si intenta restablecer la suya (para eso está "Cambiar contraseña";
 *   si el admin olvida la suya, se restablece con una entrada nueva en ADMIN_INITIAL_PASSWORDS).
 * - 404 si el usuario no figura en ADMIN_USERS / EDITOR_USERS.
 * Devuelve la contraseña temporal en claro una sola vez; el usuario deberá cambiarla al entrar.
 */
export async function resetUserPassword(env: Env, actor: AdminUser, body: unknown): Promise<ResetPasswordResult> {
  if (!canPerform(actor.role, 'users')) throw forbidden();
  if (actor.localMode) throw forbidden('En modo local no hay contraseñas que restablecer');
  if (!isPlainObject(body)) throw badRequest('Cuerpo inválido: se esperaba { username }');
  const username = normalizeUsername(body.username);
  if (!isUsername(username)) throw badRequest('Usuario no válido');
  if (username === actor.username) throw forbidden('Tu propia contraseña se cambia desde "Cambiar contraseña"');
  if (!hasRole(env, username)) throw notFound(`${username} no es un usuario del panel`);
  return resetPassword(env, username);
}
