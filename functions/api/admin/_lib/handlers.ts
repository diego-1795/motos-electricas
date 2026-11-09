import type {
  AdminCatalog,
  AdminKind,
  AdminUser,
  CatalogEntry,
  CommitInfo,
  DeleteResult,
  DeployState,
  DeployStatus,
  PartPatch,
  ProductPatch,
  WriteResult,
} from '../../../../src/domain/admin';
import { applyPartPatch, applyProductPatch, canPerform, commitMessage } from '../../../../src/domain/adminPolicy';
import type { Part, Product } from '../../../../src/domain/types';
import { parsePart, parseProduct, type ParseResult } from '../../../../src/content/schemas';
import type { Env } from './env';
import { serializeJson, type ContentStore, type ListedFile } from './github';
import { badRequest, conflict, forbidden, isPlainObject, notFound, upstream, validation } from './http';
import { publicUser } from './user';

/**
 * Handlers puros del panel (ADR-018): reciben el almacén y el usuario ya autenticado;
 * aplican adminPolicy + schemas + catalogRules y devuelven los tipos del contrato
 * (o lanzan HttpError). Las rutas solo los conectan con la petición.
 */

export interface HandlerContext {
  store: ContentStore;
  user: AdminUser;
}

export const DIRS: Record<AdminKind, string> = {
  products: 'src/content/products',
  repuestos: 'src/content/repuestos',
};

export const pathOf = (kind: AdminKind, slug: string): string => `${DIRS[kind]}/${slug}.json`;

/** Resultado de un PATCH sin cambios efectivos: estado actual, sin commit. */
export type PatchResponse<T> = Omit<WriteResult<T>, 'commit'> & { commit: CommitInfo | null };

type Entity<K extends AdminKind> = K extends 'products' ? Product : Part;

const KIND_LABEL: Record<AdminKind, string> = { products: 'producto', repuestos: 'repuesto' };

/* ---------- Lectura ---------- */

/** GET /me: el usuario del middleware en su vista pública (sin lista de administradores para el editor). */
export function me(ctx: Pick<HandlerContext, 'user'>): AdminUser {
  return publicUser(ctx.user);
}

function parseStored<T>(path: string, content: string): T {
  try {
    return JSON.parse(content) as T;
  } catch {
    throw upstream(`El fichero ${path} del repositorio no es JSON válido`);
  }
}

async function readEntry<T>(store: ContentStore, path: string): Promise<CatalogEntry<T>> {
  const file = await store.read(path);
  if (!file) throw notFound(`No existe ${path} en el repositorio`);
  return { data: parseStored<T>(path, file.content), sha: file.sha, path: file.path };
}

async function loadDir<T>(store: ContentStore, dir: string): Promise<CatalogEntry<T>[]> {
  const files = (await store.list(dir)).filter((f) => f.name.endsWith('.json'));
  return Promise.all(files.map((f) => readEntry<T>(store, f.path)));
}

const byName = new Intl.Collator('es');

/** Catálogo completo (incluidos ocultos: el panel los necesita para mostrarlos/restaurarlos). */
export async function getCatalog(ctx: HandlerContext): Promise<AdminCatalog> {
  const [products, repuestos] = await Promise.all([loadDir<Product>(ctx.store, DIRS.products), loadDir<Part>(ctx.store, DIRS.repuestos)]);
  products.sort((a, b) => b.data.featured - a.data.featured || byName.compare(a.data.name, b.data.name));
  repuestos.sort((a, b) => byName.compare(a.data.name, b.data.name));
  return { products, repuestos, branch: ctx.user.branch };
}

/* ---------- PATCH (admin y editor) ---------- */

function requireSha(body: Record<string, unknown>): string {
  if (typeof body.sha !== 'string' || !body.sha.trim()) throw badRequest('Falta el sha actual del fichero en el cuerpo');
  return body.sha;
}

function optionalReason(body: Record<string, unknown>): string | undefined {
  if (body.reason === undefined || body.reason === null) return undefined;
  if (typeof body.reason !== 'string') throw badRequest('reason debe ser texto');
  return body.reason;
}

const staleSha = (path: string) => conflict(`La ficha ${path} cambió desde que la cargaste: recarga e inténtalo de nuevo`);

