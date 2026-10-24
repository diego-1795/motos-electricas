import type { Availability, CategorySlug, Product, UseCase } from './types';
import { effectiveSpecs, fromPrice, maxRange, productAvailability } from './product';

export type SortKey = 'recomendados' | 'precio-asc' | 'precio-desc' | 'autonomia' | 'potencia' | 'novedades';

export interface CatalogFilters {
  priceMax?: number; // céntimos
  rangeMin?: number;
  speedMin?: number;
  powerMin?: number;
  batteryKwhMin?: number;
  seats?: number;
  useCase?: UseCase;
  availability?: Availability;
  type?: CategorySlug;
}

export const sortLabels: Record<SortKey, string> = {
  recomendados: 'Recomendados',
  'precio-asc': 'Precio: menor a mayor',
  'precio-desc': 'Precio: mayor a menor',
  autonomia: 'Mayor autonomía',
  potencia: 'Mayor potencia',
  novedades: 'Novedades',
};

export function applyFilters(products: Product[], f: CatalogFilters): Product[] {
  return products.filter((p) => {
    const s = effectiveSpecs(p);
    if (f.type && p.category !== f.type) return false;
    if (f.priceMax !== undefined && fromPrice(p).amount > f.priceMax) return false;
    if (f.rangeMin !== undefined && maxRange(p) < f.rangeMin) return false;
    if (f.speedMin !== undefined && s.topSpeedKmh < f.speedMin) return false;
    if (f.powerMin !== undefined && s.powerW < f.powerMin) return false;
    if (f.batteryKwhMin !== undefined && s.battery.capacityKwh < f.batteryKwhMin) return false;
    if (f.seats !== undefined && s.seats < f.seats) return false;
    if (f.useCase && !p.useCases.includes(f.useCase)) return false;
    if (f.availability && productAvailability(p) !== f.availability) return false;
    return true;
  });
}

export function sortProducts(products: Product[], key: SortKey): Product[] {
  const arr = [...products];
  switch (key) {
    case 'precio-asc':
      return arr.sort((a, b) => fromPrice(a).amount - fromPrice(b).amount);
    case 'precio-desc':
      return arr.sort((a, b) => fromPrice(b).amount - fromPrice(a).amount);
    case 'autonomia':
      return arr.sort((a, b) => maxRange(b) - maxRange(a));
    case 'potencia':
      return arr.sort((a, b) => effectiveSpecs(b).powerW - effectiveSpecs(a).powerW);
    case 'novedades':
      return arr.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    default:
      return arr.sort((a, b) => b.featured - a.featured);
  }
}

/** Parsea filtros desde query string (datos no confiables) */
export function parseFilters(params: URLSearchParams): CatalogFilters & { sort: SortKey } {
  const num = (k: string) => {
    const v = Number(params.get(k));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const sortRaw = params.get('orden') ?? 'recomendados';
  const sort = (Object.keys(sortLabels) as SortKey[]).includes(sortRaw as SortKey) ? (sortRaw as SortKey) : 'recomendados';
  const use = params.get('uso') as UseCase | null;
  const avail = params.get('disponibilidad') as Availability | null;
  const type = params.get('tipo') as CategorySlug | null;
  return {
    priceMax: num('precio') ? num('precio')! * 100 : undefined,
    rangeMin: num('autonomia'),
    speedMin: num('velocidad'),
    powerMin: num('potencia') ? num('potencia')! * 1000 : undefined,
    batteryKwhMin: num('bateria'),
    seats: num('plazas'),
    useCase: use && USE_CASES.includes(use) ? use : undefined,
    availability: avail && AVAILABILITIES.includes(avail) ? avail : undefined,
    type: type && TYPES.includes(type) ? type : undefined,
    sort,
  };
}

export const USE_CASES: UseCase[] = ['ciudad', 'trabajo', 'reparto', 'ocio', 'trayectos-largos', 'dos-personas', 'carga'];
export const AVAILABILITIES: Availability[] = ['en-stock', 'bajo-pedido', 'proximamente', 'agotado'];
/** Tipos del catálogo RAIDEN (/productos, comparador, buscador, portada). Las promociones (edición EG Motors) van aparte en /promociones (ADR-017). */
export const TYPES: CategorySlug[] = ['bicimotos', 'trimotos'];

/** ¿Es un vehículo del catálogo RAIDEN? Excluye repuestos y promociones. */
export function isCatalogVehicle(p: Pick<Product, 'category'>): boolean {
  return TYPES.includes(p.category);
}
