import { describe, it, expect } from 'vitest';
import { averageRating, pickTestimonials, wordCount } from '../../src/domain/testimonials';
import type { Review } from '../../src/domain/types';

const r = (text: string, rating: Review['rating'] = 5, date = '2026-10'): Review => ({ author: 'A', rating, text, date });

describe('wordCount', () => {
  it('cuenta palabras separadas por espacios, ignorando vacíos', () => {
    expect(wordCount('Muy buena atención.')).toBe(3);
    expect(wordCount('  Bonitas  las motos!\nBuena atención ')).toBe(5);
    expect(wordCount('')).toBe(0);
    expect(wordCount('   ')).toBe(0);
  });
});

describe('pickTestimonials', () => {
  it('prefiere las reseñas con más palabras', () => {
    const corta = r('Muy buena atención.');
    const larga = r('Gracias Raiden, mi moto resultó mejor de lo que esperaba, es práctica y cómoda.');
    const media = r('Buena atención, variedad de colores. Las motos están demasiado buenas.');
    expect(pickTestimonials([corta, larga, media], 2)).toEqual([larga, media]);
  });

  it('descarta reseñas sin texto y con valoración baja', () => {
    const soloEstrellas = r('');
    const baja = r('Texto largo pero con dos estrellas, no se destaca en portada.', 2);
    const buena = r('Excelente calidad de motos eléctricas.');
    expect(pickTestimonials([soloEstrellas, baja, buena])).toEqual([buena]);
  });

  it('a igual longitud, la más reciente primero', () => {
    const vieja = r('Muy buena atención.', 5, '2026-09');
    const nueva = r('Bonitas las motos!', 5, '2026-10');
    expect(pickTestimonials([vieja, nueva])).toEqual([nueva, vieja]);
  });

  it('respeta el límite y no muta la entrada', () => {
    const list = [r('a b c'), r('a b'), r('a')];
    const copy = [...list];
    expect(pickTestimonials(list, 1)).toHaveLength(1);
    expect(list).toEqual(copy);
  });
});

describe('averageRating', () => {
  it('media a un decimal; undefined sin reseñas', () => {
    expect(averageRating([])).toBeUndefined();
    expect(averageRating([r('x', 5), r('y', 4)])).toBe(4.5);
    expect(averageRating([r('x', 5), r('y', 5), r('z', 4)])).toBe(4.7);
  });
});