export async function patchEntry<K extends AdminKind>(ctx: HandlerContext, kind: K, slug: string, body: unknown): Promise<PatchResponse<Entity<K>>> {
  if (!canPerform(ctx.user.role, 'patch')) throw forbidden();
  if (!isPlainObject(body)) throw badRequest('El cuerpo debe ser un objeto');
  const sha = requireSha(body);
  optionalReason(body);

  const path = pathOf(kind, slug);
  const current = await readEntry<Entity<K>>(ctx.store, path);
  if (sha !== current.sha) throw staleSha(path);

  const result =
    kind === 'products'
      ? applyProductPatch(current.data as Product, body as unknown as ProductPatch)
      : applyPartPatch(current.data as Part, body as unknown as PartPatch);
  if (!result.ok) throw validation(`El cambio sobre ${slug} no es válido`, result.errors);
  if (!result.changes.length) return { sha: current.sha, path, data: current.data, commit: null };

  const message = commitMessage('actualizar', slug, ctx.user.email, { changes: result.changes, reason: body.reason as string | undefined });
  const written = await ctx.store.write(path, serializeJson(result.value), message, current.sha);
  return { sha: written.sha, path, data: result.value as Entity<K>, commit: written.commit };
}

/* ---------- PUT (solo admin) ---------- */

interface Slugs {
  products: ListedFile[];
  repuestos: ListedFile[];
}

async function listBoth(store: ContentStore): Promise<Slugs> {
  const [products, repuestos] = await Promise.all([store.list(DIRS.products), store.list(DIRS.repuestos)]);
  return { products, repuestos };
}

const slugOf = (f: ListedFile): string => f.name.replace(/\.json$/, '');

function validateEntity<K extends AdminKind>(kind: K, slug: string, data: unknown, listed: Slugs, creating: boolean): ParseResult<Entity<K>> {
  const productSlugs = listed.products.map(slugOf);
  const partSlugs = listed.repuestos.map(slugOf);
  if (creating) (kind === 'products' ? productSlugs : partSlugs).push(slug);
  const ctx = { productSlugs, partSlugs };
  return (kind === 'products' ? parseProduct(data, ctx) : parsePart(data, ctx)) as ParseResult<Entity<K>>;
}

export async function putEntry<K extends AdminKind>(ctx: HandlerContext, kind: K, slug: string, body: unknown): Promise<WriteResult<Entity<K>>> {
  if (!canPerform(ctx.user.role, 'put')) throw forbidden('Solo el administrador puede crear o editar fichas completas');
  if (!isPlainObject(body)) throw badRequest('El cuerpo debe ser un objeto');
  if (body.sha !== undefined && (typeof body.sha !== 'string' || !body.sha.trim())) throw badRequest('sha debe ser texto si se envía');
  const sha = body.sha as string | undefined;
  const reason = optionalReason(body);
  if (!isPlainObject(body.data)) throw badRequest('Falta data con la ficha completa');
  if (body.data.slug !== slug) throw badRequest(`data.slug ("${String(body.data.slug)}") debe coincidir con la ruta (${slug})`);

  const path = pathOf(kind, slug);
  const listed = await listBoth(ctx.store);
  const existing = listed[kind].find((f) => f.path === path);
  const creating = sha === undefined;

  const parsed = validateEntity(kind, slug, body.data, listed, creating);
  if (!parsed.ok) throw validation(`La ficha de ${KIND_LABEL[kind]} ${slug} no es válida`, parsed.errors);
  // Mismo criterio que el PATCH: `hidden` solo se persiste cuando es true (ausente = visible).
  if (parsed.value.hidden === false) delete parsed.value.hidden;

  if (creating && existing) throw conflict(`Ya existe ${path}: carga la ficha y guárdala con su sha para actualizarla`);
  if (!creating && !existing) throw notFound(`No existe ${path} en el repositorio`);
  if (!creating && existing && existing.sha !== sha) throw staleSha(path);

  const message = commitMessage(creating ? 'crear' : 'actualizar', slug, ctx.user.email, { reason });
  const written = await ctx.store.write(path, serializeJson(parsed.value), message, sha);
  return { sha: written.sha, path, data: parsed.value, commit: written.commit };
}

