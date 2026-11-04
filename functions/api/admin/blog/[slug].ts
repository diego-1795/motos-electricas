import { canPerform } from '../../../../src/domain/adminPolicy';
import { deletePost, getPost, putPost } from '../_lib/blog';
import type { Data, Env } from '../_lib/env';
import { githubStore } from '../_lib/github';
import type { HandlerContext } from '../_lib/handlers';
import { assertSlug, forbidden, readJsonBody, respond } from '../_lib/http';

/**
 * GET    /api/admin/blog/:slug  → BlogEntry        (solo admin)
 * PUT    /api/admin/blog/:slug  BlogPutBody        (solo admin; sin sha = crear)
 * DELETE /api/admin/blog/:slug  DeleteBody         (solo admin)
 * Como en routes.ts: rol → slug → cuerpo → almacén (los handlers vuelven a comprobar el rol).
 */

type SlugFunction = PagesFunction<Env, 'slug', Data>;

const route =
  (action: (ctx: HandlerContext, slug: string, body: unknown) => Promise<unknown>, withBody: boolean): SlugFunction =>
  (context) =>
    respond(async () => {
      if (!canPerform(context.data.user.role, 'blog')) throw forbidden('Solo el administrador puede gestionar el blog');
      const slug = assertSlug(context.params.slug);
      const body = withBody ? await readJsonBody(context.request) : undefined;
      return action({ store: githubStore(context.env), user: context.data.user }, slug, body);
    });

export const onRequestGet = route((ctx, slug) => getPost(ctx, slug), false);
export const onRequestPut = route((ctx, slug, body) => putPost(ctx, slug, body), true);
export const onRequestDelete = route((ctx, slug, body) => deletePost(ctx, slug, body), true);
