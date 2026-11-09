import { clearSessionCookie } from '../_lib/auth';
import type { Data, Env } from '../_lib/env';
import { json } from '../_lib/http';

/** POST /api/admin/auth/logout → { ok: true } y borra la cookie (no exige sesión válida). */
export const onRequestPost: PagesFunction<Env, any, Data> = (context) => json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(context.request) });
