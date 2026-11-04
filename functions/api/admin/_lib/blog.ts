import type { BlogEntry, BlogFrontmatter, BlogList, BlogSummary, BlogWriteResult, DeleteResult } from '../../../../src/domain/admin';
import { canPerform, commitMessage } from '../../../../src/domain/adminPolicy';
import { FrontmatterError, parseFrontmatter, serializeFrontmatter } from '../../../../src/domain/frontmatter';
import { parsePost } from '../../../../src/content/schemas';
import type { ContentStore, ListedFile } from './github';
import type { HandlerContext } from './handlers';
import { DIRS } from './handlers';
import { badRequest, conflict, forbidden, isPlainObject, notFound, upstream, validation } from './http';

/**
 * Handlers del blog (ADR-023): artículos Markdown de src/content/blog/<slug>.md, solo para el rol admin.
 * Mismo patrón que handlers.ts (almacén inyectable, concurrencia por sha, validación con el esquema del
 * build antes de escribir). El tiempo de lectura no se escribe: lo calcula el build del cuerpo (ADR-016).
 */

export const BLOG_DIR = 'src/content/blog';

export const blogPath = (slug: string): string => `${BLOG_DIR}/${slug}.md`;

/** Orden fijo de claves en el frontmatter escrito (diffs mínimos; mismo orden que los ficheros actuales). */
const FRONTMATTER_KEYS: (keyof BlogFrontmatter)[] = ['title', 'description', 'category', 'publishedAt', 'updatedAt', 'author', 'image', 'relatedProducts'];

export function serializePost(frontmatter: BlogFrontmatter, body: string): string {
  const ordered: Record<string, unknown> = {};
  for (const k of FRONTMATTER_KEYS) {
    const v = frontmatter[k];
    if (v === undefined) continue;
    // La imagen también con orden fijo de claves (src, alt, width, height)
    ordered[k] = k === 'image' && frontmatter.image ? { src: frontmatter.image.src, alt: frontmatter.image.alt, width: frontmatter.image.width, height: frontmatter.image.height } : v;
  }
  return serializeFrontmatter(ordered, body);
}

const slugOf = (f: ListedFile): string => f.name.replace(/\.md$/, '');

function requireAdmin(ctx: Pick<HandlerContext, 'user'>): void {
  if (!canPerform(ctx.user.role, 'blog')) throw forbidden('Solo el administrador puede gestionar el blog');
}

/** Lee y valida un artículo del repositorio; un fichero que no pasa el esquema del build se señala como 502 (se corrige por git). */
async function readPost(store: ContentStore, slug: string): Promise<BlogEntry> {
  const path = blogPath(slug);
  const file = await store.read(path);
  if (!file) throw notFound(`No existe ${path} en el repositorio`);
  let parsed: { data: Record<string, unknown>; body: string };
  try {
    parsed = parseFrontmatter(file.content);
  } catch (e) {
    throw upstream(`El artículo ${path} tiene un frontmatter que el panel no entiende: ${e instanceof FrontmatterError ? e.message : 'formato no admitido'}. Corrígelo por git.`);
  }
  const r = parsePost(slug, parsed.data, parsed.body);
  if (!r.ok) throw upstream(`El artículo ${path} del repositorio no pasa la validación del build; corrígelo por git`, r.errors);
  return { slug, frontmatter: r.value.frontmatter, body: r.value.body, sha: file.sha, path };
}

async function listPostFiles(store: ContentStore): Promise<ListedFile[]> {
  return (await store.list(BLOG_DIR)).filter((f) => f.name.endsWith('.md'));
}

/* ---------- Lectura ---------- */

