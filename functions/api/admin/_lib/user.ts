import type { AdminUser } from '../../../../src/domain/admin';
import { parseUserList, resolveRole } from '../../../../src/domain/adminPolicy';
import { branchOf, type Env } from './env';
import { forbidden } from './http';

/** Listas de usuarios de la configuración (ADMIN_USERS / EDITOR_USERS, ADR-025). */
export function userLists(env: Env): { admins: string[]; editors: string[] } {
  return { admins: parseUserList(env.ADMIN_USERS), editors: parseUserList(env.EDITOR_USERS) };
}

/**
 * Convierte una identidad verificada (usuario) en el AdminUser del contrato: el rol se decide SIEMPRE en el
 * servidor con ADMIN_USERS / EDITOR_USERS. Un usuario autenticado pero sin rol → 403.
 */
export function buildAdminUser(env: Env, identity: { username: string; localMode: boolean; mustChange: boolean }): AdminUser {
  const { admins, editors } = userLists(env);
  const role = resolveRole(identity.username, { admins, editors });
  if (!role) throw forbidden(`${identity.username} no figura en ADMIN_USERS ni EDITOR_USERS`);
  const user: AdminUser = { username: identity.username, role, admins, editors, localMode: identity.localMode, branch: branchOf(env) };
  if (identity.mustChange) user.mustChangePassword = true;
  return user;
}

/**
 * Vista del usuario que se devuelve al navegador (/me, login, cambio de contraseña): el editor no necesita
 * (ni debe recibir) la lista de administradores, que es la mitad de una credencial.
 */
export function publicUser(u: AdminUser): AdminUser {
  return u.role === 'admin' ? u : { ...u, admins: [], editors: [u.username] };
}

/** Un usuario con contraseña válida pero sin rol no debe ni iniciar sesión: misma comprobación antes de emitir la cookie. */
export function hasRole(env: Env, username: string): boolean {
  return resolveRole(username, userLists(env)) !== null;
}
