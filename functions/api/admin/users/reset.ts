import type { Data, Env } from '../_lib/env';
import { readJsonBody, respond } from '../_lib/http';
import { resetUserPassword } from '../_lib/users';

/** POST /api/admin/users/reset  ResetPasswordBody { username } → ResetPasswordResult (solo admin, ADR-025) */
export const onRequestPost: PagesFunction<Env, any, Data> = (context) =>
  respond(async () => resetUserPassword(context.env, context.data.user, await readJsonBody(context.request, 1024)));
