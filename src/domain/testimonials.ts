import type { Review } from './types';

/**
 * Testimonios de la "Comunidad RAIDEN": reseñas públicas reales del negocio
 * (hoy, la ficha de Google Maps de EG Motors / RAIDEN). Contenido en
 * src/content/testimonials/*.json; aquí solo la selección, pura.
 */
export interface Testimonial extends Review {
  /** Origen de la reseña, p. ej. "google" */
  source: string;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Elige los testimonios a destacar: solo reseñas con texto y valoración ≥ minRating,
 * ordenadas por las que más cuentan (más palabras) y, a igualdad, las más recientes.
 */
export function pickTestimonials<T extends Review>(reviews: T[], limit = 3, minRating = 4): T[] {
  return reviews
    .filter((r) => r.rating >= minRating && wordCount(r.text) > 0)
    .sort((a, b) => wordCount(b.text) - wordCount(a.text) || b.date.localeCompare(a.date))
    .slice(0, limit);
}

/** Media de valoración a 1 decimal (undefined si no hay reseñas) */
export function averageRating(reviews: Review[]): number | undefined {
  if (!reviews.length) return undefined;
  return Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10;
}
