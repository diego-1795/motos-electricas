import type { Data, Env } from './_lib/env';
import { me } from './_lib/handlers';
import { json } from './_lib/http';

/** GET /api/admin/me → AdminUser (lo deja el middleware) */
export const onRequestGet: PagesFunction<Env, any, Data> = (context) => json(me({ user: context.data.user }));
