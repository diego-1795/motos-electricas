import type { AdminKind } from '../../../../src/domain/admin';
import { canPerform, type Operation } from '../../../../src/domain/adminPolicy';
import type { Data, Env } from './env';
import { githubStore } from './github';
import { deleteEntry, patchEntry, putEntry, type HandlerContext } from './handlers';
import { assertSlug, forbidden, readJsonBody, respond } from './http';

/**
 * Fábrica de las rutas `/api/admin/<kind>/:slug` (PATCH, PUT, DELETE). products/[slug].ts y
 * repuestos/[slug].ts solo eligen la colección; toda la lógica está en handlers.ts.
 * El rol se comprueba ANTES de leer el cuerpo o construir el almacén (los handlers lo
 * vuelven a comprobar: defensa en profundidad).
 */

type SlugFunction = PagesFunction<Env, 'slug', Data>;

export interface EntryRoutes {
  onRequestPatch: SlugFunction;
  onRequestPut: SlugFunction;
  onRequestDelete: SlugFunction;
}

type Action = (ctx: HandlerContext, slug: string, body: unknown) => Promise<unknown>;

export function entryRoutes(kind: AdminKind): EntryRoutes {
  const route =
    (op: Operation, action: Action, okStatus = 200): SlugFunction =>
    (context) =>
      respond(async () => {
        if (!canPerform(context.data.user.role, op)) throw forbidden();
        const slug = assertSlug(context.params.slug);
        const body = await readJsonBody(context.request);
        const ctx: HandlerContext = { store: githubStore(context.env), user: context.data.user };
        return action(ctx, slug, body);
      }, okStatus);

  return {
    onRequestPatch: route('patch', (ctx, slug, body) => patchEntry(ctx, kind, slug, body)),
    onRequestPut: route('put', (ctx, slug, body) => putEntry(ctx, kind, slug, body)),
    onRequestDelete: route('delete', (ctx, slug, body) => deleteEntry(ctx, kind, slug, body)),
  };
}
