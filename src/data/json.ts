import { getCollection, getEntry } from 'astro:content';
import type { BlogPost, Category, CategorySlug, Part, Product, Review } from '../domain/types';
import type { Testimonial } from '../domain/testimonials';
import { readingMinutes } from '../domain/reading';
import type { Repositories } from './repositories';

/**
 * Implementación MVP sobre Astro content collections (JSON/MD en el repo).
 * Solo se ejecuta en build (SSG). Para cambiar a Supabase, crear
 * src/data/supabase.ts con la misma interfaz y cambiar el export de index.ts.
 */

const products = {
  async all(): Promise<Product[]> {
    const entries = await getCollection('products');
    return entries.map((e) => e.data as Product).sort((a, b) => b.featured - a.featured);
  },
  async bySlug(slug: string) {
    return (await this.all()).find((p) => p.slug === slug);
  },
  async byCategory(category: CategorySlug) {
    return (await this.all()).filter((p) => p.category === category);
  },
  async bySlugs(slugs: string[]) {
    const all = await this.all();
    return slugs.map((s) => all.find((p) => p.slug === s)).filter((p): p is Product => !!p);
  },
  async hero() {
    const all = await this.all();
    return all.find((p) => p.isHero) ?? all[0];
  },
  async featured(limit = 4) {
    return (await this.all()).slice(0, limit);
  },
};

const parts = {
  async all(): Promise<Part[]> {
    return (await getCollection('repuestos')).map((e) => e.data as Part);
  },
  async bySlug(slug: string) {
    return (await this.all()).find((a) => a.slug === slug);
  },
  async bySlugs(slugs: string[]) {
    const all = await this.all();
    return slugs.map((s) => all.find((a) => a.slug === s)).filter((a): a is Part => !!a);
  },
  async compatibleWith(productSlug: string) {
    return (await this.all()).filter((a) => a.compatibleWith.length === 0 || a.compatibleWith.includes(productSlug));
  },
};

const categories = {
  async all(): Promise<Category[]> {
    return (await getCollection('categories')).map((e) => e.data as Category).sort((a, b) => a.order - b.order);
  },
  async bySlug(slug: CategorySlug) {
    return (await this.all()).find((c) => c.slug === slug);
  },
};

/** Artículo con slug, cuerpo y tiempo de lectura real calculado del cuerpo. */
const toPost = (e: { id: string; data: unknown; body?: string }): BlogPost & { body: string } => {
  const body = e.body ?? '';
  return { ...(e.data as Omit<BlogPost, 'slug' | 'readingMinutes'>), slug: e.id, body, readingMinutes: readingMinutes(body) };
};

const blog = {
  async all() {
    const entries = await getCollection('blog');
    return entries.map(toPost).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  },
  async bySlug(slug: string) {
    const e = await getEntry('blog', slug);
    return e ? toPost(e) : undefined;
  },
};

const faqs = {
  async groups() {
    return (await getCollection('faqs'))
      .map((e) => e.data)
      .sort((a, b) => a.order - b.order)
      .map(({ group, items }) => ({ group, items }));
  },
};

const testimonials = {
  async all(): Promise<Testimonial[]> {
    return (await getCollection('testimonials')).flatMap((e) => e.data.items.map((r) => ({ ...(r as Review), source: e.data.source })));
  },
};

export const jsonRepositories: Repositories = { products, parts, categories, blog, faqs, testimonials };
