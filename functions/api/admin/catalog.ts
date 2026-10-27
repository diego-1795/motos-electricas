import type { Data, Env } from './_lib/env';
import { githubStore } from './_lib/github';
import { getCatalog } from './_lib/handlers';
import { respond } from './_lib/http';

/** GET /api/admin/catalog → AdminCatalog (productos y repuestos con sha, incluidos ocultos) */
export const onRequestGet: PagesFunction<Env, any, Data> = (context) =>
  respond(() => getCatalog({ store: githubStore(context.env), user: context.data.user }));
