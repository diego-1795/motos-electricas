import type { AdminUser } from '../../../../src/domain/admin';
import { parseEmailList, resolveRole } from '../../../../src/domain/adminPolicy';
import { branchOf, type Env } from './env';
import { forbidden } from './http';

/**
 * Convierte una identidad verificada (email) en el AdminUser del contrato: el rol se decide SIEMPRE en el
 * servidor con ADMIN_EMAILS / EDITOR_EMAILS. Un email autenticado pero sin rol → 403.
 */
export function buildAdminUser(env: Env, identity: { email: string; localMode: boolean; mustChange: boolean }): AdminUser {
  const admins = parseEmailList(env.ADMIN_EMAILS);
  const editors = parseEmailList(env.EDITOR_EMAILS);
  const role = resolveRole(identity.email, { admins, editors });
  if (!role) throw forbidden(`${identity.email} no figura en ADMIN_EMAILS ni EDITOR_EMAILS`);
  const user: AdminUser = { email: identity.email, role, admins, editors, localMode: identity.localMode, branch: branchOf(env) };
  if (identity.mustChange) user.mustChangePassword = true;
  return user;
}

/**
 * Vista del usuario que se devuelve al navegador (/me, login, cambio de contraseña): el editor no necesita
 * (ni debe recibir) la lista de emails administradores, que son la mitad de una credencial.
 */
export function publicUser(u: AdminUser): AdminUser {
  return u.role === 'admin' ? u : { ...u, admins: [], editors: [u.email] };
}

/** Un email con contraseña válida pero sin rol no debe ni iniciar sesión: misma comprobación antes de emitir la cookie. */
export function hasRole(env: Env, email: string): boolean {
  return resolveRole(email, { admins: parseEmailList(env.ADMIN_EMAILS), editors: parseEmailList(env.EDITOR_EMAILS) }) !== null;
}