/** Lista de artículos (1 + N subpeticiones a GitHub: el frontmatter obliga a leer cada fichero). Más reciente primero. */
export async function listPosts(ctx: HandlerContext): Promise<BlogList> {
  requireAdmin(ctx);
  const files = await listPostFiles(ctx.store);
  const entries = await Promise.all(files.map((f) => readPost(ctx.store, slugOf(f))));
  const posts: BlogSummary[] = entries.map((e) => ({
    slug: e.slug,
    title: e.frontmatter.title,
    category: e.frontmatter.category,
    publishedAt: e.frontmatter.publishedAt,
    ...(e.frontmatter.updatedAt ? { updatedAt: e.frontmatter.updatedAt } : {}),
    author: e.frontmatter.author,
    hasImage: Boolean(e.frontmatter.image),
    sha: e.sha,
    path: e.path,
  }));
  posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
  return { posts, branch: ctx.user.branch };
}

export async function getPost(ctx: HandlerContext, slug: string): Promise<BlogEntry> {
  requireAdmin(ctx);
  return readPost(ctx.store, slug);
}

/* ---------- Escritura ---------- */

function optionalReason(body: Record<string, unknown>): string | undefined {
  if (body.reason === undefined || body.reason === null) return undefined;
  if (typeof body.reason !== 'string') throw badRequest('reason debe ser texto');
  return body.reason;
}

const staleSha = (path: string) => conflict(`El artículo ${path} cambió desde que lo cargaste: recarga e inténtalo de nuevo`);

export async function putPost(ctx: HandlerContext, slug: string, body: unknown): Promise<BlogWriteResult> {
  requireAdmin(ctx);
  if (!isPlainObject(body)) throw badRequest('El cuerpo debe ser un objeto');
  if (body.sha !== undefined && (typeof body.sha !== 'string' || !body.sha.trim())) throw badRequest('sha debe ser texto si se envía');
  const sha = body.sha as string | undefined;
  const reason = optionalReason(body);
  if (!isPlainObject(body.frontmatter)) throw badRequest('Falta frontmatter con los datos del artículo');
  if (typeof body.body !== 'string') throw badRequest('Falta body con el texto Markdown del artículo');

  const path = blogPath(slug);
  const [files, products] = await Promise.all([listPostFiles(ctx.store), ctx.store.list(DIRS.products)]);
  const existing = files.find((f) => f.path === path);
  const creating = sha === undefined;

  const parsed = parsePost(slug, body.frontmatter, body.body, { productSlugs: products.filter((f) => f.name.endsWith('.json')).map((f) => f.name.replace(/\.json$/, '')) });
  if (!parsed.ok) throw validation(`El artículo ${slug} no es válido`, parsed.errors);

  if (creating && existing) throw conflict(`Ya existe ${path}: carga el artículo y guárdalo con su sha para actualizarlo`);
  if (!creating && !existing) throw notFound(`No existe ${path} en el repositorio`);
  if (!creating && existing && existing.sha !== sha) throw staleSha(path);

  const content = serializePost(parsed.value.frontmatter, parsed.value.body);
  const message = commitMessage(creating ? 'crear' : 'actualizar', slug, ctx.user.email, { reason }, 'blog');
  const written = await ctx.store.write(path, content, message, sha);
  return { slug, frontmatter: parsed.value.frontmatter, body: parsed.value.body, sha: written.sha, path, commit: written.commit };
}

export async function deletePost(ctx: HandlerContext, slug: string, body: unknown): Promise<DeleteResult> {
  requireAdmin(ctx);
  if (!isPlainObject(body)) throw badRequest('El cuerpo debe ser un objeto');
  if (typeof body.sha !== 'string' || !body.sha.trim()) throw badRequest('Falta el sha actual del fichero en el cuerpo');
  const reason = optionalReason(body);
  const path = blogPath(slug);
  const existing = (await listPostFiles(ctx.store)).find((f) => f.path === path);
  if (!existing) throw notFound(`No existe ${path} en el repositorio`);
  if (existing.sha !== body.sha) throw staleSha(path);
  // Nadie referencia a un artículo (es una hoja): no hay comprobación de referencias como en el catálogo.
  const { commit } = await ctx.store.remove(path, commitMessage('borrar', slug, ctx.user.email, { reason }, 'blog'), body.sha);
  return { path, commit };
}
