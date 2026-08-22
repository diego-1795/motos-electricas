import type { ImageMetadata } from 'astro';
import type { ImageRef } from '../domain/types';

/**
 * Resuelve referencias "~/assets/..." del contenido a módulos de imagen
 * procesables por astro:assets (AVIF/WebP, srcset, dimensiones explícitas).
 * Las URLs absolutas (CDN/Supabase Storage en el futuro) se devuelven tal cual.
 */
const modules = import.meta.glob<{ default: ImageMetadata }>('/src/assets/**/*.{svg,png,jpg,jpeg,webp,avif}', { eager: true });

export function resolveImage(ref: ImageRef): ImageMetadata | string {
  if (ref.src.startsWith('~/')) {
    const key = `/src/${ref.src.slice(2)}`;
    const mod = modules[key];
    if (!mod) throw new Error(`Imagen no encontrada: ${ref.src} (esperada en ${key})`);
    return mod.default;
  }
  return ref.src;
}

/** URL pública (para og:image, JSON-LD, carrito) */
export function publicSrc(ref: ImageRef): string {
  const r = resolveImage(ref);
  return typeof r === 'string' ? r : r.src;
}
