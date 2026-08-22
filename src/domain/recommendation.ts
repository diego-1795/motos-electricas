import type { CategorySlug, Product, UseCase } from './types';
import { effectiveSpecs, fromPrice, maxRange } from './product';

/**
 * Motor de "Encuentra tu moto". Puntuación determinista y explicable.
 * Cada criterio aporta 0..1 ponderado; el resultado se normaliza a 0..100.
 */

export interface FinderAnswers {
  useCases: UseCase[];
  /** Presupuesto máximo en céntimos; undefined = sin límite */
  budgetMax?: number;
  /** Autonomía mínima deseada en km */
  rangeMin?: number;
  /** Velocidad mínima deseada en km/h */
  speedMin?: number;
  /** Potencia mínima en W */
  powerMin?: number;
  /** Tipos preferidos; vacío = cualquiera */
  types: CategorySlug[];
}

export interface Recommendation {
  product: Product;
  score: number;
  reasons: string[];
}

const WEIGHTS = { useCases: 3, budget: 2.5, range: 2, speed: 1.5, power: 1, type: 2 } as const;

function ratio(value: number, target: number): number {
  if (target <= 0) return 1;
  return Math.max(0, Math.min(1, value / target));
}

export function scoreProduct(p: Product, a: FinderAnswers): Recommendation {
  const specs = effectiveSpecs(p);
  const reasons: string[] = [];
  let score = 0;
  let weight = 0;

  if (a.useCases.length) {
    const matched = a.useCases.filter((u) => p.useCases.includes(u));
    const s = matched.length / a.useCases.length;
    score += s * WEIGHTS.useCases;
    weight += WEIGHTS.useCases;
    if (matched.length) reasons.push(`Ideal para ${matched.map(useCaseLabel).join(', ').toLowerCase()}`);
  }

  if (a.budgetMax !== undefined) {
    const price = fromPrice(p).amount;
    const s = price <= a.budgetMax ? 1 : Math.max(0, 1 - (price - a.budgetMax) / a.budgetMax);
    score += s * WEIGHTS.budget;
    weight += WEIGHTS.budget;
    if (price <= a.budgetMax) reasons.push('Dentro de tu presupuesto');
  }

  if (a.rangeMin !== undefined) {
    const r = maxRange(p);
    const s = ratio(r, a.rangeMin);
    score += s * WEIGHTS.range;
    weight += WEIGHTS.range;
    if (r >= a.rangeMin) reasons.push(`Hasta ${r} km de autonomía`);
  }

  if (a.speedMin !== undefined) {
    const s = ratio(specs.topSpeedKmh, a.speedMin);
    score += s * WEIGHTS.speed;
    weight += WEIGHTS.speed;
    if (specs.topSpeedKmh >= a.speedMin) reasons.push(`${specs.topSpeedKmh} km/h de velocidad máxima`);
  }

  if (a.powerMin !== undefined) {
    const s = ratio(specs.powerW, a.powerMin);
    score += s * WEIGHTS.power;
    weight += WEIGHTS.power;
  }

  if (a.types.length) {
    const s = a.types.includes(p.category) ? 1 : 0;
    score += s * WEIGHTS.type;
    weight += WEIGHTS.type;
  }

  const normalized = weight === 0 ? 50 : Math.round((score / weight) * 100);
  return { product: p, score: normalized, reasons: reasons.slice(0, 3) };
}

export function recommend(products: Product[], answers: FinderAnswers, limit = 6): Recommendation[] {
  return products
    .filter((p) => p.category !== 'accesorios')
    .map((p) => scoreProduct(p, answers))
    .sort((x, y) => y.score - x.score || y.product.featured - x.product.featured)
    .slice(0, limit);
}

export const useCaseLabel = (u: UseCase): string =>
  ({
    ciudad: 'Ciudad',
    trabajo: 'Trabajo',
    reparto: 'Reparto',
    ocio: 'Ocio',
    'trayectos-largos': 'Trayectos largos',
    'dos-personas': 'Dos personas',
    carga: 'Transporte de carga',
  })[u];
