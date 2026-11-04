import { canPerform } from '../../../../src/domain/adminPolicy';
import { listPosts } from '../_lib/blog';
import type { Data, Env } from '../_lib/env';
import { githubStore } from '../_lib/github';
import { forbidden, respond } from '../_lib/http';

/** GET /api/admin/blog → BlogList (solo admin; el rol se comprueba antes de construir el almacén) */
export const onRequestGet: PagesFunction<Env, any, Data> = (context) =>
  respond(async () => {
    if (!canPerform(context.data.user.role, 'blog')) throw forbidden('Solo el administrador puede gestionar el blog');
    return listPosts({ store: githubStore(context.env), user: context.data.user });
  });