/* ---------- DELETE (solo admin) ---------- */

/** Quién referencia a `slug`: related/compatibleWith (productos) o accessories (repuestos). */
export function referencesTo(kind: AdminKind, slug: string, catalog: Pick<AdminCatalog, 'products' | 'repuestos'>): string[] {
  const refs: string[] = [];
  if (kind === 'products') {
    for (const p of catalog.products) if (p.data.slug !== slug && p.data.related.includes(slug)) refs.push(`producto ${p.data.slug} (related)`);
    for (const r of catalog.repuestos) if (r.data.compatibleWith.includes(slug)) refs.push(`repuesto ${r.data.slug} (compatibleWith)`);
  } else {
    for (const p of catalog.products) if (p.data.accessories.includes(slug)) refs.push(`producto ${p.data.slug} (accessories)`);
  }
  return refs;
}

export async function deleteEntry(ctx: HandlerContext, kind: AdminKind, slug: string, body: unknown): Promise<DeleteResult> {
  if (!canPerform(ctx.user.role, 'delete')) throw forbidden('Solo el administrador puede borrar fichas');
  if (!isPlainObject(body)) throw badRequest('El cuerpo debe ser un objeto');
  const sha = requireSha(body);
  const reason = optionalReason(body);

  const path = pathOf(kind, slug);
  const catalog = await getCatalog(ctx);
  const target = catalog[kind].find((e) => e.path === path);
  if (!target) throw notFound(`No existe ${path} en el repositorio`);
  if (target.sha !== sha) throw staleSha(path);

  const refs = referencesTo(kind, slug, catalog);
  if (refs.length) {
    throw conflict(`No se puede borrar ${slug}: otras fichas lo referencian. Ocúltalo en su lugar o quita primero las referencias`, refs);
  }

  const { commit } = await ctx.store.remove(path, commitMessage('borrar', slug, ctx.user.email, { reason }), sha);
  return { path, commit };
}

/* ---------- Estado del despliegue ---------- */

interface PagesDeployment {
  url?: string;
  created_on?: string;
  latest_stage?: { name?: string; status?: string };
  deployment_trigger?: { metadata?: { commit_hash?: string; commit_message?: string } };
}

export function mapDeployState(stage: { name?: string; status?: string } | undefined): DeployState {
  if (!stage) return 'unknown';
  const status = stage.status ?? '';
  if (status === 'failure' || status === 'canceled' || status === 'cancelled') return 'failure';
  if (status === 'queued') return 'queued';
  if (stage.name !== 'deploy') return 'building';
  if (status === 'active' || status === 'idle') return 'building';
  if (status === 'success') return 'success';
  return 'unknown';
}

/** Último despliegue de producción vía API de Pages; cualquier fallo → `available: false` (no rompe el panel). */
export async function deployStatus(env: Env, fetchImpl: typeof fetch = fetch): Promise<DeployStatus> {
  const token = env.CF_API_TOKEN?.trim();
  const account = env.CF_ACCOUNT_ID?.trim();
  const project = env.CF_PAGES_PROJECT?.trim();
  if (!token || !account || !project) return { available: false };

  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/pages/projects/${encodeURIComponent(project)}/deployments?per_page=1&env=production`;
  try {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (!res.ok) return { available: false };
    const body = (await res.json()) as { success?: boolean; result?: PagesDeployment[] };
    if (body.success === false || !Array.isArray(body.result)) return { available: false };
    const d = body.result[0];
    if (!d) return { available: true, state: 'unknown' };
    const status: DeployStatus = { available: true, state: mapDeployState(d.latest_stage) };
    if (d.created_on) status.createdAt = d.created_on;
    if (d.url) status.url = d.url;
    // Solo el hash: el mensaje del commit lleva el email del autor y el motivo (no se reenvía a ningún rol)
    const meta = d.deployment_trigger?.metadata;
    if (meta?.commit_hash) status.commitSha = meta.commit_hash;
    return status;
  } catch (e) {
    console.warn('[admin] no se pudo consultar la API de Pages:', e instanceof Error ? e.message : String(e));
    return { available: false };
  }
}
