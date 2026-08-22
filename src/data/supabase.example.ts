/**
 * ESQUELETO (no se usa en el MVP). Muestra cómo migrar a Supabase/PostgreSQL
 * sin tocar UI ni dominio: implementar la misma interfaz `Repositories` y
 * cambiar el export en src/data/index.ts.
 *
 * Requisitos cuando se active:
 *  - npm i @supabase/supabase-js
 *  - Variables: PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY (solo lectura pública vía RLS)
 *  - Esquema: docs/06-database.md
 *  - Build estático: las consultas se ejecutan en build (SSG) → sigue siendo
 *    gratuito y sin servidor. Para datos en tiempo real, añadir adapter SSR.
 *
 * Renombrar a supabase.ts y completar los TODO cuando se necesite.
 */
import type { Accessory, BlogPost, Category, CategorySlug, Product } from '../domain/types';
import type { Repositories } from './repositories';

type Client = {
  from(table: string): {
    select(cols: string): { eq(col: string, v: unknown): Promise<{ data: unknown[] | null }>; order(col: string, o?: { ascending: boolean }): Promise<{ data: unknown[] | null }> };
  };
};

export function createSupabaseRepositories(client: Client): Repositories {
  const rows = async <T>(table: string, order: string, asc = true): Promise<T[]> => {
    const { data } = await client.from(table).select('*').order(order, { ascending: asc });
    return (data ?? []) as T[];
  };

  const products: Repositories['products'] = {
    all: () => rows<Product>('products_view', 'featured', false), // vista que agrega variants/colors como JSON
    bySlug: async (slug) => (await products.all()).find((p) => p.slug === slug),
    byCategory: async (c: CategorySlug) => (await products.all()).filter((p) => p.category === c),
    bySlugs: async (slugs) => (await products.all()).filter((p) => slugs.includes(p.slug)),
    hero: async () => (await products.all()).find((p) => p.isHero),
    featured: async (limit = 4) => (await products.all()).slice(0, limit),
  };

  const accessories: Repositories['accessories'] = {
    all: () => rows<Accessory>('accessories', 'name'),
    bySlug: async (slug) => (await accessories.all()).find((a) => a.slug === slug),
    bySlugs: async (slugs) => (await accessories.all()).filter((a) => slugs.includes(a.slug)),
    compatibleWith: async (slug) => (await accessories.all()).filter((a) => !a.compatibleWith.length || a.compatibleWith.includes(slug)),
  };

  const categories: Repositories['categories'] = {
    all: () => rows<Category>('categories', 'order'),
    bySlug: async (slug) => (await categories.all()).find((c) => c.slug === slug),
  };

  const blog: Repositories['blog'] = {
    all: () => rows<BlogPost & { body: string }>('blog_posts', 'published_at', false),
    bySlug: async (slug) => (await blog.all()).find((p) => p.slug === slug),
  };

  const faqs: Repositories['faqs'] = {
    groups: () => rows<{ group: string; items: { question: string; answer: string }[] }>('faq_groups_view', 'order'),
  };

  return { products, accessories, categories, blog, faqs };
}
