import { authenticate } from './_lib/access';
import { assertSameOrigin } from './_lib/auth';
import { type Data, type Env } from './_lib/env';
import { NO_STORE, errorResponse, forbidden } from './_lib/http';
import { buildAdminUser } from './_lib/user';

/**
 * Middleware de /api/admin/* (ADR-018, ADR-024): origen propio en toda petición con efectos (CSRF),
 * identidad (sesión por contraseña, modo local o Cloudflare Access opcional), rol en el servidor
 * (ADMIN_EMAILS / EDITOR_EMAILS) y `Cache-Control: no-store` en todo. Deja `context.data.user` a las rutas.
 * 401 sin identidad, 403 sin rol o con contraseña temporal pendiente, 500 sin configuración.
 * `/auth/login` y `/auth/logout` no exigen sesión (son quienes la crean o la destruyen).
 */

const PUBLIC_PATHS = new Set(['/api/admin/auth/login', '/api/admin/auth/logout']);
/** Con la contraseña temporal aún sin cambiar solo se puede consultar la identidad y cambiarla. */
const MUST_CHANGE_ALLOWED = new Set(['/api/admin/me', '/api/admin/auth/password', '/api/admin/auth/logout']);

export const onRequest: PagesFunction<Env, any, Data> = async (context) => {
  const { request, env } = context;
  try {
    assertSameOrigin(request);
    const pathname = new URL(request.url).pathname.replace(/\/+$/, '');
    if (!PUBLIC_PATHS.has(pathname)) {
      const identity = await authenticate(request, env);
      const user = buildAdminUser(env, identity);
      if (user.mustChangePassword && !MUST_CHANGE_ALLOWED.has(pathname)) {
        throw forbidden('Debes cambiar tu contraseña temporal antes de usar el panel');
      }
      context.data.user = user;
    }

    const res = await context.next();
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(NO_STORE)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } catch (e) {
    return errorResponse(e);
  }
};
