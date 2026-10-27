import type { Data, Env } from './_lib/env';
import { deployStatus } from './_lib/handlers';
import { respond } from './_lib/http';

/** GET /api/admin/deploy → DeployStatus (`available: false` si no hay credenciales de la API de Pages) */
export const onRequestGet: PagesFunction<Env, any, Data> = (context) => respond(() => deployStatus(context.env));
